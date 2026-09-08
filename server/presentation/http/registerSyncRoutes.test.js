import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import express from "express";
import { registerSyncRoutes } from "./registerSyncRoutes.js";
import { registerPublicationSyncRoutes } from "./registerPublicationSyncRoutes.js";
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

test("v2 publication backlog returns retryable 503 without answering from a partial drain", async () => {
  const handlers = new Map();
  let calls = 0;
  const unexpectedRead = () => assert.fail("must not read a head/page after an incomplete drain");
  registerPublicationSyncRoutes({
    app: { get(path, ...chain) { handlers.set(path, chain.at(-1)); }, post(path, ...chain) { handlers.set(path, chain.at(-1)); } },
    authenticateMachineRequest() {},
    publicationGateway: { async publishBatch() { calls += 1; return [{ publicationCursor: String(calls) }]; }, getPublicationHead: unexpectedRead, listPublishedChanges: unexpectedRead },
  });
  for (const path of ["/api/sync/v2/status", "/api/sync/v2/pull"]) {
    let status;
    let body;
    calls = 0;
    await handlers.get(path)({ body: { checkpoint: "0" } }, { status(code) { status = code; return this; }, json(value) { body = value; } });
    assert.equal(calls, 100);
    assert.equal(status, 503);
    assert.equal(body.code, "publication_backlog");
  }
});

test("v2 propagates publication failure without returning a successful head or pull", async () => {
  const handlers = [];
  const failure = new Error("publisher failed");
  registerPublicationSyncRoutes({
    app: { get(path, ...chain) { if (path !== "/api/sync/v2/events") handlers.push(chain.at(-1)); }, post(_path, ...chain) { handlers.push(chain.at(-1)); } },
    authenticateMachineRequest() {},
    publicationGateway: {
      async createSnapshot() { throw failure; },
      async publishBatch() { throw failure; },
    },
  });
  for (const handler of handlers) {
    await assert.rejects(handler({ body: { checkpoint: "0" } }, { json() { assert.fail("must not return success"); } }), (error) => error === failure);
  }
});

test("v2 snapshot returns the authenticated publication boundary and authoritative snapshot", async () => {
  const handlers = new Map();
  const authenticate = () => {};
  registerPublicationSyncRoutes({
    app: {
      get() {},
      post(path, ...chain) { handlers.set(path, chain); },
    },
    authenticateMachineRequest: authenticate,
    publicationGateway: {
      async createSnapshot() {
        return {
          checkpoint: "9007199254740993",
          snapshot: { roles: [{ role_key: "member", title: "Member" }] },
        };
      },
    },
  });
  const chain = handlers.get("/api/sync/v2/snapshot");
  assert.equal(chain[0], authenticate);
  let body;
  await chain[1]({}, { json(value) { body = value; } });
  assert.deepEqual(body, {
    success: true,
    feedVersion: "sync-publication-v2",
    mode: "snapshot",
    checkpoint: "9007199254740993",
    snapshot: { roles: [{ role_key: "member", title: "Member" }] },
  });
});

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
  gatewayOverrides = {},
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
      ...gatewayOverrides,
    },
  });

  return app;
}

const machineHeaders = {
  "x-sync-machine-id": "pi-1",
  "x-sync-machine-secret": "sync-secret",
};

function createListenerDouble() {
  const client = new EventEmitter();
  const queries = [];
  const releases = [];
  let resolveReleased;
  const released = new Promise((resolve) => { resolveReleased = resolve; });
  client.query = async (sql) => { queries.push(sql); return { rows: [] }; };
  client.release = (destroy) => { releases.push(destroy); resolveReleased(); };
  return { client, queries, released, releases };
}

async function* readSseFrames(response) {
  let buffer = "";
  for await (const chunk of response) {
    buffer += chunk;
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      yield frame;
    }
  }
}

test("sync events reject missing, URL-only, and invalid machine credentials", async () => {
  let connections = 0;
  const app = createSyncTestApp({ gatewayOverrides: {
    pool: { connect() { connections += 1; throw new Error("Must authenticate first"); } },
  } });
  const { baseUrl, server } = await startTestServer(app);
  try {
    for (const [path, headers] of [
      ["/api/sync/v1/events", {}],
      ["/api/sync/v1/events?x-sync-machine-id=pi-1&x-sync-machine-secret=sync-secret", {}],
      ["/api/sync/v1/events", { ...machineHeaders, "x-sync-machine-secret": "wrong" }],
    ]) {
      const response = await requestJson(baseUrl, path, { headers });
      assert.equal(response.status, 401);
    }
    assert.equal(connections, 0);
  } finally {
    server.close();
  }
});

