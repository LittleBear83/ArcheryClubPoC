import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAuthChanges,
  applyAuthSnapshot,
  applyPulledSyncResponse,
  readSyncStatus,
  writeSyncAttemptState,
} from "./localDatabaseSyncService.js";

function createClientDouble() {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        const normalizedSql = String(sql).trim().replace(/\s+/g, " ");
        queries.push({ sql: normalizedSql, values });

        if (normalizedSql.startsWith("SELECT username, rfid_tag FROM users")) {
          return {
            rowCount: 1,
            rows: [
              {
                rfid_tag: "TAG-1",
                username: "robin",
              },
            ],
          };
        }

        return {
          rowCount: 0,
          rows: [],
        };
      },
    },
    queries,
  };
}

test("applyAuthChanges upserts dependencies before dependent user role rows", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      {
        domain: "user_types",
        operation: "upsert",
        payload: {
          user_type: "admin",
          username: "robin",
        },
        recordKey: "robin",
      },
      {
        domain: "roles",
        operation: "upsert",
        payload: {
          is_system: 1,
          role_key: "admin",
          title: "Admin",
        },
        recordKey: "admin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  const roleQueryIndex = queries.findIndex((entry) =>
    entry.sql.startsWith("INSERT INTO roles"),
  );
  const userTypeQueryIndex = queries.findIndex((entry) =>
    entry.sql.startsWith("INSERT INTO user_types"),
  );

  assert.ok(roleQueryIndex > -1);
  assert.ok(userTypeQueryIndex > -1);
  assert.ok(roleQueryIndex < userTypeQueryIndex);
});

test("applyAuthChanges tombstones deleted cloud users instead of deleting local history", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      {
        domain: "users",
        operation: "delete",
        payload: {
          rfid_tag: "TAG-1",
          username: "robin",
        },
        recordKey: "robin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  assert.ok(
    queries.some((entry) =>
      entry.sql.startsWith("UPDATE users SET password = NULL"),
    ),
  );
});

test("applyAuthChanges removes every deleted cloud-authoritative relationship", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      { domain: "user_disciplines", operation: "delete", payload: { discipline: "Recurve", username: "robin" }, recordKey: "robin:Recurve" },
      { domain: "user_types", operation: "delete", payload: { username: "robin" }, recordKey: "robin" },
      { domain: "role_permissions", operation: "delete", payload: { permission_key: "manage_users", role_key: "admin" }, recordKey: "admin:manage_users" },
      { domain: "roles", operation: "delete", payload: { role_key: "obsolete" }, recordKey: "obsolete" },
      { domain: "permissions", operation: "delete", payload: { permission_key: "obsolete_permission" }, recordKey: "obsolete_permission" },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM user_disciplines WHERE username = $1 AND discipline = $2")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM user_types WHERE username = $1")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM role_permissions WHERE role_key = $1 AND permission_key = $2")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM roles WHERE role_key = $1")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM permissions WHERE permission_key = $1")));
});

test("rejectedOutboxCount and recent rejected command diagnostics are reported in sync status", async () => {
  const status = await readSyncStatus({
    syncGateway: {
      async countPendingOutboxEvents() {
        return 3;
      },
      async countRejectedOutboxEvents() {
        return 1;
      },
      async listRecentRejectedOutboxEvents() {
        return [
          {
            eventId: "evt-1",
            eventType: "event_booking_created",
            rejectionCode: "event_not_bookable",
            rejectionReason: "The event is not approved for booking.",
          },
        ];
      },
      async readLocalState() {
        return {
          state: {
            currentCheckpoint: 44,
            lastAttemptedAt: "2026-09-01T00:01:00.000Z",
            lastError: "timeout",
            lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
            syncClientVersion: "sync-v1",
            syncServerVersion: "sync-v1",
          },
          updatedAt: "2026-09-01T00:01:00.000Z",
        };
      },
    },
  });

  assert.deepEqual(status, {
    currentCheckpoint: 44,
    lastAttemptedAt: "2026-09-01T00:01:00.000Z",
    lastError: "timeout",
    lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
    pendingOutboxCount: 3,
    recentRejectedOutboxEvents: [
      {
        eventId: "evt-1",
        eventType: "event_booking_created",
        rejectionCode: "event_not_bookable",
        rejectionReason: "The event is not approved for booking.",
      },
    ],
    rejectedOutboxCount: 1,
    syncClientVersion: "sync-v1",
    syncServerVersion: "sync-v1",
  });
});

