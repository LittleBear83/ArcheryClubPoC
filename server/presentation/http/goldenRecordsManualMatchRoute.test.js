import assert from "node:assert/strict";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

function createHarness(assignMemberMatch) {
  const handlers = new Map();
  const events = [];
  const user = { username: "robin", first_name: "Robin", surname: "Archer", gr_id: "old-id" };
  registerAdminMemberRoutes({
    app: { get: (path, fn) => handlers.set(path, fn), post: (path, fn) => handlers.set(path, fn),
      put() {}, delete() {} },
    actorHasPermission: () => true,
    getActorUser: () => ({ username: "admin" }),
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members", SIGN_OFF_DISTANCES: "sign_off_distances" },
    memberDirectoryGateway: {
      findUserByUsername: async () => user,
      updateGoldenRecordsId: async () => { throw new Error("Route must not prewrite GR ID"); },
    },
    goldenRecordsMemberSyncService: { assignMemberMatch },
    serverEventBus: {
      broadcastToAll: (name) => events.push(name),
      broadcastToAnyPermission: (names, name) => events.push(name),
      broadcastToUsers: (names, name) => events.push(name),
    },
  });
  const invoke = async (goldenRecordsId = "gr-selected") => {
    const response = { statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    await handlers.get("/api/user-profiles/:username/golden-records/assign-match")(
      { params: { username: "robin" }, body: { goldenRecordsId } }, response,
    );
    return response;
  };
  return { events, invoke, user };
}

test("successful manual selection broadcasts profile and outdoor invalidation after sync", async () => {
  const calls = [];
  const h = createHarness(async (user, options) => {
    calls.push({ user, options });
    return { goldenRecords: { enabled: true, matchedMemberId: "gr-selected" },
      createdCount: 1, updatedCount: 0, syncedCount: 1, signOffCount: 1 };
  });
  const response = await h.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(calls[0].options.goldenRecordsId, "gr-selected");
  assert.equal(calls[0].options.updatedByUsername, "admin");
  assert.ok(h.events.includes("outdoor-table.updated"));
  assert.ok(h.events.includes("members.updated"));
});

test("failed manual selection returns the cause without prewriting GR ID or broadcasting success", async () => {
  const h = createHarness(async () => { throw new Error("Invalid Golden Records page response from /api/currentclassifications."); });
  const response = await h.invoke();
  assert.equal(response.statusCode, 502);
  assert.match(response.body.message, /currentclassifications/);
  assert.equal(h.user.gr_id, "old-id");
  assert.deepEqual(h.events, []);
});
