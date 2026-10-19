import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

test("indoor backfill requires admin, applies reviewed plan and sends one invalidation", async () => {
  const routes = new Map();
  const events = [];
  let actor = null;
  const hash = "a".repeat(64);
  registerAdminMemberRoutes({
    app: { get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn), put() {}, delete() {} },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    getActorUser: () => actor,
    goldenRecordsMemberSyncService: {
      previewIndoorHistoricalBackfill: async () => ({ planHash: hash, inserts: [{ username: "archer" }] }),
      applyIndoorHistoricalBackfill: async (value) => {
        assert.equal(value, hash);
        return { inserted: 1, updated: 0 };
      },
    },
    serverEventBus: { broadcastToAll: (...args) => events.push(args) },
  });
  async function call(method, path, body = {}) {
    let status = 200;
    let result;
    await routes.get(`${method} ${path}`)({ body }, { status(value) { status = value; return this; }, json(value) { result = value; return this; } });
    return { status, result };
  }
  assert.equal((await call("POST", "/api/golden-records/indoor-backfill", { planHash: hash })).status, 401);
  actor = { username: "member", user_type: "member" };
  assert.equal((await call("POST", "/api/golden-records/indoor-backfill", { planHash: hash })).status, 403);
  actor = { username: "admin", user_type: "admin" };
  assert.equal((await call("GET", "/api/golden-records/indoor-backfill-preview")).result.plan.planHash, hash);
  assert.equal((await call("POST", "/api/golden-records/indoor-backfill", { planHash: hash })).result.inserted, 1);
  assert.deepEqual(events.map(([name]) => name), ["indoor-table.updated"]);
});