test("writeSyncAttemptState merges new values into the existing sync state", async () => {
  let writtenState = null;

  await writeSyncAttemptState({
    syncGateway: {
      async readLocalState() {
        return {
          state: {
            currentCheckpoint: 12,
            lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
          },
        };
      },
      async writeLocalState({ state }) {
        writtenState = state;
      },
    },
    values: {
      lastError: "network down",
    },
  });

  assert.deepEqual(writtenState, {
    currentCheckpoint: 12,
    lastError: "network down",
    lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
  });
});

function createOperationalClient({ pendingCommands = [] } = {}) {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ sql: normalizedSql, values });

        if (normalizedSql.startsWith("SELECT id FROM club_events")) {
          return { rowCount: 1, rows: [{ id: 101 }] };
        }

        if (normalizedSql.startsWith("SELECT id FROM coaching_sessions")) {
          return { rowCount: 1, rows: [{ id: 202 }] };
        }

        if (normalizedSql.startsWith("SELECT parents.sync_id AS parent_sync_id")) {
          return { rowCount: 0, rows: [] };
        }

        return { rowCount: 0, rows: [] };
      },
    },
    queries,
    syncGateway: {
      async listPendingBookingOverlayCommands() {
        return pendingCommands;
      },
    },
  };
}

test("cloud booking -> Pi applies an event booking using the parent sync ID", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthChanges({
    changes: [{
      domain: "event_bookings",
      operation: "upsert",
      payload: {
        booked_at_date: "2026-09-02",
        booked_at_time: "10:00:00",
        member_username: "robin",
        parent_sync_id: "event-sync-1",
      },
      recordKey: "event-sync-1:robin",
    }],
    client,
    deactivatedRfidSuffix: "-deactivated",
    syncGateway,
  });

  const bookingInsert = queries.find((entry) => entry.sql.startsWith("INSERT INTO event_bookings"));
  assert.deepEqual(bookingInsert.values, ["event-sync-1", "robin", "2026-09-02", "10:00:00"]);
});

test("cloud withdrawal -> Pi removes the event booking using stable identities", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthChanges({
    changes: [{
      domain: "event_bookings",
      operation: "delete",
      payload: { member_username: "robin", parent_sync_id: "event-sync-1" },
      recordKey: "event-sync-1:robin",
    }],
    client,
    deactivatedRfidSuffix: "-deactivated",
    syncGateway,
  });

  assert.equal(
    queries.some((entry) => entry.sql.startsWith("DELETE FROM event_bookings") && entry.values[0] === "event-sync-1"),
    true,
  );
});

test("book then withdraw while offline leaves the Pi booking absent after the pending overlay", async () => {
  const { client, queries, syncGateway } = createOperationalClient({
    pendingCommands: [
      { eventType: "event_booking_created", payload: { bookedAtDate: "2026-09-02", bookedAtTime: "10:00", syncId: "event-sync-1", username: "robin" } },
      { eventType: "event_booking_withdrawn", payload: { syncId: "event-sync-1", username: "robin" } },
    ],
  });

  await applyAuthChanges({ changes: [], client, deactivatedRfidSuffix: "-deactivated", syncGateway });

  const overlayQueries = queries.filter((entry) => entry.sql.includes("event_bookings"));
  assert.equal(overlayQueries.some((entry) => entry.sql.startsWith("INSERT INTO event_bookings")), true);
  assert.equal(overlayQueries.some((entry) => entry.sql.startsWith("DELETE FROM event_bookings")), true);
});

test("withdraw then rebook while offline leaves the Pi booking present after the pending overlay", async () => {
  const { client, queries, syncGateway } = createOperationalClient({
    pendingCommands: [
      { eventType: "event_booking_withdrawn", payload: { syncId: "event-sync-1", username: "robin" } },
      { eventType: "event_booking_created", payload: { bookedAtDate: "2026-09-02", bookedAtTime: "10:00", syncId: "event-sync-1", username: "robin" } },
    ],
  });

  await applyAuthChanges({ changes: [], client, deactivatedRfidSuffix: "-deactivated", syncGateway });

  const bookingQueries = queries.filter((entry) => entry.sql.includes("event_bookings"));
  assert.equal(bookingQueries.at(-1).sql.startsWith("INSERT INTO event_bookings"), true);
});

