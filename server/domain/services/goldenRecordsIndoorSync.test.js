import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

function harness(snapshot) {
  const indoor = [];
  const outdoor = [];
  const service = createGoldenRecordsMemberSyncService({
    getUtcTimestampParts: () => ["2026-10-01", "12:00:00"],
    goldenRecordsCurrentHandicapService: { isEnabled: true, getSnapshotForMember: async () => snapshot },
    goldenRecordsSyncGateway: { upsertSnapshot: async () => {} },
    memberDirectoryGateway: { findDisciplinesByUsername: async () => [
      { discipline: "Recurve Bow" }, { discipline: "Bare Bow" },
    ] },
    memberDistanceSignOffRepository: { replaceForDiscipline: async () => {} },
    indoorTableGateway: {
      listEntriesByYear: async () => indoor,
      createEntry: async (entry) => { const result = { id: indoor.length + 1, ...entry }; indoor.push(result); return result; },
      updateEntry: async (entry) => { const index = indoor.findIndex((row) => row.id === entry.id); indoor[index] = entry; return entry; },
    },
    outdoorTableGateway: {
      listEntriesByYear: async () => outdoor,
      createEntry: async (entry) => { outdoor.push(entry); return entry; },
      updateEntry: async (entry) => entry,
    },
  });
  return { indoor, outdoor, service };
}

const user = { username: "archer", first_name: "A", surname: "Archer", gr_id: "gr-1" };

test("indoor sync imports only indoor handicap records and keeps bowstyles separate", async () => {
  const snapshot = { enabled: true, matchSource: "gr-id", matchedMemberId: "gr-1",
    achievements: [], classifications: [], handicaps: [
      { memberId: "gr-1", bowClass: "Recurve", type: "Outdoor Handicap", handicap: 50 },
      { memberId: "gr-1", bowClass: "Recurve", type: "Indoor Handicap", handicap: 30, achieved: "2026-09-01" },
      { memberId: "gr-1", bowClass: "Recurve", type: "Indoor Handicap", handicap: 28, achieved: "2026-09-20" },
      { memberId: "gr-1", bowClass: "Barebow", type: "Indoor Handicap", handicap: 42 },
      { memberId: "someone-else", bowClass: "Longbow", type: "Indoor Handicap", handicap: 12 },
    ] };
  const { indoor, outdoor, service } = harness(snapshot);
  await service.syncMember(user);
  assert.deepEqual(indoor.map((row) => [row.bowType, row.handicap]), [["Rec", 28], ["B/bow", 42]]);
  assert.deepEqual(indoor.map((row) => row.classifications), [{}, {}]);
  assert.deepEqual(indoor.map((row) => row.scores), [{}, {}]);
  assert.equal(outdoor.length, 1);
  assert.equal(outdoor[0].handicap, 50);
});

test("repeated indoor sync leaves manual progress intact", async () => {
  const snapshot = { enabled: true, matchSource: "gr-id", matchedMemberId: "gr-1",
    achievements: [], classifications: [], handicaps: [
      { memberId: "gr-1", bowClass: "Recurve", type: "Indoor Handicap", handicap: 30 },
    ] };
  const { indoor, service } = harness(snapshot);
  await service.syncMember(user);
  indoor[0].classifications = { archer3rd: "2026-09-01" };
  indoor[0].scores = { 500: "2026-09-02" };
  snapshot.handicaps[0].handicap = 25;
  await service.syncMember(user);
  assert.equal(indoor.length, 1);
  assert.equal(indoor[0].handicap, 25);
  assert.equal(indoor[0].classifications.archer3rd, "2026-09-01");
  assert.equal(indoor[0].scores[500], "2026-09-02");
});
