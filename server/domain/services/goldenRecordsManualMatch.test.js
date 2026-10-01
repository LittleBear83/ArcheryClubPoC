import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

function createHarness({ matchSource = "not-found", failFetch = false, failSignOff = false,
  indoorOnly = false, existingIndoorRow = false } = {}) {
  const user = { username: "robin", first_name: "Robin", surname: "Archer", gr_id: "old-id" };
  const users = [user];
  const candidateSnapshot = {
    matchSource,
    candidateMatches: [{ memberId: "gr-selected", memberArchived: false, name: "Robin Archer" }],
    matchedMemberId: "",
  };
  let storedSnapshot = candidateSnapshot;
  const commits = [];
  const outdoorRows = [];
  const indoorRows = existingIndoorRow ? [{ id: 1, seasonYear: new Date().getUTCFullYear(),
    archerUsername: "robin", bowType: "Rec", handicap: 60, classifications: {}, scores: {} }] : [];
  const signOffs = [];
  const remoteSnapshot = {
    enabled: true, matchSource: "manual", matchedMemberId: "gr-selected",
    matchedMemberName: "Robin Archer", fetchedAt: "2026-09-30T12:00:00Z",
    handicaps: indoorOnly
      ? [{ memberId: "gr-selected", bowClass: "Recurve", type: "Indoor Handicap", handicap: 42 }]
      : [{ memberId: "gr-selected", bowClass: "Recurve", type: "outdoor", handicap: 37 }],
    classifications: indoorOnly ? [] : [{ memberId: "gr-selected", bowClass: "Recurve", type: "Outdoor",
      classification: "Bowman 3rd Class", achieved: "2026-09-01" }],
    achievements: indoorOnly ? [] : [
      { memberId: "gr-selected", bowClass: "Recurve", achievement: "Archer 3rd", achieved: "2026-08-01" },
      { memberId: "gr-selected", bowClass: "Recurve", achievement: "Sight mark 20 yds", achieved: "2026-08-02" },
    ],
  };
  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20, 30],
    getUtcTimestampParts: () => ["2026-09-30", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMemberById: async (id) => {
        if (failFetch) throw new Error("Invalid Golden Records page response from /api/currentclassifications.");
        assert.equal(id, "gr-selected");
        return remoteSnapshot;
      },
    },
    goldenRecordsSyncGateway: {
      findByUsername: async () => storedSnapshot,
      commitManualMatch: async (payload) => {
        commits.push(payload);
        storedSnapshot = payload.snapshot;
      },
    },
    manualMatchTransaction: async (operation) => {
      const outdoorBefore = [...outdoorRows];
      const indoorBefore = indoorRows.map((row) => ({ ...row }));
      const signOffBefore = [...signOffs];
      try { return await operation({}); } catch (error) {
        outdoorRows.splice(0, outdoorRows.length, ...outdoorBefore);
        indoorRows.splice(0, indoorRows.length, ...indoorBefore);
        signOffs.splice(0, signOffs.length, ...signOffBefore);
        throw error;
      }
    },
    memberDirectoryGateway: { findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }] },
    outdoorTableGateway: {
      listEntriesByYear: async () => outdoorRows,
      createEntry: async (row) => { outdoorRows.push(row); return row; },
      updateEntry: async () => { throw new Error("Unexpected update"); },
    },
    indoorTableGateway: {
      listEntriesByYear: async () => [...indoorRows],
      createEntry: async (row) => { const created = { id: indoorRows.length + 1, ...row };
        indoorRows.push(created); return created; },
      updateEntry: async (row) => { const index = indoorRows.findIndex((entry) => entry.id === row.id);
        indoorRows[index] = row; return row; },
    },
    memberDistanceSignOffRepository: {
      replaceForDiscipline: async (_username, _discipline, rows) => {
        if (failSignOff) throw new Error("Sign-off write failed");
        signOffs.push(...rows);
      },
    },
  });
  return { candidateSnapshot, commits, indoorRows, outdoorRows, service, signOffs,
    storedSnapshot: () => storedSnapshot, user, users };
}