test("deleted event with pending local command does not recreate a deleted cloud master", async () => {
  const { client, queries, syncGateway } = createOperationalClient({
    pendingCommands: [{ eventType: "event_booking_created", payload: { syncId: "event-sync-1", username: "robin" } }],
  });
  client.query = async (sql, values = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: normalizedSql, values });
    if (normalizedSql.startsWith("SELECT id FROM club_events")) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  await applyAuthChanges({
    changes: [{ domain: "club_events", operation: "delete", payload: { sync_id: "event-sync-1" }, recordKey: "event-sync-1" }],
    client,
    deactivatedRfidSuffix: "-deactivated",
    syncGateway,
  });

  assert.equal(queries.some((entry) => entry.sql === "DELETE FROM club_events WHERE sync_id = $1"), true);
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO event_bookings")), false);
});

test("deleted coaching session with pending local command does not recreate a deleted cloud master", async () => {
  const { client, queries, syncGateway } = createOperationalClient({
    pendingCommands: [{ eventType: "coaching_booking_created", payload: { syncId: "session-sync-1", username: "robin" } }],
  });
  client.query = async (sql, values = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
    queries.push({ sql: normalizedSql, values });
    if (normalizedSql.startsWith("SELECT id FROM coaching_sessions")) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  };

  await applyAuthChanges({
    changes: [{ domain: "coaching_sessions", operation: "delete", payload: { sync_id: "session-sync-1" }, recordKey: "session-sync-1" }],
    client,
    deactivatedRfidSuffix: "-deactivated",
    syncGateway,
  });

  assert.equal(queries.some((entry) => entry.sql === "DELETE FROM coaching_sessions WHERE sync_id = $1"), true);
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO coaching_session_bookings")), false);
});

async function applyEmptyOperationalSnapshot(client, syncGateway) {
  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: { users: [] },
    syncGateway,
  });
}

test("snapshot with no operational domains does not delete existing operational data", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyEmptyOperationalSnapshot(client, syncGateway);

  for (const tableName of ["club_events", "coaching_sessions", "equipment_items"]) {
    assert.equal(queries.some((entry) => entry.sql === `DELETE FROM ${tableName}`), false);
  }
});

test("snapshot with an empty clubEvents domain reconciles stale events", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: { clubEvents: [], users: [] },
    syncGateway,
  });

  assert.equal(queries.some((entry) => entry.sql === "DELETE FROM club_events"), true);
});

test("coaching and equipment snapshot domains distinguish absent from empty", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: { coachingSessions: [], equipmentItems: [], users: [] },
    syncGateway,
  });

  assert.equal(queries.some((entry) => entry.sql === "DELETE FROM coaching_sessions"), true);
  assert.equal(queries.some((entry) => entry.sql === "DELETE FROM equipment_items"), true);
});

test("bookings are not cleared when their booking snapshot domains are absent", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyEmptyOperationalSnapshot(client, syncGateway);

  assert.equal(
    queries.some((entry) => entry.sql.startsWith("SELECT parents.sync_id AS parent_sync_id")),
    false,
  );
  assert.equal(
    queries.some((entry) => entry.sql.startsWith("DELETE FROM event_bookings")),
    false,
  );
  assert.equal(
    queries.some((entry) => entry.sql.startsWith("DELETE FROM coaching_session_bookings")),
    false,
  );
});

test("initial snapshot remaps equipment case relationships by sync ID", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: {
      equipmentItems: [{ equipment_type: "case", item_number: "A", location_case_sync_id: "case-sync", sync_id: "bow-sync" }],
      users: [],
    },
    syncGateway,
  });

  const remap = queries.find((entry) => entry.sql.includes("SET location_case_id = parent.id"));
  assert.deepEqual(remap.values, ["bow-sync", "case-sync"]);
});

test("failed pull rolls back and does not advance the checkpoint", async () => {
  const queries = [];
  let writeCalls = 0;
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });
      if (normalizedSql.startsWith("INSERT INTO club_events")) {
        throw new Error("simulated pull failure");
      }
      return { rowCount: 0, rows: [] };
    },
  };

  await assert.rejects(
    applyPulledSyncResponse({
      client,
      currentCheckpoint: 10,
      deactivatedRfidSuffix: "-deactivated",
      pullResponse: {
        checkpoint: 11,
        mode: "snapshot",
        snapshot: { clubEvents: [{ sync_id: "event-sync-1" }], users: [] },
      },
      syncGateway: {
        async listPendingBookingOverlayCommands() { return []; },
        async readLocalState() { return { state: { currentCheckpoint: 10 } }; },
        async writeLocalState() { writeCalls += 1; },
      },
    }),
    /simulated pull failure/,
  );

  assert.equal(queries.some((entry) => entry.sql === "ROLLBACK"), true);
  assert.equal(queries.some((entry) => entry.sql === "COMMIT"), false);
  assert.equal(writeCalls, 0);
});

