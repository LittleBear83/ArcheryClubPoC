import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

test("admin sync authorizes the start, returns immediately and publishes job invalidation", async () => {
  const routes = new Map();
  const events = [];
  let starts = 0;
  let actor = { username: "admin", user_type: "admin" };
  const job = { id: "job-1", state: "running", attemptedCount: 0 };
  registerAdminMemberRoutes({
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => actor,
    goldenRecordsSyncJob: {
      start: async () => { starts += 1; return { started: true, status: job }; },
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
