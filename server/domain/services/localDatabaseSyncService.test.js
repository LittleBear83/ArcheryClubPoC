import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAuthChanges,
  applyAuthSnapshot,
  applyPublicationSnapshot,
  applyPulledPublicationResponse,
  applyPulledSyncResponse,
  drainPendingOutboxCommands,
  PUBLICATION_FEED_VERSION,
  PUBLICATION_SYNC_STATE_KEY,
  readPublicationSyncState,
  readSyncStatus,
  writeSyncAttemptState,
} from "./localDatabaseSyncService.js";

const emptyPublicationSnapshot = () => ({
  announcements: [],
  beginnersCourseLessonCoaches: [],
  beginnersCourseLessons: [],
  beginnersCourseParticipants: [],
  beginnersCourses: [],
  clubEvents: [],
  coachingSessionBookings: [],
  coachingSessions: [],
  equipmentItems: [],
  equipmentStorageLocations: [],
  eventBookings: [],
  guestLoginEvents: [],
  loginEvents: [],
  permissions: [],
  rangePresenceExtensions: [],
  rolePermissions: [],
  roles: [],
  userDisciplines: [],
  userTypes: [],
  users: [],
});

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

test("rebaseline drains every outbox batch and preserves accepted and rejected outcomes", async () => {
  const pending = [
    [{ eventId: "accepted-1", eventType: "login_event", payload: { username: "a" } }, { eventId: "rejected-1", eventType: "range_presence_extended", payload: { username: "b" } }],
    [{ eventId: "accepted-2", eventType: "guest_login_event", payload: { guestName: "Guest" } }],
    [],
  ];
  const pushed = [];
  const acknowledged = [];
  const rejected = [];
  const result = await drainPendingOutboxCommands({
    batchSize: 2,
    pushEvents: async (events) => {
      pushed.push(events);
      return events[0].eventId === "accepted-1"
        ? { acceptedEventIds: ["accepted-1"], rejectedEvents: [{ eventId: "rejected-1", code: "conflict", reason: "Cloud won" }] }
        : { acceptedEventIds: ["accepted-2"], rejectedEvents: [] };
    },
    syncGateway: {
      async acknowledgeOutboxEvents({ eventIds }) { acknowledged.push(...eventIds); },
      async countPendingOutboxEvents() { return 0; },
      async listPendingOutboxEvents(options) {
        assert.equal(options.includeUnavailable, true);
        assert.equal(options.limit, 2);
        return pending.shift();
      },
      async recordOutboxFailure() { assert.fail("must not record a successful drain as failed"); },
      async rejectOutboxEvents({ rejections }) { rejected.push(...rejections); },
    },
  });
  assert.deepEqual(result, { batches: 2, resolvedEvents: 3 });
  assert.deepEqual(pushed.flat().map((event) => event.eventId), ["accepted-1", "rejected-1", "accepted-2"]);
  assert.deepEqual(acknowledged, ["accepted-1", "accepted-2"]);
  assert.deepEqual(rejected, [{ eventId: "rejected-1", code: "conflict", reason: "Cloud won" }]);
});

test("rebaseline aborts and records diagnostics when Cloud leaves an outbox command unresolved", async () => {
  const failures = [];
  await assert.rejects(drainPendingOutboxCommands({
    batchSize: 10,
    pushEvents: async () => ({ acceptedEventIds: [], rejectedEvents: [] }),
    syncGateway: {
      async listPendingOutboxEvents() { return [{ eventId: "pending-1", eventType: "login_event", payload: {} }]; },
      async recordOutboxFailure(entry) { failures.push(entry); },
      async rejectOutboxEvents() { assert.fail("must not reject without a Cloud outcome"); },
      async acknowledgeOutboxEvents() { assert.fail("must not acknowledge without a Cloud outcome"); },
    },
  }), /could not be resolved/);
  assert.deepEqual(failures.map((entry) => entry.eventIds), [["pending-1"]]);
});

test("rebaseline rejects duplicate accepted outcomes for one outbox command", async () => {
  const failures = [];
  await assert.rejects(drainPendingOutboxCommands({
    batchSize: 10,
    pushEvents: async () => ({ acceptedEventIds: ["pending-1", "pending-1"], rejectedEvents: [] }),
    syncGateway: {
      async listPendingOutboxEvents() { return [{ eventId: "pending-1", eventType: "login_event", payload: {} }]; },
      async recordOutboxFailure(entry) { failures.push(entry); },
      async rejectOutboxEvents() { assert.fail("must not reject duplicate Cloud outcomes"); },
      async acknowledgeOutboxEvents() { assert.fail("must not acknowledge duplicate Cloud outcomes"); },
    },
  }), /could not be resolved/);
  assert.deepEqual(failures.map((entry) => entry.eventIds), [["pending-1"]]);
});

