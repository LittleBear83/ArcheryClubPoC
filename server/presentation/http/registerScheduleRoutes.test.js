import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { registerScheduleRoutes } from "./registerScheduleRoutes.js";
import { createScheduleGateway } from "../../infrastructure/persistence/scheduleGateway.js";

async function startTestServer(app) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

function requestJson(baseUrl, path, { body = null, method = "GET" } = {}) {
  const url = new URL(path, baseUrl);
  const payload = body == null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: payload
          ? {
              "content-length": Buffer.byteLength(payload),
              "content-type": "application/json",
            }
          : {},
        method,
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            body: responseBody ? JSON.parse(responseBody) : null,
            status: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.end(payload);
  });
}

function createScheduleTestApp({
  isLocalPiNode,
  scheduleGateway,
}) {
  const app = express();
  app.use(express.json());

  registerScheduleRoutes({
    actorHasPermission: () => false,
    app,
    auditChangeLogger: null,
    buildClubEvent: (event) => event,
    buildCoachingBookingsMap: async () => new Map(),
    buildCoachingSession: (session) => session,
    buildEventBookingsMap: async () => new Map(),
    canActorViewApprovalEntry: () => true,
    findScheduleConflict: async () => null,
    getActorUser: () => ({
      active_member: 1,
      id: 9,
      username: "robin",
    }),
    getUtcTimestampParts: () => ["2026-09-02", "10:00:00.000Z"],
    hasScheduleEntryEnded: () => false,
    isLocalPiNode,
    normalizeBookingRow: (booking) => booking,
    normalizeVenue: (venue) => venue,
    PERMISSIONS: {
      ADD_BEGINNERS_COURSES: "add_beginners_courses",
      ADD_COACHING_SESSIONS: "add_coaching_sessions",
      ADD_EVENTS: "add_events",
      APPROVE_BEGINNERS_COURSES: "approve_beginners_courses",
      APPROVE_COACHING_SESSIONS: "approve_coaching_sessions",
      APPROVE_EVENTS: "approve_events",
      APPROVE_HAVE_A_GO_SESSIONS: "approve_have_a_go_sessions",
      CANCEL_EVENTS: "cancel_events",
    },
    scheduleGateway,
    serverEventBus: {
      broadcastToAll: () => {},
      broadcastToAnyPermission: () => {},
    },
  });

  return app;
}

function createEventGatewayDouble() {
  const calls = [];

  return {
    calls,
    gateway: {
      async createEventBooking(args) {
        calls.push({ method: "createEventBooking", args });
      },
      async createEventBookingWithOutbox(args) {
        calls.push({ method: "createEventBookingWithOutbox", args });
      },
      async findClubEventById() {
        return {
          approval_status: "approved",
          end_time: "12:00:00",
          event_date: "2026-09-03",
          id: 1,
          sync_id: "event-sync-1",
          title: "Club shoot",
          type: "social",
          types: JSON.stringify(["social"]),
        };
      },
      async listEventBookingsByEventId() {
        return [];
      },
    },
  };
}

test("local Pi event booking route writes the optimistic booking and outbox command", async () => {
  const { calls, gateway } = createEventGatewayDouble();
  const app = createScheduleTestApp({
    isLocalPiNode: true,
    scheduleGateway: gateway,
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/events/1/book", {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.equal(
      calls.some((entry) => entry.method === "createEventBookingWithOutbox"),
      true,
    );
    assert.equal(
      calls.some((entry) => entry.method === "createEventBooking"),
      false,
    );
  } finally {
    server.close();
  }
});

test("cloud event booking route does not create a Pi outbox command", async () => {
  const { calls, gateway } = createEventGatewayDouble();
  const app = createScheduleTestApp({
    isLocalPiNode: false,
    scheduleGateway: gateway,
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/events/1/book", {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.equal(
      calls.some((entry) => entry.method === "createEventBooking"),
      true,
    );
    assert.equal(
      calls.some((entry) => entry.method === "createEventBookingWithOutbox"),
      false,
    );
  } finally {
    server.close();
  }
});

test("normal cloud coaching booking uses the same session row lock as sync commands", async () => {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });
      if (normalizedSql.startsWith("SELECT * FROM coaching_sessions")) {
        return {
          rowCount: 1,
          rows: [{ approval_status: "approved", available_slots: 1, end_time: "23:59:59", id: 22, session_date: "2999-01-01" }],
        };
      }
      if (normalizedSql.startsWith("SELECT id, active_member FROM users")) return { rowCount: 1, rows: [{ active_member: 1, id: 9 }] };
      if (normalizedSql.startsWith("SELECT 1 FROM coaching_session_bookings")) return { rowCount: 0, rows: [] };
      if (normalizedSql.startsWith("SELECT COUNT(*)::int AS count")) return { rowCount: 1, rows: [{ count: 0 }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const gateway = createScheduleGateway({
    databaseEngine: "postgres",
    pool: { async connect() { return client; } },
  });

  await gateway.createCoachingSessionBooking({
    sessionId: 22,
    timestampParts: ["2026-09-02", "10:00:00"],
    username: "robin",
  });

  assert.equal(
    queries.some((entry) => entry.sql.includes("FROM coaching_sessions WHERE id = $1 FOR UPDATE")),
    true,
  );
});

test("locked cloud coaching booking rechecks a session changed to unapproved", async () => {
  const client = {
    async query(sql) {
      const normalizedSql = String(sql).replace(/\s+/g, " ").trim();
      if (normalizedSql.startsWith("SELECT * FROM coaching_sessions")) {
        return { rowCount: 1, rows: [{ approval_status: "rejected", available_slots: 1, end_time: "23:59:59", id: 22, session_date: "2999-01-01" }] };
      }
      if (normalizedSql.startsWith("SELECT id, active_member FROM users")) return { rowCount: 1, rows: [{ active_member: 1, id: 9 }] };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const gateway = createScheduleGateway({
    databaseEngine: "postgres",
    pool: { async connect() { return client; } },
  });

  await assert.rejects(
    gateway.createCoachingSessionBooking({
      sessionId: 22,
      timestampParts: ["2026-09-02", "10:00:00"],
      username: "robin",
    }),
    (error) => error.code === "coaching_session_not_bookable" && error.statusCode === 400,
  );
});
