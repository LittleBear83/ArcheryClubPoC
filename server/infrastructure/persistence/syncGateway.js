import { randomUUID } from "node:crypto";
import {
  validateCoachingBookingEligibility,
  validateEventBookingEligibility,
} from "../../domain/services/scheduleBookingValidation.js";

const SYNCED_DOMAINS = new Set([
  "users",
  "user_types",
  "user_disciplines",
  "roles",
  "permissions",
  "role_permissions",
  "club_events",
  "coaching_sessions",
  "event_bookings",
  "coaching_session_bookings",
  "announcements",
  "equipment_storage_locations",
  "equipment_items",
]);

function hasScheduleEntryEnded(date, endTime) {
  if (!date || !endTime) {
    return false;
  }

  const endsAt = new Date(`${date}T${endTime}`);
  return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now();
}

function normalizeChangeRow(row) {
  return {
    changeId: Number(row.change_id ?? 0),
    changedAt: row.changed_at instanceof Date
      ? row.changed_at.toISOString()
      : String(row.changed_at ?? ""),
    domain: String(row.domain ?? ""),
    operation: String(row.operation ?? ""),
    payload: row.payload_json ?? null,
    recordKey: String(row.record_key ?? ""),
  };
}

function normalizeOutboxRow(row) {
  return {
    acknowledgedAt: row.acknowledged_at instanceof Date
      ? row.acknowledged_at.toISOString()
      : (row.acknowledged_at ? String(row.acknowledged_at) : null),
    aggregateKey: String(row.aggregate_key ?? ""),
    attemptCount: Number(row.attempt_count ?? 0),
    availableAt: row.available_at instanceof Date
      ? row.available_at.toISOString()
      : String(row.available_at ?? ""),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at ?? ""),
    eventId: String(row.event_id ?? ""),
    eventType: String(row.event_type ?? ""),
    lastAttemptedAt: row.last_attempted_at instanceof Date
      ? row.last_attempted_at.toISOString()
      : (row.last_attempted_at ? String(row.last_attempted_at) : null),
    lastError: row.last_error ?? null,
    outboxOrder: Number(row.outbox_order ?? 0),
    payload: row.payload_json ?? {},
    rejectedAt: row.rejected_at instanceof Date
      ? row.rejected_at.toISOString()
      : (row.rejected_at ? String(row.rejected_at) : null),
    rejectionCode: row.rejection_code ?? null,
    rejectionReason: row.rejection_reason ?? null,
  };
}

async function querySingleValue(client, sql, values = []) {
  const result = await client.query(sql, values);
  return result.rows[0] ?? null;
}

function normalizeBookingKey(syncId, username) {
  return `${String(syncId ?? "").trim()}:${String(username ?? "").trim().toLowerCase()}`;
}

function getBookingDomain(eventType) {
  if (eventType.startsWith("coaching_")) {
    return "coaching";
  }

  return "event";
}

function isBookingCreateEventType(eventType) {
  return eventType === "event_booking_created" || eventType === "coaching_booking_created";
}

function isBookingEventType(eventType) {
  return [
    "event_booking_created",
    "event_booking_withdrawn",
    "coaching_booking_created",
    "coaching_booking_withdrawn",
  ].includes(eventType);
}