for (const matchSource of ["not-found", "ambiguous"]) {
  test(`${matchSource} candidate selection stores identity, snapshot, outdoor data and sign-offs`, async () => {
    const h = createHarness({ matchSource });
    const result = await h.service.assignMemberMatch(h.user, {
      goldenRecordsId: "gr-selected", updatedByUsername: "admin",
    });
    assert.equal(h.user.gr_id, "gr-selected");
    assert.equal(h.commits.length, 1);
    assert.equal(h.commits[0].memberId, "gr-selected");
    assert.equal(h.storedSnapshot().matchedMemberId, "gr-selected");
    assert.equal(h.storedSnapshot().achievements.length, 2);
    assert.equal(h.storedSnapshot().handicaps[0].handicap, 37);
    assert.equal(h.storedSnapshot().classifications[0].classification, "Bowman 3rd Class");
    assert.equal(h.outdoorRows.length, 1);
    assert.equal(h.outdoorRows[0].handicap, 37);
    assert.equal(h.outdoorRows[0].archer3rd, true);
    assert.equal(h.outdoorRows[0].bowman3rd, true);
    assert.deepEqual(h.signOffs.map((row) => row.distanceYards), [20]);
    assert.equal(result.syncedCount, 1);
    assert.equal(h.users.length, 1);
  });
}

test("selected candidate fetch failure leaves the old GR ID and snapshot intact", async () => {
  const h = createHarness({ failFetch: true });
  await assert.rejects(() => h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  }), /Invalid Golden Records page response/);
  assert.equal(h.user.gr_id, "old-id");
  assert.equal(h.storedSnapshot(), h.candidateSnapshot);
  assert.equal(h.commits.length, 0);
  assert.equal(h.outdoorRows.length, 0);
});

test("unknown or archived candidate ID cannot be manually linked", async () => {
  const h = createHarness();
  await assert.rejects(() => h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "arbitrary-id", updatedByUsername: "admin",
  }), /Select an active Golden Records candidate/);
  h.candidateSnapshot.candidateMatches[0].memberArchived = true;
  await assert.rejects(() => h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  }), /Select an active Golden Records candidate/);
  assert.equal(h.user.gr_id, "old-id");
  assert.equal(h.commits.length, 0);
});

test("downstream sign-off failure does not commit a new GR ID or snapshot", async () => {
  const h = createHarness({ failSignOff: true });
  await assert.rejects(() => h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  }), /Sign-off write failed/);
  assert.equal(h.user.gr_id, "old-id");
  assert.equal(h.storedSnapshot(), h.candidateSnapshot);
  assert.equal(h.commits.length, 0);
  assert.equal(h.outdoorRows.length, 0);
});

test("manual match reports an Indoor-only row creation in the returned totals", async () => {
  const h = createHarness({ indoorOnly: true });
  const result = await h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  });
  assert.equal(result.createdCount, 1);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.syncedCount, 1);
  assert.equal(h.indoorRows.length, 1);
  assert.equal(h.indoorRows[0].handicap, 42);
  assert.equal(h.outdoorRows.length, 0);
  assert.equal(h.commits.length, 1);
});

test("manual match reports an Indoor-only row update in the returned totals", async () => {
  const h = createHarness({ indoorOnly: true, existingIndoorRow: true });
  const result = await h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  });
  assert.equal(result.createdCount, 0);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.syncedCount, 1);
  assert.equal(h.indoorRows[0].handicap, 42);
  assert.equal(h.outdoorRows.length, 0);
});

test("manual match still rolls back Indoor writes with the snapshot on failure", async () => {
  const h = createHarness({ indoorOnly: true, failSignOff: true });
  await assert.rejects(() => h.service.assignMemberMatch(h.user, {
    goldenRecordsId: "gr-selected", updatedByUsername: "admin",
  }), /Sign-off write failed/);
  assert.equal(h.indoorRows.length, 0);
  assert.equal(h.outdoorRows.length, 0);
  assert.equal(h.commits.length, 0);
  assert.equal(h.storedSnapshot(), h.candidateSnapshot);
  assert.equal(h.user.gr_id, "old-id");
});
