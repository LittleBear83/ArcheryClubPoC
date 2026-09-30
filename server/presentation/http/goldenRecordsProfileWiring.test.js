import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";

test("profile load retains the stored Golden Records snapshot for the visible profile", () => {
  const source = readFileSync(new URL("../../../src/presentation/pages/profile/useProfilePageDataState.ts", import.meta.url), "utf8");
  assert.match(source, /setGoldenRecordsSnapshot\(result\.goldenRecords\s*\?\?\s*null\)/);
});

test("profile API returns the freshly persisted Golden Records snapshot", async () => {
  const handlers = new Map();
  const snapshot = { matchedMemberId: "gr-123", matchSource: "membership-id", handicaps: [{ type: "outdoor", handicap: 37 }] };
  const user = { username: "robin", first_name: "Robin", surname: "Archer", gr_id: "gr-123" };
  registerAdminMemberRoutes({
    app: { get: (path, fn) => handlers.set(path, fn), post() {}, put() {}, delete() {} },
    actorHasPermission: () => false,
    ALLOWED_DISCIPLINES: [],
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members", SIGN_OFF_DISTANCES: "sign_off_distances" },
    getActorUser: () => ({ username: "robin" }),
    memberDirectoryGateway: {
      findUserByUsername: async () => user,
      findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }],
      findLoanBowByUsername: async () => null,
    },
    memberDistanceSignOffRepository: { listByDiscipline: async () => [] },
    goldenRecordsMemberSyncService: { getStoredSnapshotForUser: async () => snapshot },
    buildEditableMemberProfile: () => ({ username: "robin" }),
    buildMemberUserProfile: () => ({ username: "robin" }),
    listAssignableRoleKeys: () => [],
  });
  let body;
  await handlers.get("/api/user-profiles/:username")({ params: { username: "robin" } }, {
    status() { return this; }, json(value) { body = value; },
  });
  assert.equal(body.success, true);
  assert.deepEqual(body.goldenRecords, snapshot);
});