async function insertCoachingBookingAtomically({
  client,
  bookedAtDate,
  bookedAtTime,
  sessionId,
  username,
}) {
  const session = await querySingleValue(
    client,
    `
      SELECT *
      FROM coaching_sessions
      WHERE id = $1
      FOR UPDATE
    `,
    [sessionId],
  );

  if (!session) {
    return {
      accepted: false,
      code: "coaching_session_not_found",
      reason: "The coaching session no longer exists.",
    };
  }

  const member = await querySingleValue(
    client,
    `
      SELECT id, active_member
      FROM users
      WHERE LOWER(username) = LOWER($1)
      LIMIT 1
    `,
    [username],
  );
  const eligibilityError = validateCoachingBookingEligibility({
    hasScheduleEntryEnded,
    member,
    session,
  });

  if (eligibilityError) {
    return {
      accepted: false,
      code: eligibilityError.code,
      reason: eligibilityError.reason,
    };
  }

  const existing = await querySingleValue(
    client,
    `
      SELECT 1
      FROM coaching_session_bookings
      WHERE coaching_session_id = $1
        AND member_username = $2
      LIMIT 1
    `,
    [sessionId, username],
  );

  if (existing) {
    return { accepted: true };
  }

  const countRow = await querySingleValue(
    client,
    `
      SELECT COUNT(*)::int AS count
      FROM coaching_session_bookings
      WHERE coaching_session_id = $1
    `,
    [sessionId],
  );

  if (Number(countRow?.count ?? 0) >= Number(session.available_slots ?? 0)) {
    return {
      accepted: false,
      code: "coaching_session_full",
      reason: "The coaching session is full.",
    };
  }

  await client.query(
    `
      INSERT INTO coaching_session_bookings (
        coaching_session_id,
        member_username,
        booked_at_date,
        booked_at_time,
        member_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [sessionId, username, bookedAtDate, bookedAtTime, member.id],
  );

  return { accepted: true };
}

export function createSyncGateway({ pool }) {
  return {
    pool,
    async acquireSyncLock(client, lockId = 81420731) {
      const result = await client.query(
        `SELECT pg_try_advisory_lock($1) AS acquired`,
        [lockId],
      );

      return Boolean(result.rows[0]?.acquired);
    },
    async releaseSyncLock(client, lockId = 81420731) {
      await client.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
    },
    async enqueueLoginEvent({
      client = pool,
      eventId = randomUUID(),
      loggedInDate,
      loggedInTime,
      loginMethod,
      machineId,
      sourceNodeMode,
      username,
    }) {
      const ownsClient = typeof client.connect === "function";
      const queryClient = ownsClient ? await client.connect() : client;

      try {
        if (ownsClient) {
          await queryClient.query("BEGIN");
        }

        await queryClient.query(
          `
            INSERT INTO login_events (
              username,
              user_id,
              login_method,
              logged_in_date,
              logged_in_time,
              sync_event_id,
              sync_source_machine_id
            )
            VALUES (
              $1,
              (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
              $2,
              $3,
              $4,
              $5,
              $6
            )
            ON CONFLICT (sync_event_id) DO NOTHING
          `,
          [
            username,
            loginMethod,
            loggedInDate,
            loggedInTime,
            eventId,
            machineId || null,
          ],
        );

        if (sourceNodeMode === "local-pi" && machineId) {
          await queryClient.query(
            `
              INSERT INTO sync_local_outbox (
                event_id,
                event_type,
                aggregate_key,
                payload_json
              )
              VALUES ($1, $2, $3, $4::jsonb)
              ON CONFLICT (event_id) DO NOTHING
            `,
            [
              eventId,
              "login_event",
              username,
              JSON.stringify({
                eventId,
                loggedInDate,
                loggedInTime,
                loginMethod,
                machineId,
                username,
              }),
            ],
          );
        }

        if (ownsClient) {
          await queryClient.query("COMMIT");
        }
      } catch (error) {
        if (ownsClient) {
          await queryClient.query("ROLLBACK");
        }
        throw error;
      } finally {
        if (ownsClient) {
          queryClient.release();
        }
      }

      return eventId;
    },
    async getAuthSnapshot(client = pool) {
      const snapshotClient = client;
      const users = await snapshotClient.query(
        `
          SELECT
            username,
            first_name,
            surname,
            gr_id,
            archery_gb_membership_number,
            email_address,
            password,
            rfid_tag,
            active_member,
            affiliate_member,
            junior_member,
            membership_fees_due,
            coaching_volunteer,
            membership_status,
            programme_type
          FROM users
          ORDER BY username ASC
        `,
      );
      const userTypes = await snapshotClient.query(
        `
          SELECT username, user_type
          FROM user_types
          ORDER BY username ASC
        `,
      );
      const userDisciplines = await snapshotClient.query(
        `
          SELECT username, discipline
          FROM user_disciplines
          ORDER BY username ASC, discipline ASC
        `,
      );
      const roles = await snapshotClient.query(
        `
          SELECT role_key, title, is_system
          FROM roles
          ORDER BY role_key ASC
        `,
      );
      const permissions = await snapshotClient.query(
        `
          SELECT permission_key, label, description
          FROM permissions
          ORDER BY permission_key ASC
        `,
      );
      const rolePermissions = await snapshotClient.query(
        `
          SELECT role_key, permission_key
          FROM role_permissions
          ORDER BY role_key ASC, permission_key ASC
        `,
      );
      const clubEvents = await snapshotClient.query(
        `SELECT * FROM club_events ORDER BY event_date ASC, start_time ASC`,
      );
      const coachingSessions = await snapshotClient.query(
        `SELECT * FROM coaching_sessions ORDER BY session_date ASC, start_time ASC`,
      );
      const eventBookings = await snapshotClient.query(
        `
          SELECT
            club_events.sync_id AS parent_sync_id,
            event_bookings.member_username,
            event_bookings.booked_at_date,
            event_bookings.booked_at_time
          FROM event_bookings
          INNER JOIN club_events ON club_events.id = event_bookings.club_event_id
          ORDER BY club_events.sync_id ASC, event_bookings.member_username ASC
        `,
      );
      const coachingSessionBookings = await snapshotClient.query(
        `
          SELECT
            coaching_sessions.sync_id AS parent_sync_id,
            coaching_session_bookings.member_username,
            coaching_session_bookings.booked_at_date,
            coaching_session_bookings.booked_at_time
          FROM coaching_session_bookings
          INNER JOIN coaching_sessions
            ON coaching_sessions.id = coaching_session_bookings.coaching_session_id
          ORDER BY coaching_sessions.sync_id ASC, coaching_session_bookings.member_username ASC
        `,
      );
      const announcements = await snapshotClient.query(
        `SELECT * FROM announcements ORDER BY id ASC`,
      );
      const equipmentStorageLocations = await snapshotClient.query(
        `SELECT * FROM equipment_storage_locations ORDER BY sync_id ASC`,
      );
      const equipmentItems = await snapshotClient.query(
        `
          SELECT
            equipment_items.*,
            cases.sync_id AS location_case_sync_id
          FROM equipment_items
          LEFT JOIN equipment_items AS cases ON cases.id = equipment_items.location_case_id
          ORDER BY equipment_items.sync_id ASC
        `,
      );
      const checkpointRow = await querySingleValue(
        snapshotClient,
        `SELECT COALESCE(MAX(change_id), 0) AS checkpoint FROM sync_change_log`,
      );

      return {
        checkpoint: Number(checkpointRow?.checkpoint ?? 0),
        snapshot: {
          announcements: announcements.rows,
          clubEvents: clubEvents.rows,
          coachingSessionBookings: coachingSessionBookings.rows,
          coachingSessions: coachingSessions.rows,
          equipmentItems: equipmentItems.rows,
          equipmentStorageLocations: equipmentStorageLocations.rows,
          eventBookings: eventBookings.rows,
          permissions: permissions.rows,
          rolePermissions: rolePermissions.rows,
          roles: roles.rows,
          userDisciplines: userDisciplines.rows,
          userTypes: userTypes.rows,
          users: users.rows,
        },
      };
    },
    async listChangesAfterCheckpoint({
      checkpoint,
      client = pool,
      limit = 500,
    }) {
      const result = await client.query(
        `
          SELECT
            change_id,
            domain,
            record_key,
            operation,
            payload_json,
            changed_at
          FROM sync_change_log
          WHERE change_id > $1
            AND domain = ANY($2::text[])
          ORDER BY change_id ASC
          LIMIT $3
        `,
        [checkpoint, [...SYNCED_DOMAINS], limit],
      );

      return result.rows.map(normalizeChangeRow);
    },
    async getLatestCheckpoint(client = pool) {
      const row = await querySingleValue(
        client,
        `SELECT COALESCE(MAX(change_id), 0) AS checkpoint FROM sync_change_log`,
      );

      return Number(row?.checkpoint ?? 0);
    },
    async listPendingOutboxEvents({ client = pool, limit = 100 } = {}) {
      const result = await client.query(
        `
          SELECT
            event_id,
            event_type,
            aggregate_key,
            payload_json,
            created_at,
            available_at,
            last_attempted_at,
            acknowledged_at,
            attempt_count,
            last_error,
            rejected_at,
            rejection_code,
            rejection_reason,
            outbox_order
          FROM sync_local_outbox
          WHERE acknowledged_at IS NULL
            AND rejected_at IS NULL
            AND available_at <= NOW()
          ORDER BY outbox_order ASC, created_at ASC, event_id ASC
          LIMIT $1
        `,
        [limit],
      );

      return result.rows.map(normalizeOutboxRow);
    },
    async listPendingBookingOverlayCommands({ client = pool } = {}) {
      const result = await client.query(
        `
          SELECT
            event_id,
            event_type,
            aggregate_key,
            payload_json,
            created_at,
            available_at,
            last_attempted_at,
            acknowledged_at,
            attempt_count,
            last_error,
            rejected_at,
            rejection_code,
            rejection_reason,
            outbox_order
          FROM sync_local_outbox
          WHERE acknowledged_at IS NULL
            AND rejected_at IS NULL
            AND event_type IN (
              'event_booking_created',
              'event_booking_withdrawn',
              'coaching_booking_created',
              'coaching_booking_withdrawn'
            )
          ORDER BY outbox_order ASC, created_at ASC, event_id ASC
        `,
      );

      return result.rows.map(normalizeOutboxRow);
    },
    async acknowledgeOutboxEvents({ client = pool, eventIds = [] }) {
      if (eventIds.length === 0) {
        return;
      }

      await client.query(
        `
          UPDATE sync_local_outbox
          SET
            acknowledged_at = NOW(),
            last_attempted_at = NOW(),
            attempt_count = attempt_count + 1,
            last_error = NULL
          WHERE event_id = ANY($1::text[])
        `,
        [eventIds],
      );
    },
    async rejectOutboxEvents({ client = pool, rejections = [] }) {
      for (const rejection of rejections) {
        const updatedRow = await querySingleValue(
          client,
          `
            UPDATE sync_local_outbox
            SET
              rejected_at = COALESCE(rejected_at, NOW()),
              last_attempted_at = NOW(),
              attempt_count = attempt_count + 1,
              rejection_code = $2,
              rejection_reason = $3,
              last_error = NULL
            WHERE event_id = $1
              AND acknowledged_at IS NULL
            RETURNING event_type, payload_json, aggregate_key, outbox_order
          `,
          [
            rejection.eventId,
            rejection.code ?? "rejected",
            rejection.reason ?? "Command rejected by cloud",
          ],
        );

        if (!updatedRow || !isBookingEventType(updatedRow.event_type)) {
          continue;
        }

        const syncId = updatedRow.payload_json?.syncId;
        const username = updatedRow.payload_json?.username;

        if (!syncId || !username || !isBookingCreateEventType(updatedRow.event_type)) {
          continue;
        }

        if (getBookingDomain(updatedRow.event_type) === "coaching") {
          await client.query(
            `
              DELETE FROM coaching_session_bookings
              WHERE coaching_session_id = (
                SELECT id
                FROM coaching_sessions
                WHERE sync_id = $1
                LIMIT 1
              )
                AND member_username = $2
                AND NOT EXISTS (
                  SELECT 1
                  FROM sync_local_outbox
                  WHERE aggregate_key = $3
                    AND outbox_order > $4
                )
            `,
            [syncId, username, updatedRow.aggregate_key, updatedRow.outbox_order],
          );
        } else {
          await client.query(
            `
              DELETE FROM event_bookings
              WHERE club_event_id = (
                SELECT id
                FROM club_events
                WHERE sync_id = $1
                LIMIT 1
              )
                AND member_username = $2
                AND NOT EXISTS (
                  SELECT 1
                  FROM sync_local_outbox
                  WHERE aggregate_key = $3
                    AND outbox_order > $4
                )
            `,
            [syncId, username, updatedRow.aggregate_key, updatedRow.outbox_order],
          );
        }
      }
    },
    async recordOutboxFailure({ client = pool, errorMessage, eventIds = [] }) {
      if (eventIds.length === 0) {
        return;
      }

      await client.query(
        `
          UPDATE sync_local_outbox
          SET
            last_attempted_at = NOW(),
            attempt_count = attempt_count + 1,
            last_error = $2
          WHERE event_id = ANY($1::text[])
        `,
        [eventIds, errorMessage],
      );
    },
    async countPendingOutboxEvents(client = pool) {
      const row = await querySingleValue(
        client,
        `
          SELECT COUNT(*) AS count
          FROM sync_local_outbox
          WHERE acknowledged_at IS NULL
            AND rejected_at IS NULL
        `,
      );

      return Number(row?.count ?? 0);
    },
    async countRejectedOutboxEvents(client = pool) {
      const row = await querySingleValue(
        client,
        `
          SELECT COUNT(*) AS count
          FROM sync_local_outbox
          WHERE rejected_at IS NOT NULL
        `,
      );

      return Number(row?.count ?? 0);
    },
    async listRecentRejectedOutboxEvents({ client = pool, limit = 10 } = {}) {
      const result = await client.query(
        `
          SELECT
            event_id,
            event_type,
            aggregate_key,
            payload_json,
            created_at,
            available_at,
            last_attempted_at,
            acknowledged_at,
            attempt_count,
            last_error,
            rejected_at,
            rejection_code,
            rejection_reason,
            outbox_order
          FROM sync_local_outbox
          WHERE rejected_at IS NOT NULL
          ORDER BY rejected_at DESC, outbox_order DESC
          LIMIT $1
        `,
        [limit],
      );

      return result.rows.map(normalizeOutboxRow);
    },
    async readLocalState(stateKey, client = pool) {
      const result = await client.query(
        `
          SELECT state_json, updated_at
          FROM sync_local_state
          WHERE state_key = $1
          LIMIT 1
        `,
        [stateKey],
      );
      const row = result.rows[0] ?? null;

      return row
        ? {
            state: row.state_json ?? {},
            updatedAt: row.updated_at instanceof Date
              ? row.updated_at.toISOString()
              : String(row.updated_at ?? ""),
          }
        : null;
    },
    async writeLocalState({ client = pool, state, stateKey }) {
      await client.query(
        `
          INSERT INTO sync_local_state (state_key, state_json, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (state_key) DO UPDATE SET
            state_json = EXCLUDED.state_json,
            updated_at = EXCLUDED.updated_at
        `,
        [stateKey, JSON.stringify(state ?? {})],
      );
    },
    async upsertLoginEventFromSync({
      client = pool,
      eventId,
      loggedInDate,
      loggedInTime,
      loginMethod,
      machineId,
      username,
    }) {
      await client.query(
        `
          INSERT INTO login_events (
            username,
            user_id,
            login_method,
            logged_in_date,
            logged_in_time,
            sync_event_id,
            sync_source_machine_id
          )
          VALUES (
            $1,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
            $2,
            $3,
            $4,
            $5,
            $6
          )
          ON CONFLICT (sync_event_id) DO NOTHING
        `,
        [
          username,
          loginMethod,
          loggedInDate,
          loggedInTime,
          eventId,
          machineId,
        ],
      );
    },
    async processBookingCommand({ client = pool, event, machineId }) {
      const prior = await querySingleValue(
        client,
        `SELECT outcome_json FROM sync_received_commands WHERE event_id = $1`,
        [event.eventId],
      );

      if (prior) {
        return prior.outcome_json;
      }

      const isCoaching = getBookingDomain(event.eventType) === "coaching";
      const isWithdrawal = event.eventType.endsWith("withdrawn");
      const syncId = event.payload?.syncId;
      const username = event.payload?.username;
      let outcome;

      if (typeof syncId !== "string" || typeof username !== "string") {
        outcome = {
          accepted: false,
          code: "malformed_booking_command",
          reason: "A master sync ID and member username are required.",
        };
      } else if (!isWithdrawal && (
        typeof event.payload?.bookedAtDate !== "string"
        || typeof event.payload?.bookedAtTime !== "string"
      )) {
        outcome = {
          accepted: false,
          code: "malformed_booking_command",
          reason: "Booking create commands require booked-at date and time.",
        };
      } else if (isCoaching) {
        const session = await querySingleValue(
          client,
          `SELECT * FROM coaching_sessions WHERE sync_id = $1 LIMIT 1`,
          [syncId],
        );

        if (!session) {
          outcome = isWithdrawal
            ? { accepted: true }
            : {
                accepted: false,
                code: "coaching_session_not_found",
                reason: "The coaching session no longer exists.",
              };
        } else if (isWithdrawal) {
          await client.query(
            `
              DELETE FROM coaching_session_bookings
              WHERE coaching_session_id = $1
                AND member_username = $2
            `,
            [session.id, username],
          );
          outcome = { accepted: true };
        } else {
          outcome = await insertCoachingBookingAtomically({
            bookedAtDate: event.payload.bookedAtDate,
            bookedAtTime: event.payload.bookedAtTime,
            client,
            sessionId: session.id,
            username,
          });
        }
      } else {
        const parent = await querySingleValue(
          client,
          `SELECT * FROM club_events WHERE sync_id = $1 LIMIT 1`,
          [syncId],
        );

        if (!parent) {
          outcome = isWithdrawal
            ? { accepted: true }
            : {
                accepted: false,
                code: "event_not_found",
                reason: "The event no longer exists.",
              };
        } else if (isWithdrawal) {
          await client.query(
            `
              DELETE FROM event_bookings
              WHERE club_event_id = $1
                AND member_username = $2
            `,
            [parent.id, username],
          );
          outcome = { accepted: true };
        } else {
          const member = await querySingleValue(
            client,
            `
              SELECT id, active_member
              FROM users
              WHERE LOWER(username) = LOWER($1)
              LIMIT 1
            `,
            [username],
          );
          const eligibilityError = validateEventBookingEligibility({
            event: parent,
            hasScheduleEntryEnded,
            member,
          });

          if (eligibilityError) {
            outcome = {
              accepted: false,
              code: eligibilityError.code,
              reason: eligibilityError.reason,
            };
          } else {
            await client.query(
              `
                INSERT INTO event_bookings (
                  club_event_id,
                  member_username,
                  booked_at_date,
                  booked_at_time,
                  member_user_id
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (club_event_id, member_username) DO NOTHING
              `,
              [
                parent.id,
                username,
                event.payload.bookedAtDate,
                event.payload.bookedAtTime,
                member.id,
              ],
            );
            outcome = { accepted: true };
          }
        }
      }

      await client.query(
        `
          INSERT INTO sync_received_commands (
            event_id,
            event_type,
            machine_id,
            outcome_json
          )
          VALUES ($1, $2, $3, $4::jsonb)
          ON CONFLICT (event_id) DO NOTHING
        `,
        [event.eventId, event.eventType, machineId, JSON.stringify(outcome)],
      );

      const stored = await querySingleValue(
        client,
        `SELECT outcome_json FROM sync_received_commands WHERE event_id = $1`,
        [event.eventId],
      );

      return stored?.outcome_json ?? outcome;
    },
    normalizeBookingKey,
  };
}
