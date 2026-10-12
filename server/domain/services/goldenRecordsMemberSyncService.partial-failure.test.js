import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

test("Golden Records sync still returns outdoor updates when distance sign-off refresh fails", async () => {
  const createdEntries = [];
  const user = {
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  };
  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20, 30, 40, 50, 60, 80, 100],
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMember: async () => ({
        achievements: [
          {
            achievement: "Archer 3rd",
            achieved: "2026-06-12T09:00:00Z",
            bowClass: "Recurve",
            memberId: "gr-123",
            round: "",
          },
          {
            achievement: "Sight mark 20 yds",
            achieved: "2026-06-01T09:00:00Z",
            bowClass: "Recurve",
            memberId: "gr-123",
            round: "",
          },
        ],
        candidateMatches: [],
        classifications: [],
        enabled: true,
        fetchedAt: "2026-07-28T12:00:00Z",
        handicaps: [
          {
            bowClass: "Recurve",
            handicap: 41,
            type: "Outdoor",
          },
        ],
        matchedMemberId: "gr-123",
        matchedMemberName: "Robin Archer",
        matchSource: "matched-id",
      }),
    },
    goldenRecordsSyncGateway: {
      findByUsername: async () => null,
      upsertSnapshot: async () => {},
    },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }],
      listAllUsers: async () => [user],
      updateGoldenRecordsId: async () => {},
    },
    memberDistanceSignOffRepository: {
      replaceForDiscipline: async () => {
        throw new Error("sign-off replace failed");
      },
    },
    outdoorTableGateway: {
      createEntry: async (entry) => {
        createdEntries.push(entry);
        return {
          id: 1,
          ...entry,
        };
      },
      listEntriesByYear: async () => [],
      updateEntry: async (entry) => entry,
    },
  });

  const result = await service.syncMember(user);

  assert.equal(result.createdCount, 1);
  assert.equal(result.syncedCount, 1);
  assert.equal(result.signOffCount, 0);
  assert.equal(result.signOffError, "sign-off replace failed");
  assert.equal(createdEntries.length, 1);
  const summary = await service.syncAllMembers();
  assert.equal(summary.matchedCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.match(summary.errors[0].message, /sign-off replace failed/);
});

test("a member API failure keeps the previous snapshot and records a retryable member error", async () => {
  let writes = 0;
  const user = { username: "robin", first_name: "Robin", surname: "Archer" };
  const service = createGoldenRecordsMemberSyncService({
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMember: async () => ({ enabled: true, error: "API timeout", achievements: [] }),
    },
    goldenRecordsSyncGateway: { upsertSnapshot: async () => { writes++; } },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () => [],
      listAllUsers: async () => [user],
    },
    logger: { info() {}, error() {} },
  });
  const summary = await service.syncAllMembers();
  assert.equal(summary.attemptedCount, 1);
  assert.equal(summary.errorCount, 1);
  assert.equal(writes, 0);
});

test("a disabled Golden Records API fails the full-club run visibly", async () => {
  const service = createGoldenRecordsMemberSyncService({
    goldenRecordsCurrentHandicapService: { isEnabled: false },
    memberDirectoryGateway: { listAllUsers: async () => [] },
  });
  await assert.rejects(service.syncAllMembers(), /not configured/);
});

test("a request-bound full-club run stops between members before its deadline", async () => {
  let attempted = 0;
  const service = createGoldenRecordsMemberSyncService({
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMember: async () => {
        attempted++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { enabled: true, matchSource: "not-found", achievements: [] };
      },
    },
    goldenRecordsSyncGateway: { upsertSnapshot: async () => {} },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () => [],
      listAllUsers: async () => [{ username: "one" }, { username: "two" }],
    },
    logger: { info() {}, error() {} },
  });
  await assert.rejects(service.syncAllMembers({ maxDurationMs: 20 }), /time budget|aborted|timeout/i);
  assert.equal(attempted, 1);
});

test("unchanged snapshots and distance sign-offs cause no writes on rerun", async () => {
  let snapshotWrites = 0;
  let signOffWrites = 0;
  let storedSnapshot = null;
  const snapshot = {
    achievements: [{ achievement: "Sight mark 20 yds", achieved: "2026-06-01T09:00:00Z", bowClass: "Recurve", memberId: "gr-123" }],
    candidateMatches: [], classifications: [], enabled: true, fetchedAt: "new fetch",
    handicaps: [], matchedMemberId: "gr-123", matchedMemberName: "Robin Archer", matchSource: "gr-id",
  };
  const user = { username: "robin", gr_id: "gr-123" };
  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20],
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: { isEnabled: true, getSnapshotForMember: async () => snapshot },
    goldenRecordsSyncGateway: {
      findByUsername: async () => storedSnapshot,
      upsertSnapshot: async (row) => { snapshotWrites++; storedSnapshot = row.snapshot; },
    },
    memberDirectoryGateway: { findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }] },
    memberDistanceSignOffRepository: {
      listByUsername: async () => [{ discipline: "Recurve Bow", distanceYards: 20, source: "golden-records", signedOffByUsername: "robin", signedOffAt: "2026-06-01", signedOffAtTime: "09:00:00" }],
      replaceForDiscipline: async () => { signOffWrites++; },
    },
    outdoorTableGateway: { listEntriesByYear: async () => [] },
  });
  await service.syncMember(user);
  snapshotWrites = 0;
  await service.syncMember(user);
  assert.equal(snapshotWrites, 0);
  assert.equal(signOffWrites, 0);
});