test("sync events send ready then metadata notifications and clean up on HTTP close", { timeout: 5000 }, async (t) => {
  const { client, queries, released, releases } = createListenerDouble();
  const notify = (data, channel = "archery_sync_change") => client.emit("notification", {
    channel, payload: JSON.stringify(data),
  });
  const app = createSyncTestApp({ gatewayOverrides: {
    pool: { async connect() { return client; } },
    async getLatestCheckpoint(queryClient) {
      assert.equal(queryClient, client);
      assert.deepEqual(queries, ["LISTEN archery_sync_change"]);
      notify({ change_id: 13, domain: "users", payload_json: { secret: "hidden" } });
      return 12;
    },
  } });
  const { baseUrl, server } = await startTestServer(app);
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await new Promise((resolve, reject) => {
    const request = http.get(`${baseUrl}/api/sync/v1/events`, { headers: machineHeaders }, resolve);
    request.on("error", reject);
    t.after(() => request.destroy());
  });
  t.after(() => response.destroy());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/event-stream");
  assert.match(response.headers["cache-control"], /no-cache/);
  assert.equal(response.headers.connection, "keep-alive");
  assert.equal(response.headers["x-accel-buffering"], "no");
  const frames = readSseFrames(response);
  assert.equal((await frames.next()).value, 'event: sync.ready\ndata: {"checkpoint":12,"serverVersion":"sync-v1"}');
  assert.equal((await frames.next()).value, 'event: sync.available\ndata: {"checkpoint":13,"domain":"users"}');

  notify({ change_id: 14, domain: "users" }, "another_channel");
  client.emit("notification", { channel: "archery_sync_change", payload: "not json" });
  for (const invalid of [null, [], {}, { change_id: "14", domain: "users" },
    { change_id: -1, domain: "users" }, { change_id: 1.5, domain: "users" },
    { change_id: 14, domain: "" }, { change_id: 14, domain: {} }]) notify(invalid);
  notify({ change_id: 15, domain: "roles", payload_json: { secret: "hidden" }, record_key: "private" });
  assert.equal((await frames.next()).value, 'event: sync.available\ndata: {"checkpoint":15,"domain":"roles"}');
  response.destroy();
  await released;
  assert.deepEqual(queries, ["LISTEN archery_sync_change", "UNLISTEN archery_sync_change"]);
  assert.deepEqual(releases, [false]);
  assert.equal(client.listenerCount("notification"), 0);
  assert.equal(client.listenerCount("error"), 0);
});

function createStreamHarness(gateway, publication = false) {
  let handler;
  const register = publication ? registerPublicationSyncRoutes : registerSyncRoutes;
  register({
    app: {
      get(path, _auth, route) { if (path === (publication ? "/api/sync/v2/events" : "/api/sync/v1/events")) handler = route; },
      post() {},
    },
    authenticateMachineRequest() {},
    syncGateway: gateway,
    publicationGateway: gateway,
  });
  const req = new EventEmitter();
  const res = new EventEmitter();
  const writes = [];
  res.setHeader = () => {};
  res.flushHeaders = () => { res.headersSent = true; };
  res.write = (text) => { writes.push(text); return true; };
  res.end = () => { res.writableEnded = true; res.emit("close"); };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (value) => { res.body = value; res.end(); };
  return { req, res, writes, run: () => handler(req, res) };
}

test("v2 SSE listens first, preserves setup wake-ups and reconciles lost wake-ups on heartbeat", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { client, queries, releases, released } = createListenerDouble();
  let head = "9007199254740992";
  let first = true;
  let published = 0;
  const stream = createStreamHarness({ pool: { async connect() { return client; } },
    async publishBatch() { assert.equal(queries[0], "LISTEN archery_sync_change"); published += 1; return []; },
    async getPublicationHead() {
      if (first) {
        first = false;
        client.emit("notification", { channel: "archery_sync_change", payload: '{"change_id":999,"payload":"SECRET"}' });
        return "9007199254740991";
      }
      return head;
    },
  }, true);
  await stream.run();
  // Drain promise microtasks, without wall-clock sleeps.
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  assert.match(stream.writes[0], /sync.ready/);
  assert.match(stream.writes[0], /"checkpoint":"9007199254740991"/);
  assert.match(stream.writes[1], /sync.available/);
  assert.match(stream.writes[1], /"checkpoint":"9007199254740992"/);
  assert.ok(!stream.writes.join("").includes("SECRET"));
  head = "9007199254740993"; // Durable progress with no notification.
  t.mock.timers.tick(25000);
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  assert.equal(stream.writes[2], ": ping\n\n");
  assert.match(stream.writes[3], /"checkpoint":"9007199254740993"/);
  client.emit("error", new Error("listener lost"));
  stream.req.emit("aborted");
  await released;
  const before = published;
  t.mock.timers.tick(50000);
  assert.equal(published, before);
  assert.deepEqual(releases, [true]);
  assert.equal(client.listenerCount("notification"), 0);
  assert.equal(client.listenerCount("error"), 0);
});

