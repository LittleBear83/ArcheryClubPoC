import { randomUUID } from "node:crypto";

const AUTH_REFERENCE_DOMAINS = new Set([
  "users",
  "user_types",
  "user_disciplines",
  "roles",
  "permissions",
  "role_permissions",
]);

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
    payload: row.payload_json ?? {},
  };
}

async function querySingleValue(client, sql, values = []) {
  const result = await client.query(sql, values);
  return result.rows[0] ?? null;
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
      const checkpointRow = await querySingleValue(
        snapshotClient,
        `SELECT COALESCE(MAX(change_id), 0) AS checkpoint FROM sync_change_log`,
      );

      return {
        checkpoint: Number(checkpointRow?.checkpoint ?? 0),
        snapshot: {
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
        [checkpoint, [...AUTH_REFERENCE_DOMAINS], limit],
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
            last_error
          FROM sync_local_outbox
          WHERE acknowledged_at IS NULL
            AND available_at <= NOW()
          ORDER BY created_at ASC
          LIMIT $1
        `,
        [limit],
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
        `,
      );

      return Number(row?.count ?? 0);
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
  };
}