test("rebaseline rejects duplicate rejected outcomes for one outbox command", async () => {
  const failures = [];
  await assert.rejects(drainPendingOutboxCommands({
    batchSize: 10,
    pushEvents: async () => ({
      acceptedEventIds: [],
      rejectedEvents: [
        { eventId: "pending-1", code: "conflict", reason: "Cloud won" },
        { eventId: "pending-1", code: "conflict", reason: "Cloud won" },
      ],
    }),
    syncGateway: {
      async listPendingOutboxEvents() { return [{ eventId: "pending-1", eventType: "login_event", payload: {} }]; },
      async recordOutboxFailure(entry) { failures.push(entry); },
      async rejectOutboxEvents() { assert.fail("must not persist duplicate Cloud rejections"); },
      async acknowledgeOutboxEvents() { assert.fail("must not acknowledge duplicate Cloud outcomes"); },
    },
  }), /could not be resolved/);
  assert.deepEqual(failures.map((entry) => entry.eventIds), [["pending-1"]]);
});

test("publication rebaseline prunes in FK order, preserves local-only/history tables, and initializes an exact checkpoint", async () => {
  const queries = [];
  const writes = [];
  const notifications = [];
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });
      if (normalizedSql.startsWith("SELECT parents.sync_id AS parent_sync_id")) {
        return { rowCount: 1, rows: [{ parent_sync_id: "stale-parent", member_username: "robin" }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
  await applyPublicationSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshotResponse: {
      checkpoint: "9007199254740993",
      feedVersion: PUBLICATION_FEED_VERSION,
      mode: "snapshot",
      snapshot: emptyPublicationSnapshot(),
    },
    syncGateway: { async writeLocalState(entry) { writes.push(entry); } },
    onSnapshotApplied: async (domains) => notifications.push({ domains, after: queries.at(-1).sql }),
  });

  assert.deepEqual(writes.map(({ state, stateKey }) => ({ state, stateKey })), [{
    state: { feedVersion: PUBLICATION_FEED_VERSION, publicationCheckpoint: "9007199254740993" },
    stateKey: PUBLICATION_SYNC_STATE_KEY,
  }]);
  assert.equal(writes[0].client, client);
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].after, "COMMIT");
  const eventBookingDelete = queries.findIndex((entry) => entry.sql.startsWith("DELETE FROM event_bookings"));
  const eventDelete = queries.findIndex((entry) => entry.sql === "DELETE FROM club_events");
  const equipmentDelete = queries.findIndex((entry) => entry.sql.startsWith("DELETE FROM equipment_items AS item"));
  const storageDelete = queries.findIndex((entry) => entry.sql === "DELETE FROM equipment_storage_locations");
  assert.ok(eventBookingDelete > -1 && eventBookingDelete < eventDelete);
  assert.ok(equipmentDelete > -1 && equipmentDelete < storageDelete);
  for (const table of ["sync_local_outbox", "sync_received_commands", "login_events", "guest_login_events", "equipment_loans", "announcement_seen_members"]) {
    assert.equal(queries.some((entry) => entry.sql === `DELETE FROM ${table}`), false);
  }
});

test("publication rebaseline rejects feed mismatch before writes and rolls back application failures", async () => {
  const mismatchedQueries = [];
  await assert.rejects(applyPublicationSnapshot({
    client: { async query(sql) { mismatchedQueries.push(sql); } },
    deactivatedRfidSuffix: "-deactivated",
    snapshotResponse: { checkpoint: "1", feedVersion: "sync-publication-v3", mode: "snapshot", snapshot: emptyPublicationSnapshot() },
    syncGateway: { async writeLocalState() { assert.fail("must not initialize"); } },
  }), /feed-version mismatch/);
  assert.equal(mismatchedQueries.length, 0);

  const queries = [];
  let writes = 0;
  await assert.rejects(applyPublicationSnapshot({
    client: { async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push(normalized);
      if (normalized.startsWith("INSERT INTO roles")) throw new Error("rebaseline apply failed");
      return { rowCount: 0, rows: [] };
    } },
    deactivatedRfidSuffix: "-deactivated",
    snapshotResponse: {
      checkpoint: "2",
      feedVersion: PUBLICATION_FEED_VERSION,
      mode: "snapshot",
      snapshot: { ...emptyPublicationSnapshot(), roles: [{ role_key: "member", title: "Member" }] },
    },
    syncGateway: { async writeLocalState() { writes += 1; } },
  }), /rebaseline apply failed/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.equal(writes, 0);
});