test("v2 SSE coalesces a notification burst and discards a slow reader", async () => {
  const { client, released, releases } = createListenerDouble();
  let head = "0";
  let unblock;
  const barrier = new Promise((resolve) => { unblock = resolve; });
  let calls = 0;
  const stream = createStreamHarness({ pool: { async connect() { return client; } },
    async publishBatch() { calls += 1; if (calls === 2) await barrier; return []; }, async getPublicationHead() { return head; },
  }, true);
  await stream.run();
  for (let i = 0; i < 100; i += 1) client.emit("notification", { channel: "archery_sync_change", payload: "ignored" });
  head = "1";
  stream.res.write = () => false;
  unblock();
  await released;
  assert.equal(stream.res.writableEnded, true);
  assert.deepEqual(releases, [false]);
  assert.equal(calls, 2);
});

for (const stage of ["startup", "streaming"]) {
  test(`v2 SSE bounds ${stage} backlog and releases its listener`, async () => {
    const { client, released, releases } = createListenerDouble();
    let backlog = stage === "startup";
    const stream = createStreamHarness({ pool: { async connect() { return client; } },
      async publishBatch() { return backlog ? [{}] : []; }, async getPublicationHead() { return "0"; },
    }, true);
    await stream.run();
    if (stage === "streaming") {
      backlog = true;
      client.emit("notification", { channel: "archery_sync_change" });
    }
    await released;
    assert.deepEqual(releases, [false]);
    if (stage === "startup") { assert.equal(stream.res.statusCode, 503); assert.deepEqual(stream.writes, []); }
    else assert.equal(stream.res.writableEnded, true);
  });
}

test("v2 SSE releases late connections and disconnects on publication failure", async () => {
  const late = createListenerDouble();
  let connect;
  const stream = createStreamHarness({ pool: { connect() { return new Promise((resolve) => { connect = resolve; }); } } }, true);
  const running = stream.run();
  stream.req.emit("aborted");
  connect(late.client);
  await running;
  await late.released;
  assert.deepEqual(late.releases, [false]);
  assert.deepEqual(stream.writes, []);
  const live = createListenerDouble();
  let fail = false;
  const active = createStreamHarness({ pool: { async connect() { return live.client; } },
    async publishBatch() { if (fail) throw new Error("publisher failed"); return []; }, async getPublicationHead() { return "0"; },
  }, true);
  await active.run();
  fail = true;
  live.client.emit("notification", { channel: "archery_sync_change" });
  await live.released;
  assert.equal(active.res.writableEnded, true);
});

for (const stage of ["LISTEN", "publish", "head", "UNLISTEN"]) {
  test(`v2 SSE cleans up a ${stage} failure`, async () => {
    const { client, released, releases } = createListenerDouble();
    const query = client.query;
    client.query = async (sql) => {
      if (sql.startsWith(`${stage} `)) throw new Error(`${stage} failed`);
      return query(sql);
    };
    const stream = createStreamHarness({ pool: { async connect() { return client; } },
      async publishBatch() { if (stage === "publish") throw new Error("publish failed"); return []; },
      async getPublicationHead() { if (stage === "head") throw new Error("head failed"); return "0"; },
    }, true);
    if (stage === "UNLISTEN") { await stream.run(); stream.res.emit("close"); }
    else await assert.rejects(stream.run(), new RegExp(`${stage} failed`));
    await released;
    assert.deepEqual(releases, [stage === "UNLISTEN"]);
    assert.equal(client.listenerCount("notification"), 0);
    assert.equal(client.listenerCount("error"), 0);
  });
}

for (const stage of ["LISTEN", "publish"]) {
  test(`v2 SSE cleans up HTTP abort during ${stage}`, async () => {
    const { client, released, releases } = createListenerDouble();
    let reach;
    let resume;
    const reached = new Promise((resolve) => { reach = resolve; });
    const barrier = new Promise((resolve) => { resume = resolve; });
    const query = client.query;
    client.query = async (sql) => {
      if (stage === "LISTEN" && sql.startsWith("LISTEN ")) { reach(); await barrier; }
      return query(sql);
    };
    const stream = createStreamHarness({ pool: { async connect() { return client; } },
      async publishBatch() { reach(); await barrier; return []; },
      getPublicationHead() { assert.fail("no head read after abort"); },
    }, true);
    const running = stream.run();
    await reached;
    stream.req.emit("aborted");
    resume();
    await running;
    await released;
    assert.deepEqual(stream.writes, []);
    assert.deepEqual(releases, [false]);
  });
}

