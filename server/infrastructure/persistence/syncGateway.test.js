import assert from "node:assert/strict";
import { test } from "node:test";
import { createSyncGateway } from "./syncGateway.js";

function createClientDouble() {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), values });
        return { rowCount: 1, rows: [] };
      },
    },
    queries,
  };
}

test("only a local Pi node can add a login event to the sync outbox", async () => {
  const cloud = createClientDouble();
  const local = createClientDouble();
  const cloudGateway = createSyncGateway({ pool: cloud.client });
  const localGateway = createSyncGateway({ pool: local.client });

  await cloudGateway.enqueueLoginEvent({
    client: cloud.client,
    eventId: "cloud-event",
    loggedInDate: "2026-09-01",
    loggedInTime: "10:00:00.000Z",
    loginMethod: "password",
    machineId: "pi-1",
    sourceNodeMode: "cloud-server",
    username: "robin",
  });
  await localGateway.enqueueLoginEvent({
    client: local.client,
    eventId: "pi-event",
    loggedInDate: "2026-09-01",
    loggedInTime: "10:00:00.000Z",
    loginMethod: "password",
    machineId: "pi-1",
    sourceNodeMode: "local-pi",
    username: "robin",
  });

  assert.equal(cloud.queries.some((entry) => entry.sql.includes("INSERT INTO sync_local_outbox")), false);
  assert.equal(local.queries.some((entry) => entry.sql.includes("INSERT INTO sync_local_outbox")), true);
});

test("pending outbox queries use deterministic outbox ordering", async () => {
  const { client, queries } = createClientDouble();
  const gateway = createSyncGateway({ pool: client });

  await gateway.listPendingOutboxEvents();

  assert.equal(
    queries.some((entry) => entry.sql.includes("ORDER BY outbox_order ASC, created_at ASC, event_id ASC")),
    true,
  );
});

test("rejected booking creates remove the optimistic local booking when no newer create remains", async () => {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });

      if (normalizedSql.startsWith("UPDATE sync_local_outbox")) {
        return {
          rowCount: 1,
          rows: [
            {
              aggregate_key: "event-sync-1:robin",
              event_type: "event_booking_created",
              outbox_order: 10,
              payload_json: {
                syncId: "event-sync-1",
                username: "robin",
              },
            },
          ],
        };
      }

      return {
        rowCount: 0,
        rows: [],
      };
    },
  };
  const gateway = createSyncGateway({ pool: client });

  await gateway.rejectOutboxEvents({
    client,
    rejections: [
      {
        code: "event_not_bookable",
        eventId: "evt-1",
        reason: "The event is not approved for booking.",
      },
    ],
  });

  assert.equal(
    queries.some((entry) => entry.sql.includes("DELETE FROM event_bookings")),
    true,
  );
});

for (const newerCommandState of ["accepted", "pending"]) {
  test(`older rejected create preserves the booking when a newer ${newerCommandState} command exists`, async () => {
    const queries = [];
    const client = {
      async query(sql, values = []) {
        const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ sql: normalizedSql, values });
        if (normalizedSql.startsWith("UPDATE sync_local_outbox")) {
          return {
            rowCount: 1,
            rows: [{
              aggregate_key: "event-sync-1:robin",
              event_type: "event_booking_created",
              outbox_order: 10,
              payload_json: { syncId: "event-sync-1", username: "robin" },
            }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };
    const gateway = createSyncGateway({ pool: client });

    await gateway.rejectOutboxEvents({
      client,
      rejections: [{ eventId: "evt-older" }],
    });

    const reconciliation = queries.find((entry) => entry.sql.startsWith("DELETE FROM event_bookings"));
    assert.equal(reconciliation.sql.includes("WHERE aggregate_key = $3 AND outbox_order > $4"), true);
    assert.deepEqual(reconciliation.values, ["event-sync-1", "robin", "event-sync-1:robin", 10]);
  });
}

function createBookingCommandClient({
  event = null,
  member = { active_member: 1, id: 9 },
  priorOutcome = null,
  session = null,
  sessionBookingCount = 0,
} = {}) {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ sql: normalizedSql, values });

        if (normalizedSql.startsWith("SELECT outcome_json FROM sync_received_commands")) {
          return { rowCount: priorOutcome ? 1 : 0, rows: priorOutcome ? [{ outcome_json: priorOutcome }] : [] };
        }
        if (normalizedSql.startsWith("SELECT * FROM club_events")) {
          return { rowCount: event ? 1 : 0, rows: event ? [event] : [] };
        }
        if (normalizedSql.startsWith("SELECT * FROM coaching_sessions WHERE sync_id")) {
          return { rowCount: session ? 1 : 0, rows: session ? [session] : [] };
        }
        if (normalizedSql.startsWith("SELECT * FROM coaching_sessions WHERE id")) {
          return { rowCount: session ? 1 : 0, rows: session ? [session] : [] };
        }
        if (normalizedSql.startsWith("SELECT id, active_member FROM users")) {
          return { rowCount: member ? 1 : 0, rows: member ? [member] : [] };
        }
        if (normalizedSql.startsWith("SELECT 1 FROM coaching_session_bookings")) {
          return { rowCount: 0, rows: [] };
        }
        if (normalizedSql.startsWith("SELECT COUNT(*)::int AS count")) {
          return { rowCount: 1, rows: [{ count: sessionBookingCount }] };
        }
        return { rowCount: 0, rows: [] };
      },
    },
    queries,
  };
}