test("normal v2 pull can continue immediately from a rebaseline BIGINT checkpoint", async () => {
  let state;
  let roleWrites = 0;
  const client = { async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized.startsWith("INSERT INTO roles")) roleWrites += 1;
    return { rowCount: normalized.startsWith("INSERT INTO roles") ? 1 : 0, rows: [] };
  } };
  const syncGateway = {
    async listPendingBookingOverlayCommands() { return []; },
    async readLocalState() { return state ? { state } : null; },
    async writeLocalState({ state: next }) { state = next; },
  };
  await applyPublicationSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshotResponse: { checkpoint: "9007199254740992", feedVersion: PUBLICATION_FEED_VERSION, mode: "snapshot", snapshot: emptyPublicationSnapshot() },
    syncGateway,
  });
  await applyPulledPublicationResponse({
    client,
    deactivatedRfidSuffix: "-deactivated",
    pullResponse: {
      checkpoint: "9007199254740993",
      feedVersion: PUBLICATION_FEED_VERSION,
      mode: "incremental",
      changes: [{ domain: "roles", operation: "upsert", payload: { role_key: "member", title: "Member" }, publicationCursor: "9007199254740993", recordKey: "member" }],
    },
    syncGateway,
  });
  assert.equal(roleWrites, 1);
  assert.equal(state.publicationCheckpoint, "9007199254740993");
});

function createPublicationSyncDouble({
  checkpoint = "0",
  failSql = null,
  feedVersion = PUBLICATION_FEED_VERSION,
} = {}) {
  const queries = [];
  const writes = [];
  let state = { feedVersion, publicationCheckpoint: checkpoint };
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });
      if (failSql && normalizedSql.startsWith(failSql)) throw new Error("simulated v2 apply failure");
      return { rowCount: /^\s*(INSERT|UPDATE|DELETE)\b/i.test(normalizedSql) ? 1 : 0, rows: [] };
    },
  };
  const syncGateway = {
    async listPendingBookingOverlayCommands() { return []; },
    async readLocalState(stateKey, suppliedClient) {
      assert.equal(stateKey, PUBLICATION_SYNC_STATE_KEY);
      if (suppliedClient !== undefined) assert.equal(suppliedClient, client);
      return state ? { state } : null;
    },
    async writeLocalState(entry) {
      assert.equal(entry.client, client);
      assert.equal(entry.stateKey, PUBLICATION_SYNC_STATE_KEY);
      writes.push(entry);
      state = entry.state;
    },
  };
  return { client, getState: () => state, queries, syncGateway, writes };
}

test("publication state refuses v2 before a valid baseline is initialized", async () => {
  for (const state of [
    null,
    { currentCheckpoint: 42 },
    { feedVersion: "sync-v1", publicationCheckpoint: "42" },
    { feedVersion: PUBLICATION_FEED_VERSION, publicationCheckpoint: 42 },
    { feedVersion: PUBLICATION_FEED_VERSION, publicationCheckpoint: "01" },
  ]) {
    await assert.rejects(
      readPublicationSyncState({
        syncGateway: { async readLocalState() { return state ? { state } : null; } },
      }),
      /initialized v2 baseline/,
    );
  }
});

test("publication apply persists its feed and exact BIGINT checkpoint in the apply transaction", async () => {
  const sync = createPublicationSyncDouble({ checkpoint: "9007199254740992" });
  await applyPulledPublicationResponse({
    client: sync.client,
    deactivatedRfidSuffix: "-deactivated",
    pullResponse: {
      changes: [{
        domain: "roles",
        operation: "upsert",
        payload: { is_system: 1, role_key: "admin", title: "Admin" },
        publicationCursor: "9007199254740993",
        recordKey: "admin",
      }],
      checkpoint: "9007199254740993",
      feedVersion: PUBLICATION_FEED_VERSION,
      mode: "incremental",
    },
    syncGateway: sync.syncGateway,
  });

  assert.deepEqual(sync.getState(), {
    feedVersion: PUBLICATION_FEED_VERSION,
    publicationCheckpoint: "9007199254740993",
  });
  assert.equal(typeof sync.getState().publicationCheckpoint, "string");
  assert.deepEqual(sync.queries.map((entry) => entry.sql).filter((sql) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)), ["BEGIN", "COMMIT"]);
  assert.equal(sync.writes.length, 1);
  assert.ok(sync.queries.findIndex((entry) => entry.sql === "COMMIT") > -1, "checkpoint write uses the client transaction committed by the applier");
});

