import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

test("bow discipline import is available only to developers on the cloud server", async () => {
  const routes = new Map();
  const calls = [];
  const events = [];
  let actor = null;
  registerAdminMemberRoutes({
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => actor,
    goldenRecordsBowDisciplineImportService: {
      preview: async () => { calls.push("preview"); return { planHash: "a".repeat(64), counts: { add: 1 } }; },
      apply: async ({ planHash, actorUsername }) => { calls.push(`apply:${actorUsername}:${planHash}`); return { inserted: 1 }; },
    },
    serverEventBus: { broadcastToAll: (...args) => events.push(args) },
  });
  async function call(method, path, body = {}) {
    let status = 200;
    let result;
    await routes.get(`${method} ${path}`)({ body }, { status(value) { status = value; return this; }, json(value) { result = value; return this; } });
    return { status, result };
  }
  const previewPath = "/api/golden-records/bow-disciplines/import-preview";
  const applyPath = "/api/golden-records/bow-disciplines/import";
  assert.equal((await call("GET", previewPath)).status, 401);
  actor = { username: "admin", user_type: "admin" };
  assert.equal((await call("GET", previewPath)).status, 403);
  assert.equal((await call("POST", applyPath, { planHash: "a".repeat(64) })).status, 403);
  assert.deepEqual(calls, []);
  actor = { username: "dev", user_type: "developer" };
  assert.equal((await call("POST", applyPath)).status, 400);
  assert.equal((await call("GET", previewPath)).result.plan.counts.add, 1);
  assert.equal((await call("POST", applyPath, { planHash: "a".repeat(64) })).result.inserted, 1);
  assert.deepEqual(calls, ["preview", `apply:dev:${"a".repeat(64)}`]);
  assert.equal(events[0][0], "members.updated");
});

test("local Pi cannot trigger the cloud bow discipline import", async () => {
  const routes = new Map();
  registerAdminMemberRoutes({
    syncNodeMode: "local-pi",
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => ({ username: "dev", user_type: "developer" }),
  });
  let status;
  await routes.get("GET /api/golden-records/bow-disciplines/import-preview")({}, { status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 409);
});
