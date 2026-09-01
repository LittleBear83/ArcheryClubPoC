import assert from "node:assert/strict";
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

function createSyncTestApp() {
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

test("sync push rejects malformed payloads safely", async () => {
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