test("login history snapshot imports an unmatched cloud event without mutating an existing stable ID", async () => {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });

      if (normalizedSql.startsWith("SELECT id FROM login_events WHERE sync_event_id")) {
        return { rowCount: 0, rows: [] };
      }

      if (normalizedSql.startsWith("SELECT id FROM login_events WHERE LOWER(username) = LOWER($1)")) {
        return { rowCount: 1, rows: [{ id: 41 }] };
      }

      return { rowCount: 0, rows: [] };
    },
  };

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: {
      loginEvents: [{
        logged_in_date: "2026-08-20",
        logged_in_time: "18:00:00",
        login_method: "rfid",
        sync_event_id: "cloud-login-1",
        sync_source_machine_id: null,
        username: "robin",
      }],
      users: [],
    },
    syncGateway: { async listPendingBookingOverlayCommands() { return []; } },
  });

  assert.equal(queries.some((entry) => entry.sql.startsWith("UPDATE login_events SET")), false);
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO login_events")), true);
});

test("guest login history snapshot does not delete local rows when the domain is explicitly empty", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: { guestLoginEvents: [], users: [] },
    syncGateway,
  });

  assert.equal(
    queries.some((entry) => entry.sql === "DELETE FROM guest_login_events"),
    false,
  );
});

test("range presence snapshot distinguishes absent from empty state", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: { rangePresenceExtensions: [], users: [] },
    syncGateway,
  });

  assert.equal(
    queries.some((entry) => entry.sql === "DELETE FROM range_presence_extensions"),
    true,
  );
});

test("beginners course reporting snapshot upserts courses before participants", async () => {
  const { client, queries, syncGateway } = createOperationalClient();

  await applyAuthSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshot: {
      beginnersCourses: [{
        approved_at_date: null,
        approved_at_time: null,
        approved_by_username: null,
        beginner_capacity: 12,
        cancellation_reason: null,
        cancelled_at_date: null,
        cancelled_at_time: null,
        cancelled_by_username: null,
        coordinator_username: "coach",
        course_type: "beginners",
        created_at_date: "2026-08-01",
        created_at_time: "09:00:00",
        first_lesson_date: "2026-09-10",
        is_cancelled: 0,
        lesson_count: 4,
        rejection_reason: null,
        start_time: "18:00:00",
        end_time: "20:00:00",
        submitted_by_username: "coach",
        sync_id: "course-sync-1",
        approval_status: "approved",
      }],
      beginnersCourseParticipants: [{
        assigned_case_at_date: null,
        assigned_case_at_time: null,
        assigned_case_by_username: null,
        beginner_size_category: "adult",
        converted_at_date: null,
        converted_at_time: null,
        converted_by_username: null,
        converted_to_member: 0,
        course_fee_paid: 1,
        course_sync_id: "course-sync-1",
        created_at_date: "2026-08-02",
        created_at_time: "09:00:00",
        created_by_username: "coach",
        draw_length: "28",
        eye_dominance: "right",
        first_name: "Robin",
        handedness: "right",
        height_text: "5ft 10",
        initial_email_sent: 1,
        origin_course_type: "beginners",
        surname: "Archer",
        sync_id: "participant-sync-1",
        thirty_day_reminder_sent: 0,
        username: "robin",
      }],
      beginnersCourseLessons: [],
      beginnersCourseLessonCoaches: [],
      users: [],
    },
    syncGateway,
  });

  const courseInsertIndex = queries.findIndex((entry) => entry.sql.startsWith("INSERT INTO beginners_courses"));
  const participantInsertIndex = queries.findIndex((entry) => entry.sql.startsWith("INSERT INTO beginners_course_participants"));
  assert.ok(courseInsertIndex > -1);
  assert.ok(participantInsertIndex > -1);
  assert.ok(courseInsertIndex < participantInsertIndex);
});