function bookingEvent(eventType, payload = {}) {
  return {
    eventId: "command-1",
    eventType,
    payload: {
      bookedAtDate: "2026-09-02",
      bookedAtTime: "10:00:00",
      syncId: "parent-sync-1",
      username: "robin",
      ...payload,
    },
  };
}

test("Pi booking -> Cloud creates the authoritative event booking", async () => {
  const { client, queries } = createBookingCommandClient({
    event: { approval_status: "approved", end_time: "23:59:59", event_date: "2999-01-01", id: 11, types: "[]" },
  });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("event_booking_created"), machineId: "pi-1" });

  assert.deepEqual(outcome, { accepted: true });
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO event_bookings")), true);
});

test("Pi withdrawal -> Cloud removes the authoritative event booking", async () => {
  const { client, queries } = createBookingCommandClient({ event: { id: 11 } });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("event_booking_withdrawn"), machineId: "pi-1" });

  assert.deepEqual(outcome, { accepted: true });
  assert.equal(queries.some((entry) => entry.sql.startsWith("DELETE FROM event_bookings")), true);
});

test("duplicate command retry returns the stored terminal outcome without applying twice", async () => {
  const { client, queries } = createBookingCommandClient({ priorOutcome: { accepted: true } });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("event_booking_created"), machineId: "pi-1" });

  assert.deepEqual(outcome, { accepted: true });
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO event_bookings")), false);
});

test("coaching session full rejects the Pi booking command terminally", async () => {
  const { client } = createBookingCommandClient({
    session: { approval_status: "approved", available_slots: 1, end_time: "23:59:59", id: 22, session_date: "2999-01-01" },
    sessionBookingCount: 1,
  });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("coaching_booking_created"), machineId: "pi-1" });

  assert.equal(outcome.code, "coaching_session_full");
});

test("two concurrent bookings for the final coaching slot accept one and reject one", async () => {
  const queries = [];
  const bookings = [];
  const session = { approval_status: "approved", available_slots: 1, end_time: "23:59:59", id: 22, session_date: "2999-01-01" };
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });
      if (normalizedSql.startsWith("SELECT outcome_json FROM sync_received_commands")) return { rowCount: 0, rows: [] };
      if (normalizedSql.startsWith("SELECT * FROM coaching_sessions")) return { rowCount: 1, rows: [session] };
      if (normalizedSql.startsWith("SELECT id, active_member FROM users")) return { rowCount: 1, rows: [{ active_member: 1, id: 9 }] };
      if (normalizedSql.startsWith("SELECT 1 FROM coaching_session_bookings")) return { rowCount: 0, rows: [] };
      if (normalizedSql.startsWith("SELECT COUNT(*)::int AS count")) return { rowCount: 1, rows: [{ count: bookings.length }] };
      if (normalizedSql.startsWith("INSERT INTO coaching_session_bookings")) bookings.push(values[1]);
      return { rowCount: 0, rows: [] };
    },
  };
  const gateway = createSyncGateway({ pool: client });

  const first = await gateway.processBookingCommand({ client, event: bookingEvent("coaching_booking_created"), machineId: "pi-1" });
  const second = await gateway.processBookingCommand({
    client,
    event: { ...bookingEvent("coaching_booking_created", { username: "casey" }), eventId: "command-2" },
    machineId: "pi-1",
  });

  assert.deepEqual(first, { accepted: true });
  assert.equal(second.code, "coaching_session_full");
  assert.equal(
    queries.some((entry) => entry.sql.includes("FROM coaching_sessions WHERE id = $1 FOR UPDATE")),
    true,
  );
});

test("expired club event rejects the Pi booking command", async () => {
  const { client } = createBookingCommandClient({
    event: { approval_status: "approved", end_time: "00:00:00", event_date: "2000-01-01", id: 11, types: "[]" },
  });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("event_booking_created"), machineId: "pi-1" });
  assert.equal(outcome.code, "event_ended");
});

test("range-closed club event rejects the Pi booking command", async () => {
  const { client } = createBookingCommandClient({
    event: { approval_status: "approved", end_time: "23:59:59", event_date: "2999-01-01", id: 11, types: '["range-closed"]' },
  });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("event_booking_created"), machineId: "pi-1" });
  assert.equal(outcome.code, "event_range_closed");
});

test("ended coaching session rejects the Pi booking command", async () => {
  const { client } = createBookingCommandClient({
    session: { approval_status: "approved", available_slots: 2, end_time: "00:00:00", id: 22, session_date: "2000-01-01" },
  });
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({ client, event: bookingEvent("coaching_booking_created"), machineId: "pi-1" });
  assert.equal(outcome.code, "coaching_session_ended");
});

test("malformed booking sync command is stored as a terminal rejection", async () => {
  const { client, queries } = createBookingCommandClient();
  const gateway = createSyncGateway({ pool: client });

  const outcome = await gateway.processBookingCommand({
    client,
    event: { eventId: "command-malformed", eventType: "event_booking_created", payload: { username: "robin" } },
    machineId: "pi-1",
  });

  assert.equal(outcome.code, "malformed_booking_command");
  assert.equal(queries.some((entry) => entry.sql.startsWith("INSERT INTO sync_received_commands")), true);
});
