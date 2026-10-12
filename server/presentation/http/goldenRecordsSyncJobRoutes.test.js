import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

test("admin sync queues durable worker execution and returns before the scan completes", async () => {
  const routes = new Map();
  const events = [];
  let starts = 0;
  let actor = { username: "admin", user_type: "admin" };
  const job = { id: "job-1", state: "queued", attemptedCount: 0 };
  registerAdminMemberRoutes({
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => actor,
    goldenRecordsManualTaskQueue: { enqueue: async () => {} },
    isCloudRun: true,
    goldenRecordsSyncJob: {
      queueManual: async ({ actorUsername, enqueue }) => {
        assert.equal(actorUsername, "admin");
        await enqueue({ id: job.id, actorUsername });
        starts += 1;
        return { queued: true, status: job };
      },
      getStatus: async () => job,
    },
    serverEventBus: { broadcastToAll: (...args) => events.push(args) },
  });
  async function call(method, path) {
    let status = 200;
    let body;
    await routes.get(`${method} ${path}`)({}, {
      status(value) { status = value; return this; },
      json(value) { body = value; },
    });
    return { status, body };
  }
  actor = null;
  assert.equal((await call("POST", "/api/golden-records/sync-outdoor-table")).status, 401);
  actor = { username: "member", user_type: "general" };
  assert.equal((await call("POST", "/api/golden-records/sync-outdoor-table")).status, 403);
  assert.equal(starts, 0);
  actor = { username: "admin", user_type: "admin" };
  assert.equal((await call("POST", "/api/golden-records/sync-outdoor-table")).status, 202);
  assert.equal(starts, 1);
  assert.equal(events[0][0], "golden-records.updated");
  assert.equal((await call("GET", "/api/golden-records/member-sync-job")).body.job.id, "job-1");
});

test("admin sync reports a concurrent run without publishing a start event", async () => {
  const routes = new Map();
  const events = [];
  registerAdminMemberRoutes({
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => ({ username: "admin", user_type: "admin" }),
    goldenRecordsSyncJob: { start: async () => ({ started: false, status: { state: "running" } }) },
    serverEventBus: { broadcastToAll: (...args) => events.push(args) },
  });
  let status;
  let body;
  await routes.get("POST /api/golden-records/sync-outdoor-table")({}, {
    status(value) { status = value; return this; },
    json(value) { body = value; },
  });
  assert.equal(status, 409);
  assert.match(body.message, /already running/);
  assert.deepEqual(events, []);
});
