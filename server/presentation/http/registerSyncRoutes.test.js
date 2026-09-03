import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { registerSyncRoutes } from "./registerSyncRoutes.js";
import { createMachineSyncAuth } from "../../security/machineAuth.js";

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

function requestJson(baseUrl, path, { body = null, headers = {}, method = "GET" } = {}) {
  const url = new URL(path, baseUrl);
  const payload = body == null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: {
          ...headers,
          ...(payload
            ? {
                "content-length": Buffer.byteLength(payload),
                "content-type": "application/json",
              }
            : {}),
        },
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

function createSyncTestApp({
  bookingOutcome = {
    accepted: false,
    code: "event_not_bookable",
    reason: "The event is not approved for booking.",
  },
} = {}) {
  const app = express();
  app.use(express.json());
  const machineAuth = createMachineSyncAuth({
    credentials: [
      {
        machineId: "pi-1",
        secretHash: "hashed-sync-secret",
      },
    ],
    verifySecret: (provided, stored) =>
      provided === "sync-secret" && stored === "hashed-sync-secret",
  });

  registerSyncRoutes({
    app,
    authenticateMachineRequest: machineAuth.authenticateMachineRequest,
    syncGateway: {
      pool: {
        async connect() {
          return {
            async query(sql) {
              if (String(sql).includes("BEGIN")) {
                return { rowCount: 0, rows: [] };
              }

              return { rowCount: 0, rows: [] };
            },
            release() {},
          };
        },
      },
      async getAuthSnapshot() {
        return {
          checkpoint: 12,
          snapshot: {
            permissions: [],
            rolePermissions: [],
            roles: [],
            userDisciplines: [],
            userTypes: [],
            users: [],
          },
        };
      },
      async getLatestCheckpoint() {
        return 12;
      },
      async listChangesAfterCheckpoint() {
        return [];
      },
      async upsertLoginEventFromSync() {
        return undefined;
      },
      async upsertGuestLoginEventFromSync() {
        return undefined;
      },
      async processRangePresenceCommand() {
        return {
          accepted: false,
          code: "range_presence_conflict",
          reason: "The range presence extension is stale and must be refreshed from cloud state.",
        };
      },
      async processBookingCommand() {
        return bookingOutcome;
      },
    },
  });

  return app;
}

test("sync routes reject requests without machine credentials", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/pull", {
      body: {
        checkpoint: null,
        initialSync: true,
      },
      method: "POST",
    });

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      success: false,
      message: "Valid machine credentials are required.",
    });
  } finally {
    server.close();
  }
});

test("sync routes reject requests with invalid machine credentials", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/pull", {
      body: {
        checkpoint: null,
        initialSync: true,
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "wrong-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      success: false,
      message: "Valid machine credentials are required.",
    });
  } finally {
    server.close();
  }
});

test("malformed login_event still returns 400", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/push", {
      body: {
        events: [
          {
            eventId: "event-1",
            eventType: "login_event",
            payload: {
              username: "robin",
            },
          },
        ],
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "sync-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      success: false,
      message: "Malformed sync event payload.",
    });
  } finally {
    server.close();
  }
});

test("sync push returns terminal booking validation rejections without a 500 retry loop", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/push", {
      body: {
        events: [
          {
            eventId: "event-2",
            eventType: "event_booking_created",
            payload: {
              bookedAtDate: "2026-09-02",
              bookedAtTime: "10:00:00.000Z",
              syncId: "event-sync-1",
              username: "robin",
            },
          },
        ],
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "sync-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      acceptedEventIds: [],
      rejectedEvents: [
        {
          code: "event_not_bookable",
          eventId: "event-2",
          reason: "The event is not approved for booking.",
        },
      ],
      success: true,
    });
  } finally {
    server.close();
  }
});

test("booking command with an event ID but missing username receives a terminal rejection", async () => {
  const app = createSyncTestApp({
    bookingOutcome: {
      accepted: false,
      code: "malformed_booking_command",
      reason: "A master sync ID and member username are required.",
    },
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/push", {
      body: {
        events: [{
          eventId: "booking-missing-username",
          eventType: "event_booking_created",
          payload: { syncId: "event-sync-1" },
        }],
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "sync-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.rejectedEvents, [{
      code: "malformed_booking_command",
      eventId: "booking-missing-username",
      reason: "A master sync ID and member username are required.",
    }]);
  } finally {
    server.close();
  }
});

test("malformed guest_login_event still returns 400", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/push", {
      body: {
        events: [
          {
            eventId: "guest-1",
            eventType: "guest_login_event",
            payload: {
              firstName: "Robin",
            },
          },
        ],
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "sync-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      success: false,
      message: "Malformed sync event payload.",
    });
  } finally {
    server.close();
  }
});

test("presence command returns terminal conflict details without retrying forever", async () => {
  const app = createSyncTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/sync/v1/push", {
      body: {
        events: [
          {
            eventId: "presence-1",
            eventType: "range_presence_extension_upsert",
            payload: {
              activeUntilDate: "2026-09-03",
              activeUntilTime: "20:00:00",
              expectedVersion: 0,
              updatedAtDate: "2026-09-03",
              updatedAtTime: "18:00:00",
              updatedByUsername: "robin",
              username: "robin",
            },
          },
        ],
      },
      headers: {
        "x-sync-machine-id": "pi-1",
        "x-sync-machine-secret": "sync-secret",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.rejectedEvents, [
      {
        code: "range_presence_conflict",
        eventId: "presence-1",
        reason: "The range presence extension is stale and must be refreshed from cloud state.",
      },
    ]);
  } finally {
    server.close();
  }
});