test("publication apply rolls back without persisting its checkpoint when a change fails", async () => {
  const sync = createPublicationSyncDouble({ checkpoint: "10", failSql: "INSERT INTO roles" });
  await assert.rejects(
    applyPulledPublicationResponse({
      client: sync.client,
      deactivatedRfidSuffix: "-deactivated",
      pullResponse: {
        changes: [{
          domain: "roles",
          operation: "upsert",
          payload: { is_system: 1, role_key: "admin", title: "Admin" },
          publicationCursor: "11",
          recordKey: "admin",
        }],
        checkpoint: "11",
        feedVersion: PUBLICATION_FEED_VERSION,
        mode: "incremental",
      },
      syncGateway: sync.syncGateway,
    }),
    /simulated v2 apply failure/,
  );
  assert.equal(sync.writes.length, 0);
  assert.deepEqual(sync.getState(), { feedVersion: PUBLICATION_FEED_VERSION, publicationCheckpoint: "10" });
  assert.equal(sync.queries.at(-1).sql, "ROLLBACK");
});

test("repeated publication pages are idempotent and do not reapply acknowledged cursors", async () => {
  const sync = createPublicationSyncDouble({ checkpoint: "20" });
  const pullResponse = {
    changes: [{
      domain: "roles",
      operation: "upsert",
      payload: { is_system: 1, role_key: "admin", title: "Admin" },
      publicationCursor: "21",
      recordKey: "admin",
    }],
    checkpoint: "21",
    feedVersion: PUBLICATION_FEED_VERSION,
    mode: "incremental",
  };

  await applyPulledPublicationResponse({ client: sync.client, deactivatedRfidSuffix: "-deactivated", pullResponse, syncGateway: sync.syncGateway });
  await applyPulledPublicationResponse({ client: sync.client, deactivatedRfidSuffix: "-deactivated", pullResponse, syncGateway: sync.syncGateway });

  assert.equal(sync.queries.filter((entry) => entry.sql.startsWith("INSERT INTO roles")).length, 1);
  assert.equal(sync.getState().publicationCheckpoint, "21");
});

test("publication apply rejects a feed-version mismatch without applying or advancing", async () => {
  const sync = createPublicationSyncDouble({ checkpoint: "7" });
  await assert.rejects(
    applyPulledPublicationResponse({
      client: sync.client,
      deactivatedRfidSuffix: "-deactivated",
      pullResponse: { changes: [], checkpoint: "8", feedVersion: "sync-publication-v3", mode: "incremental" },
      syncGateway: sync.syncGateway,
    }),
    /feed-version mismatch/,
  );
  assert.equal(sync.queries.length, 0);
  assert.equal(sync.writes.length, 0);
  assert.equal(sync.getState().publicationCheckpoint, "7");
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

test("extended SSE domains respect user dependency ordering", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      {
        domain: "outdoor_table_entries",
        operation: "upsert",
        payload: {
          season_year: 2026,
          archer_username: "robin",
          bow_type: "Recurve",
        },
        recordKey: "2026:robin:recurve",
      },
      {
        domain: "golden_records_member_sync",
        operation: "upsert",
        payload: {
          username: "robin",
          snapshot_json: {},
          fetched_at: "",
          synced_at_date: "2026-09-09",
          synced_at_time: "17:00:00",
        },
        recordKey: "robin",
      },
      {
        domain: "users",
        operation: "upsert",
        payload: {
          username: "robin",
          first_name: "Robin",
          surname: "Example",
          active_member: 1,
        },
        recordKey: "robin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  const userUpsert = queries.findIndex((q) =>
    q.sql.startsWith("INSERT INTO users"),
  );
  const goldenUpsert = queries.findIndex((q) =>
    q.sql.startsWith("INSERT INTO golden_records_member_sync"),
  );
  const outdoorUpsert = queries.findIndex((q) =>
    q.sql.startsWith("INSERT INTO outdoor_table_entries"),
  );

  assert.ok(userUpsert > -1);
  assert.ok(goldenUpsert > userUpsert);
  assert.ok(outdoorUpsert > goldenUpsert);

  queries.length = 0;

  await applyAuthChanges({
    changes: [
      {
        domain: "users",
        operation: "delete",
        payload: { username: "robin", rfid_tag: "TAG-1" },
        recordKey: "robin",
      },
      {
        domain: "outdoor_table_entries",
        operation: "delete",
        payload: {
          season_year: 2026,
          archer_username: "robin",
          bow_type: "Recurve",
        },
        recordKey: "2026:robin:recurve",
      },
      {
        domain: "golden_records_member_sync",
        operation: "delete",
        payload: { username: "robin" },
        recordKey: "robin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  const goldenDelete = queries.findIndex((q) =>
    q.sql.startsWith("DELETE FROM golden_records_member_sync"),
  );
  const outdoorDelete = queries.findIndex((q) =>
    q.sql.startsWith("DELETE FROM outdoor_table_entries"),
  );
  const userTombstone = queries.findIndex((q) =>
    q.sql.startsWith("UPDATE users SET password = NULL"),
  );

  assert.ok(goldenDelete > -1);
  assert.ok(outdoorDelete > -1);
  assert.ok(userTombstone > goldenDelete);
  assert.ok(userTombstone > outdoorDelete);
});
