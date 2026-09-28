import { randomUUID } from "node:crypto";
import { processFeedbackCreateCommand, processFeedbackUpdateCommand } from "./feedbackSyncCommand.js";
import { normalizeRfidTag, rfidTagsEqual } from "../../domain/services/memberPersistenceService.js";
import { notifyLocalSyncApplied } from "./localSyncBrowserBridge.js";
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
  "login_events",
  "guest_login_events",
  "range_presence_extensions",
  "beginners_courses",
  "beginners_course_participants",
  "beginners_course_lessons",
  "beginners_course_lesson_coaches",
  "golden_records_member_sync",
  "golden_records_integration_status",
  "golden_records_lookup_cache",
  "outdoor_table_entries",
  "member_distance_sign_offs",
  "committee_roles",
  "committee_meeting_minutes",
  "member_questions",
  "suggestions",
  "tournament_templates",
  "tournaments",
  "tournament_registrations",
  "tournament_rounds",
  "tournament_matches",
  "tournament_scores",
  "tournament_handicap_tables",
  "tournament_handicap_table_rows",
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

function isPresenceEventType(eventType) {
  return eventType === "range_presence_extension_upsert";
}

function normalizeNullableText(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
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
    processFeedbackCreateCommand({ client = pool, event, machineId }) {
      return processFeedbackCreateCommand({ client, event, machineId });
    },
    processFeedbackUpdateCommand({ client = pool, event, machineId }) {
      return processFeedbackUpdateCommand({ client, event, machineId });
    },
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
    async enqueueGuestLoginEvent({
      client = pool,
      eventId = randomUUID(),
      firstName,
      surname,
      archeryGbMembershipNumber,
      invitedByUsername,
      invitedByName,
      paymentMethod,
      loggedInDate,
      loggedInTime,
      machineId,
      sourceNodeMode,
    }) {
      const ownsClient = typeof client.connect === "function";
      const queryClient = ownsClient ? await client.connect() : client;

      try {
        if (ownsClient) {
          await queryClient.query("BEGIN");
        }

        await queryClient.query(
          `
            INSERT INTO guest_login_events (
              first_name,
              surname,
              archery_gb_membership_number,
              invited_by_username,
              invited_by_name,
              payment_method,
              invited_by_user_id,
              logged_in_date,
              logged_in_time,
              sync_event_id,
              sync_source_machine_id
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1),
              $7,
              $8,
              $9,
              $10
            )
            ON CONFLICT (sync_event_id) DO NOTHING
          `,
          [
            firstName,
            surname,
            archeryGbMembershipNumber,
            invitedByUsername ?? null,
            invitedByName ?? null,
            paymentMethod,
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
              "guest_login_event",
              `${String(surname).trim().toLowerCase()}:${loggedInDate}:${loggedInTime}`,
              JSON.stringify({
                archeryGbMembershipNumber,
                eventId,
                firstName,
                invitedByName: invitedByName ?? "",
                invitedByUsername: invitedByUsername ?? "",
                loggedInDate,
                loggedInTime,
                paymentMethod,
                surname,
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
    async enqueueRangePresenceExtensionCommand({
      activeUntilDate,
      activeUntilTime,
      client = pool,
      eventId = randomUUID(),
      expectedVersion,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername,
      username,
    }) {
      const queryClient = await client.connect();

      try {
        await queryClient.query("BEGIN");

        const pending = await querySingleValue(
          queryClient,
          `
            SELECT event_id
            FROM sync_local_outbox
            WHERE aggregate_key = $1
              AND event_type = 'range_presence_extension_upsert'
              AND acknowledged_at IS NULL
              AND rejected_at IS NULL
            LIMIT 1
          `,
          [String(username).trim().toLowerCase()],
        );

        if (pending) {
          await queryClient.query("ROLLBACK");
          return {
            accepted: false,
            code: "presence_update_pending",
            reason: "A previous range presence update is still waiting to sync.",
          };
        }

        const previousState = await querySingleValue(
          queryClient,
          `
            SELECT
              active_until_date,
              active_until_time,
              sync_version,
              updated_at_date,
              updated_at_time,
              updated_by_username
            FROM range_presence_extensions
            WHERE LOWER(username) = LOWER($1)
            LIMIT 1
          `,
          [username],
        );

        await queryClient.query(
          `
            INSERT INTO range_presence_extensions (
              username,
              active_until_date,
              active_until_time,
              updated_by_username,
              updated_at_date,
              updated_at_time,
              sync_version
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (username) DO UPDATE SET
              active_until_date = EXCLUDED.active_until_date,
              active_until_time = EXCLUDED.active_until_time,
              updated_by_username = EXCLUDED.updated_by_username,
              updated_at_date = EXCLUDED.updated_at_date,
              updated_at_time = EXCLUDED.updated_at_time
          `,
          [
            username,
            activeUntilDate,
            activeUntilTime,
            updatedByUsername,
            updatedAtDate,
            updatedAtTime,
            Number(previousState?.sync_version ?? expectedVersion ?? 0),
          ],
        );

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
            "range_presence_extension_upsert",
            String(username).trim().toLowerCase(),
            JSON.stringify({
              activeUntilDate,
              activeUntilTime,
              eventId,
              expectedVersion,
              previousState: previousState
                ? {
                    activeUntilDate: previousState.active_until_date,
                    activeUntilTime: previousState.active_until_time,
                    syncVersion: Number(previousState.sync_version ?? 0),
                    updatedAtDate: previousState.updated_at_date,
                    updatedAtTime: previousState.updated_at_time,
                    updatedByUsername: previousState.updated_by_username,
                  }
                : null,
              updatedAtDate,
              updatedAtTime,
              updatedByUsername,
              username,
            }),
          ],
        );

        await queryClient.query("COMMIT");
        return { accepted: true, eventId };
      } catch (error) {
        await queryClient.query("ROLLBACK");
        throw error;
      } finally {
        queryClient.release();
      }
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
      const memberDistanceSignOffs = await snapshotClient.query(
        `
          SELECT
            username,
            discipline,
            distance_yards,
            signed_off_by_username,
            source,
            signed_off_at_date,
            signed_off_at_time
          FROM member_distance_sign_offs
          ORDER BY
            LOWER(username) ASC,
            LOWER(discipline) ASC,
            distance_yards ASC
        `,
      );
      const committeeMeetingMinutes = await snapshotClient.query(
        `
          SELECT
            sync_id,
            meeting_date,
            title,
            sections_json,
            actions_json,
            created_at_date,
            created_at_time,
            updated_at_date,
            updated_at_time,
            updated_by_username
          FROM committee_meeting_minutes
          ORDER BY meeting_date DESC, sync_id ASC
        `,
      );
      const memberQuestions = await snapshotClient.query(`
        SELECT sync_id, sync_version, sync_source_machine_id, sync_origin_event_id,
          submitted_by_username, question_title, question_body, status,
          response_text, member_seen_response, created_at_date, created_at_time,
          responded_at_date, responded_at_time, responded_by_username,
          updated_at_date, updated_at_time
        FROM member_questions ORDER BY sync_id ASC
      `);
      const suggestions = await snapshotClient.query(`
        SELECT sync_id, sync_version, sync_source_machine_id, sync_origin_event_id,
          submitted_by_username, submitted_by_name, is_anonymous,
          suggestion_title, improvement_text, suggestion_details, status,
          resolution_note, created_at_date, created_at_time,
          updated_at_date, updated_at_time, updated_by_username
        FROM suggestions ORDER BY sync_id ASC
      `);

      const committeeRoles = await snapshotClient.query(
        `
          SELECT
            role_key,
            title,
            summary,
            responsibilities,
            personal_blurb,
            photo_data_url,
            display_order,
            assigned_username
          FROM committee_roles
          ORDER BY display_order ASC, role_key ASC
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
      const loginEvents = await snapshotClient.query(
        `
          SELECT *
          FROM login_events
          ORDER BY logged_in_date ASC, logged_in_time ASC, id ASC
        `,
      );
      const guestLoginEvents = await snapshotClient.query(
        `
          SELECT *
          FROM guest_login_events
          ORDER BY logged_in_date ASC, logged_in_time ASC, id ASC
        `,
      );
      const rangePresenceExtensions = await snapshotClient.query(
        `
          SELECT *
          FROM range_presence_extensions
          ORDER BY username ASC
        `,
      );
      const beginnersCourses = await snapshotClient.query(
        `
          SELECT
            sync_id, course_type, coordinator_username, submitted_by_username,
            first_lesson_date, start_time, end_time, lesson_count, beginner_capacity,
            approval_status, is_cancelled, cancellation_reason, cancelled_by_username,
            cancelled_at_date, cancelled_at_time, rejection_reason, approved_by_username,
            approved_at_date, approved_at_time, created_at_date, created_at_time
          FROM beginners_courses
          ORDER BY first_lesson_date ASC, start_time ASC, id ASC
        `,
      );
      const beginnersCourseParticipants = await snapshotClient.query(
        `
          SELECT
            participants.sync_id,
            participants.username, participants.first_name, participants.surname,
            participants.beginner_size_category, participants.height_text,
            participants.draw_length, participants.handedness, participants.eye_dominance,
            participants.initial_email_sent, participants.thirty_day_reminder_sent,
            participants.course_fee_paid, participants.origin_course_type,
            participants.converted_to_member, participants.converted_at_date,
            participants.converted_at_time, participants.converted_by_username,
            participants.assigned_case_by_username, participants.assigned_case_at_date,
            participants.assigned_case_at_time, participants.created_at_date,
            participants.created_at_time, participants.created_by_username,
            courses.sync_id AS course_sync_id,
            origin_courses.sync_id AS origin_course_sync_id,
            assigned_case.sync_id AS assigned_case_sync_id
          FROM beginners_course_participants AS participants
          INNER JOIN beginners_courses AS courses
            ON courses.id = participants.course_id
          LEFT JOIN beginners_courses AS origin_courses
            ON origin_courses.id = participants.origin_course_id
          LEFT JOIN equipment_items AS assigned_case
            ON assigned_case.id = participants.assigned_case_id
          ORDER BY participants.course_id ASC, participants.surname ASC, participants.first_name ASC, participants.id ASC
        `,
      );
      const beginnersCourseLessons = await snapshotClient.query(
        `
          SELECT lessons.sync_id, lessons.lesson_number, lessons.lesson_date,
            lessons.start_time, lessons.end_time, lessons.is_cancelled, courses.sync_id AS course_sync_id
          FROM beginners_course_lessons AS lessons
          INNER JOIN beginners_courses AS courses ON courses.id = lessons.course_id
          ORDER BY courses.sync_id ASC, lessons.lesson_number ASC
        `,
      );
      const beginnersCourseLessonCoaches = await snapshotClient.query(
        `
          SELECT coaches.coach_username, coaches.assigned_by_username,
            coaches.assigned_at_date, coaches.assigned_at_time,
            lessons.sync_id AS lesson_sync_id
          FROM beginners_course_lesson_coaches AS coaches
          INNER JOIN beginners_course_lessons AS lessons ON lessons.id = coaches.lesson_id
          ORDER BY lessons.sync_id ASC, coaches.coach_username ASC
        `,
      );
      const goldenRecordsMemberSync = await snapshotClient.query(
        `
          SELECT *
          FROM golden_records_member_sync
          ORDER BY username ASC
        `,
      );
      const goldenRecordsIntegrationStatus = await snapshotClient.query(
        `
          SELECT *
          FROM golden_records_integration_status
          ORDER BY status_key ASC
        `,
      );
      const goldenRecordsLookupCache = await snapshotClient.query(
        `
          SELECT *
          FROM golden_records_lookup_cache
          ORDER BY lookup_type ASC
        `,
      );
      const outdoorTableEntries = await snapshotClient.query(
        `
          SELECT *
          FROM outdoor_table_entries
          ORDER BY season_year ASC, archer_username ASC, bow_type ASC
        `,
      );
      const tournamentTemplates = await snapshotClient.query(`
        SELECT template_key, label, description, tournament_type, format, round_type,
          defaults_json, capabilities_json, eligibility_rules_json, created_by,
          created_at_date, created_at_time
        FROM tournament_templates ORDER BY template_key ASC
      `);
      const tournamentHandicapTables = await snapshotClient.query(`
        SELECT table_key, title, description, allowance_percent, is_editable,
          updated_at_date, updated_at_time, updated_by_username
        FROM tournament_handicap_tables ORDER BY table_key ASC
      `);
      const tournamentHandicapTableRows = await snapshotClient.query(`
        SELECT tables.table_key, rows.handicap_value, rows.reference_score, rows.display_order
        FROM tournament_handicap_table_rows AS rows
        INNER JOIN tournament_handicap_tables AS tables ON tables.id = rows.table_id
        ORDER BY tables.table_key ASC, rows.handicap_value ASC
      `);
      const tournaments = await snapshotClient.query(`
        SELECT sync_id, name, tournament_type, template_key, template_definition_json,
          draw_date, round_schedule_json, registration_start_date, registration_end_date,
          score_submission_start_date, score_submission_end_date, created_by,
          created_at_date, created_at_time
        FROM tournaments ORDER BY sync_id ASC
      `);
      const tournamentRegistrations = await snapshotClient.query(`
        SELECT tournaments.sync_id AS tournament_sync_id, registrations.member_username,
          registrations.bow_code, registrations.registered_at_date, registrations.registered_at_time
        FROM tournament_registrations AS registrations
        INNER JOIN tournaments ON tournaments.id = registrations.tournament_id
        ORDER BY tournaments.sync_id ASC, LOWER(registrations.member_username) ASC
      `);
      const tournamentRounds = await snapshotClient.query(`
        SELECT tournaments.sync_id AS tournament_sync_id, rounds.round_number, rounds.title,
          rounds.publish_date, rounds.submission_deadline, rounds.status
        FROM tournament_rounds AS rounds
        INNER JOIN tournaments ON tournaments.id = rounds.tournament_id
        ORDER BY tournaments.sync_id ASC, rounds.round_number ASC
      `);
      const tournamentScores = await snapshotClient.query(`
        SELECT tournaments.sync_id AS tournament_sync_id, scores.round_number,
          scores.member_username, scores.score, scores.submitted_at_date, scores.submitted_at_time
        FROM tournament_scores AS scores
        INNER JOIN tournaments ON tournaments.id = scores.tournament_id
        ORDER BY tournaments.sync_id ASC, scores.round_number ASC, LOWER(scores.member_username) ASC
      `);
      const tournamentMatches = await snapshotClient.query(`
        SELECT tournaments.sync_id AS tournament_sync_id, matches.round_number,
          matches.match_number, matches.left_member_username, matches.right_member_username,
          matches.left_score, matches.right_score, matches.winner_username,
          matches.submitted_by_username, matches.submitted_at_date, matches.submitted_at_time,
          matches.confirmed_by_username, matches.confirmed_at_date, matches.confirmed_at_time,
          matches.disputed_by_username, matches.disputed_at_date, matches.disputed_at_time,
          matches.dispute_reason, matches.handicap_allowance_percent,
          matches.left_handicap_value, matches.left_handicap_type,
          matches.left_handicap_bow_class, matches.left_handicap_discipline,
          matches.left_reference_score, matches.left_allowance_points,
          matches.left_adjusted_score, matches.left_handicap_table_key,
          matches.left_handicap_table_title, matches.right_handicap_value,
          matches.right_handicap_type, matches.right_handicap_bow_class,
          matches.right_handicap_discipline, matches.right_reference_score,
          matches.right_allowance_points, matches.right_adjusted_score,
          matches.right_handicap_table_key, matches.right_handicap_table_title, matches.status
        FROM tournament_matches AS matches
        INNER JOIN tournaments ON tournaments.id = matches.tournament_id
        ORDER BY tournaments.sync_id ASC, matches.round_number ASC, matches.match_number ASC
      `);

      const checkpointRow = await querySingleValue(
        snapshotClient,
        `SELECT COALESCE(MAX(change_id), 0) AS checkpoint FROM sync_change_log`,
      );

      return {
        checkpoint: Number(checkpointRow?.checkpoint ?? 0),
        snapshot: {
          announcements: announcements.rows,
          committeeRoles: committeeRoles.rows,
          committeeMeetingMinutes: committeeMeetingMinutes.rows,
          memberQuestions: memberQuestions.rows,
          suggestions: suggestions.rows,
          memberDistanceSignOffs: memberDistanceSignOffs.rows,
          clubEvents: clubEvents.rows,
          coachingSessionBookings: coachingSessionBookings.rows,
          coachingSessions: coachingSessions.rows,
          equipmentItems: equipmentItems.rows,
          equipmentStorageLocations: equipmentStorageLocations.rows,
          eventBookings: eventBookings.rows,
          guestLoginEvents: guestLoginEvents.rows,
          loginEvents: loginEvents.rows,
          rangePresenceExtensions: rangePresenceExtensions.rows,
          beginnersCourses: beginnersCourses.rows,
          beginnersCourseParticipants: beginnersCourseParticipants.rows,
          beginnersCourseLessons: beginnersCourseLessons.rows,
          beginnersCourseLessonCoaches: beginnersCourseLessonCoaches.rows,
          goldenRecordsMemberSync: goldenRecordsMemberSync.rows,
          goldenRecordsIntegrationStatus: goldenRecordsIntegrationStatus.rows,
          goldenRecordsLookupCache: goldenRecordsLookupCache.rows,
          outdoorTableEntries: outdoorTableEntries.rows,
          permissions: permissions.rows,
          rolePermissions: rolePermissions.rows,
          roles: roles.rows,
          userDisciplines: userDisciplines.rows,
          userTypes: userTypes.rows,
          users: users.rows,
          tournamentTemplates: tournamentTemplates.rows,
          tournamentHandicapTables: tournamentHandicapTables.rows,
          tournamentHandicapTableRows: tournamentHandicapTableRows.rows,
          tournaments: tournaments.rows,
          tournamentRegistrations: tournamentRegistrations.rows,
          tournamentRounds: tournamentRounds.rows,
          tournamentScores: tournamentScores.rows,
          tournamentMatches: tournamentMatches.rows,
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
    async listPendingOutboxEvents({ client = pool, includeUnavailable = false, limit = 100 } = {}) {
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
            ${includeUnavailable ? "" : "AND available_at <= NOW()"}
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
      if (rejections.length && client === pool && typeof pool.connect === "function") {
        const transaction = await pool.connect();
        try {
          await transaction.query("BEGIN");
          await this.rejectOutboxEvents({ client: transaction, rejections });
          await transaction.query("COMMIT");
        } catch (error) {
          await transaction.query("ROLLBACK");
          throw error;
        } finally { transaction.release(); }
        return;
      }
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

        if (!updatedRow) {
          continue;
        }

        if (["member_question_created", "suggestion_created"].includes(updatedRow.event_type)) {
          const domain = updatedRow.event_type === "member_question_created"
            ? "member_questions" : "suggestions";
          const syncId = updatedRow.payload_json?.sync_id;
          if (typeof syncId === "string" && syncId) {
            const removed = await client.query(
              `DELETE FROM ${domain} WHERE sync_id = $1 AND sync_origin_event_id = $2`,
              [syncId, rejection.eventId],
            );
            if (removed.rowCount > 0) await notifyLocalSyncApplied(client, [domain]);
          }
          continue;
        }

        if (updatedRow.event_type === "member_rfid_updated") {
          const payload = updatedRow.payload_json;
          const nullableTag = (value) => value === null || typeof value === "string";
          if (typeof payload?.username !== "string" || !nullableTag(payload.rfidTag)
            || !nullableTag(payload.previousRfidTag)) continue;
          const conflict = rejection.code === "member_rfid_conflict";
          if (conflict && !nullableTag(rejection.authoritativeRfidTag)) continue;
          if (!conflict && !["rfid_tag_in_use", "member_not_found", "malformed_member_rfid_update"].includes(rejection.code)) continue;
          const replacement = normalizeRfidTag(conflict ? rejection.authoritativeRfidTag : payload.previousRfidTag);
          if (replacement) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:rfid:${replacement.toLowerCase()}`]);
          // Lock the member before checking newer commands, so a profile save
          // cannot commit a newer assignment between the guard and compensation.
          await client.query("SELECT username FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE", [payload.username]);
          const owner = replacement ? await querySingleValue(client, `SELECT 1 FROM users
            WHERE LOWER(BTRIM(rfid_tag)) = LOWER($1) AND LOWER(username) <> LOWER($2) LIMIT 1`,
          [replacement, payload.username]) : null;
          // A chained optimistic assignment may have taken the rollback tag.
          // Fail closed instead of leaving the rejected credential active.
          const safeReplacement = owner ? null : replacement;
          const compensated = await client.query(`UPDATE users SET rfid_tag = $2
            WHERE LOWER(username) = LOWER($1)
              AND LOWER(NULLIF(BTRIM(rfid_tag), '')) IS NOT DISTINCT FROM LOWER($3::text)
              AND NOT EXISTS (SELECT 1 FROM sync_local_outbox
                WHERE event_type = 'member_rfid_updated' AND aggregate_key = $4 AND outbox_order > $5)`,
          [payload.username, safeReplacement, normalizeRfidTag(payload.rfidTag), updatedRow.aggregate_key, updatedRow.outbox_order]);
          if (compensated.rowCount > 0) await notifyLocalSyncApplied(client, ["users"]);
          continue;
        }

        if (isPresenceEventType(updatedRow.event_type)) {
          // A conflict means Cloud has a newer authoritative value. Leave the
          // optimistic row alone until the following pull replaces it.
          if (rejection.code === "range_presence_conflict") {
            continue;
          }
          const username = updatedRow.payload_json?.username;
          const previousState = updatedRow.payload_json?.previousState ?? null;

          if (!username) {
            continue;
          }

          if (previousState) {
            await client.query(
              `
                INSERT INTO range_presence_extensions (
                  username,
                  active_until_date,
                  active_until_time,
                  updated_by_username,
                  updated_at_date,
                  updated_at_time,
                  sync_version
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (username) DO UPDATE SET
                  active_until_date = EXCLUDED.active_until_date,
                  active_until_time = EXCLUDED.active_until_time,
                  updated_by_username = EXCLUDED.updated_by_username,
                  updated_at_date = EXCLUDED.updated_at_date,
                  updated_at_time = EXCLUDED.updated_at_time,
                  sync_version = EXCLUDED.sync_version
              `,
              [
                username,
                previousState.activeUntilDate,
                previousState.activeUntilTime,
                previousState.updatedByUsername,
                previousState.updatedAtDate,
                previousState.updatedAtTime,
                Number(previousState.syncVersion ?? 0),
              ],
            );
          } else {
            await client.query(
              `
                DELETE FROM range_presence_extensions
                WHERE LOWER(username) = LOWER($1)
              `,
              [username],
            );
          }
          continue;
        }

        if (!isBookingEventType(updatedRow.event_type)) {
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
      const existing = await querySingleValue(
        client,
        `
          SELECT id
          FROM login_events
          WHERE sync_event_id = $1
          LIMIT 1
        `,
        [eventId],
      );

      if (existing) {
        return;
      }

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
    async upsertGuestLoginEventFromSync({
      client = pool,
      eventId,
      firstName,
      surname,
      archeryGbMembershipNumber,
      invitedByUsername,
      invitedByName,
      paymentMethod,
      loggedInDate,
      loggedInTime,
      machineId,
    }) {
      const existing = await querySingleValue(
        client,
        `
          SELECT id
          FROM guest_login_events
          WHERE sync_event_id = $1
          LIMIT 1
        `,
        [eventId],
      );

      if (existing) {
        return;
      }

      await client.query(
        `
          INSERT INTO guest_login_events (
            first_name,
            surname,
            archery_gb_membership_number,
            invited_by_username,
            invited_by_name,
            payment_method,
            invited_by_user_id,
            logged_in_date,
            logged_in_time,
            sync_event_id,
            sync_source_machine_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1),
            $7,
            $8,
            $9,
            $10
          )
          ON CONFLICT (sync_event_id) DO NOTHING
        `,
        [
          firstName,
          surname,
          archeryGbMembershipNumber,
          invitedByUsername ?? null,
          invitedByName ?? null,
          paymentMethod,
          loggedInDate,
          loggedInTime,
          eventId,
          machineId ?? null,
        ],
      );
    },
    async enqueueMemberRfidUpdateCommand({ client, payload }) {
      await client.query(`INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
        VALUES ($1, 'member_rfid_updated', $2, $3::jsonb)`,
      [payload.eventId, payload.username.toLowerCase(), JSON.stringify(payload)]);
    },
    async processMemberRfidUpdateCommand({ client = pool, event, machineId }) {
      // All command processing uses the caller's push transaction. Serialize
      // replay before checking the durable outcome, including terminal failures.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:rfid-command:${event.eventId}`]);
      const prior = await querySingleValue(client,
        "SELECT outcome_json FROM sync_received_commands WHERE event_id = $1", [event.eventId]);
      if (prior) return prior.outcome_json;
      const payload = event.payload;
      const nullableTag = (value) => value === null || typeof value === "string";
      let outcome;
      if (!payload || typeof payload.username !== "string" || !payload.username.trim()
        || typeof payload.updatedByUsername !== "string" || !payload.updatedByUsername.trim()
        || typeof payload.eventId !== "string" || payload.eventId !== event.eventId
        || !nullableTag(payload.previousRfidTag) || !nullableTag(payload.rfidTag)) {
        outcome = { accepted: false, code: "malformed_member_rfid_update", reason: "RFID updates require a member, actor and valid expected and requested tags." };
      } else {
        const tag = normalizeRfidTag(payload.rfidTag);
        if (tag) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:rfid:${tag.toLowerCase()}`]);
        const member = await querySingleValue(client,
          "SELECT username, rfid_tag FROM users WHERE LOWER(username) = LOWER($1) FOR UPDATE", [payload.username.trim()]);
        if (!member) outcome = { accepted: false, code: "member_not_found", reason: "The member no longer exists in cloud." };
        else if (rfidTagsEqual(member.rfid_tag, tag)) outcome = { accepted: true };
        else if (!rfidTagsEqual(member.rfid_tag, payload.previousRfidTag)) {
          outcome = { accepted: false, code: "member_rfid_conflict",
            reason: "The member RFID assignment changed in cloud and must be refreshed.",
            authoritativeRfidTag: normalizeRfidTag(member.rfid_tag) };
        } else {
          const owner = tag ? await querySingleValue(client, `SELECT 1 FROM users
            WHERE LOWER(BTRIM(rfid_tag)) = LOWER($1) AND LOWER(username) <> LOWER($2) LIMIT 1`, [tag, member.username]) : null;
          if (owner) outcome = { accepted: false, code: "rfid_tag_in_use", reason: "That RFID tag is already assigned to another member." };
          else {
            await client.query("UPDATE users SET rfid_tag = $2 WHERE username = $1", [member.username, tag]);
            outcome = { accepted: true };
          }
        }
      }
      await client.query(`INSERT INTO sync_received_commands (event_id, event_type, machine_id, outcome_json)
        VALUES ($1, $2, $3, $4::jsonb)`, [event.eventId, event.eventType, machineId, JSON.stringify(outcome)]);
      return outcome;
    },
    async processRangePresenceCommand({ client = pool, event, machineId }) {
      const prior = await querySingleValue(
        client,
        `SELECT outcome_json FROM sync_received_commands WHERE event_id = $1`,
        [event.eventId],
      );

      if (prior) {
        return prior.outcome_json;
      }

      const payload = event.payload ?? {};
      const username = normalizeNullableText(payload.username);
      const updatedByUsername = normalizeNullableText(payload.updatedByUsername);
      const activeUntilDate = normalizeNullableText(payload.activeUntilDate);
      const activeUntilTime = normalizeNullableText(payload.activeUntilTime);
      const expectedVersion = Number(payload.expectedVersion);
      let outcome;

      if (
        !username
        || !updatedByUsername
        || !activeUntilDate
        || !activeUntilTime
        || !Number.isInteger(expectedVersion)
        || expectedVersion < 0
      ) {
        outcome = {
          accepted: false,
          code: "malformed_presence_command",
          reason: "Range presence updates require username, timestamps, and an expected version.",
        };
      } else {
        const current = await querySingleValue(
          client,
          `
            SELECT *
            FROM range_presence_extensions
            WHERE LOWER(username) = LOWER($1)
            LIMIT 1
            FOR UPDATE
          `,
          [username],
        );
        const currentVersion = Number(current?.sync_version ?? 0);

        if (currentVersion !== expectedVersion) {
          outcome = {
            accepted: false,
            code: "range_presence_conflict",
            reason: "The range presence extension is stale and must be refreshed from cloud state.",
          };
        } else {
          await client.query(
            `
              INSERT INTO range_presence_extensions (
                username,
                active_until_date,
                active_until_time,
                updated_by_username,
                updated_at_date,
                updated_at_time,
                sync_version
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (username) DO UPDATE SET
                active_until_date = EXCLUDED.active_until_date,
                active_until_time = EXCLUDED.active_until_time,
                updated_by_username = EXCLUDED.updated_by_username,
                updated_at_date = EXCLUDED.updated_at_date,
                updated_at_time = EXCLUDED.updated_at_time,
                sync_version = EXCLUDED.sync_version
            `,
            [
              username,
              activeUntilDate,
              activeUntilTime,
              updatedByUsername,
              normalizeNullableText(payload.updatedAtDate) ?? activeUntilDate,
              normalizeNullableText(payload.updatedAtTime) ?? activeUntilTime,
              currentVersion + 1,
            ],
          );
          outcome = { accepted: true };
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