test("sync events heartbeat stops and database failure ends the stream with idempotent cleanup", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { client, queries, released, releases } = createListenerDouble();
  const { req, res, writes, run } = createStreamHarness({
    pool: { async connect() { return client; } },
    async getLatestCheckpoint() { return 12; },
  });
  await run();
  t.mock.timers.tick(25000);
  assert.equal(writes.at(-1), ": ping\n\n");
  assert.equal(writes.length, 2);
  client.emit("error", new Error("connection lost"));
  req.emit("aborted");
  res.emit("close");
  await released;
  assert.equal(res.writableEnded, true);
  t.mock.timers.tick(50000);
  assert.equal(writes.length, 2);
  assert.deepEqual(queries, ["LISTEN archery_sync_change", "UNLISTEN archery_sync_change"]);
  assert.deepEqual(releases, [true]);
  assert.equal(client.listenerCount("notification"), 0);
  assert.equal(client.listenerCount("error"), 0);
});

test("sync events release a client acquired after HTTP abort", async () => {
  const { client, queries, released, releases } = createListenerDouble();
  let connect;
  const { req, writes, run } = createStreamHarness({
    pool: { connect() { return new Promise((resolve) => { connect = resolve; }); } },
    getLatestCheckpoint() { assert.fail("No checkpoint query after abort"); },
  });
  const running = run();
  req.emit("aborted");
  connect(client);
  await running;
  await released;
  assert.deepEqual(queries, ["UNLISTEN archery_sync_change"]);
  assert.deepEqual(releases, [false]);
  assert.deepEqual(writes, []);
  assert.equal(client.listenerCount("error"), 0);
});

test("sync events clean up failed setup and discard clients when UNLISTEN fails", async () => {
  for (const failure of ["LISTEN", "checkpoint", "UNLISTEN"]) {
    const { client, released, releases } = createListenerDouble();
    const setupError = new Error("setup failed");
    client.query = async (sql) => {
      if (sql.startsWith(`${failure} `)) throw setupError;
    };
    const { res, run } = createStreamHarness({
      pool: { async connect() { return client; } },
      async getLatestCheckpoint() {
        if (failure === "checkpoint") throw setupError;
        return 12;
      },
    });
    if (failure === "UNLISTEN") {
      await run();
      res.emit("close");
    } else {
      await assert.rejects(run(), setupError);
      assert.equal(res.headersSent, undefined);
    }
    await released;
    assert.deepEqual(releases, [failure === "UNLISTEN"]);
    assert.equal(client.listenerCount("notification"), 0);
    assert.equal(client.listenerCount("error"), 0);
  }
});

test("sync events clean up when HTTP closes during LISTEN or checkpoint setup", async () => {
  for (const phase of ["LISTEN", "checkpoint"]) {
    const { client, queries, released, releases } = createListenerDouble();
    let finishQuery;
    let queryStarted;
    const started = new Promise((resolve) => { queryStarted = resolve; });
    const pendingQuery = () => new Promise((resolve) => {
      finishQuery = resolve;
      queryStarted();
    });
    client.query = async (sql) => {
      queries.push(sql);
      if (phase === "LISTEN" && sql === "LISTEN archery_sync_change") await pendingQuery();
    };
    const { req, res, writes, run } = createStreamHarness({
      pool: { async connect() { return client; } },
      async getLatestCheckpoint() {
        assert.equal(phase, "checkpoint");
        await pendingQuery();
        return 12;
      },
    });
    const running = run();
    await started;
    res.emit("close");
    req.emit("aborted");
    finishQuery();
    await running;
    await released;
    assert.deepEqual(queries, ["LISTEN archery_sync_change", "UNLISTEN archery_sync_change"]);
    assert.deepEqual(releases, [false]);
    assert.deepEqual(writes, []);
    assert.equal(client.listenerCount("notification"), 0);
    assert.equal(client.listenerCount("error"), 0);
  }
});

test("sync events disconnect slow readers and release the listener", async () => {
  const { client, released, releases } = createListenerDouble();
  const { res, run } = createStreamHarness({
    pool: { async connect() { return client; } },
    async getLatestCheckpoint() { return 12; },
  });
  await run();
  res.write = () => false;
  client.emit("notification", {
    channel: "archery_sync_change", payload: '{"change_id":13,"domain":"users"}',
  });
  await released;
  assert.equal(res.writableEnded, true);
  assert.deepEqual(releases, [false]);
});

test("authenticated snapshot and incremental pulls still return the sync checkpoint", async () => {
  const { baseUrl, server } = await startTestServer(createSyncTestApp());
  try {
    for (const [checkpoint, mode] of [[null, "snapshot"], [10, "incremental"]]) {
      const response = await requestJson(baseUrl, "/api/sync/v1/pull", {
        body: { checkpoint }, headers: machineHeaders, method: "POST",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(response.body.checkpoint, 12);
      assert.equal(response.body.mode, mode);
      assert.equal(response.body.serverVersion, "sync-v1");
    }
  } finally {
    server.close();
  }
});

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
