import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

function buildTestService({
  disciplines = ["Recurve Bow"],
  existingEntries = [],
  snapshot,
  updateGoldenRecordsId = async () => {},
} = {}) {
  const createdEntries = [];
  const updatedEntries = [];
  let outdoorEntries = [...existingEntries];

  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20, 30, 40, 50, 60, 80, 100],
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: {
      isEnabled: true,
      getSnapshotForMember: async () => snapshot,
    },
    goldenRecordsSyncGateway: {
      findByUsername: async () => null,
      upsertSnapshot: async () => {},
    },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () =>
        disciplines.map((discipline) => ({ discipline })),
      listAllUsers: async () => [],
      updateGoldenRecordsId,
    },
    memberDistanceSignOffRepository: {
      replaceForDiscipline: async () => {},
    },
    outdoorTableGateway: {
      createEntry: async (entry) => {
        const createdEntry = {
          id: outdoorEntries.length + createdEntries.length + 1,
          ...entry,
        };
        createdEntries.push(createdEntry);
        outdoorEntries.push(createdEntry);
        return createdEntry;
      },
      listEntriesByYear: async () => outdoorEntries,
      updateEntry: async (entry) => {
        const updatedEntry = { ...entry };
        updatedEntries.push(updatedEntry);
        outdoorEntries = outdoorEntries.map((current) =>
          current.id === updatedEntry.id ? updatedEntry : current,
        );
        return updatedEntry;
      },
    },
  });

  return {
    createdEntries,
    service,
    updatedEntries,
  };
}

test("Golden Records sync creates an outdoor table row from outdoor handicap and achievements", async () => {
  const snapshot = {
    achievements: [
      {
        achievement: "Archer 3rd",
        achieved: "2026-06-12T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252@ 20 yds/1",
        achieved: "2026-05-01T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252@ 20 yds/2",
        achieved: "2026-05-08T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252@ 20 yds/3",
        achieved: "2026-05-15T09:00:00Z",
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
  };
  const { createdEntries, service } = buildTestService({ snapshot });

  const result = await service.syncMember({
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.syncedCount, 1);
  assert.equal(createdEntries.length, 1);
  assert.equal(createdEntries[0].archerUsername, "robin");
  assert.equal(createdEntries[0].bowType, "Rec");
  assert.equal(createdEntries[0].handicap, 41);
  assert.equal(createdEntries[0].archer3rd, true);
  assert.equal(createdEntries[0].archer3rdDate, "2026-06-12");
  assert.equal(createdEntries[0].award25220, true);
  assert.deepEqual(createdEntries[0].award25220SignOffDates, [
    "2026-05-01",
    "2026-05-08",
    "2026-05-15",
  ]);
});

test("Golden Records sync updates an existing outdoor table row for the current season", async () => {
  const snapshot = {
    achievements: [
      {
        achievement: "Bowman 1st",
        achieved: "2026-07-10T09:00:00Z",
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
        handicap: 32,
        type: "Outdoor",
      },
    ],
    matchedMemberId: "gr-123",
    matchedMemberName: "Robin Archer",
    matchSource: "matched-id",
  };
  const existingEntry = {
    id: 7,
    seasonYear: 2026,
    archerUsername: "robin",
    bowType: "Rec",
    handicap: 50,
    archer3rd: true,
    archer2nd: false,
    archer1st: false,
    bowman3rd: false,
    bowman2nd: false,
    bowman1st: false,
    masterBowman: false,
    grandMasterBowman: false,
    eliteMasterBowman: false,
    archer3rdDate: "2025-06-12",
    archer2ndDate: "",
    archer1stDate: "",
    bowman3rdDate: "",
    bowman2ndDate: "",
    bowman1stDate: "",
    masterBowmanDate: "",
    grandMasterBowmanDate: "",
    eliteMasterBowmanDate: "",
    award25220: true,
    award25230: false,
    award25240: false,
    award25250: false,
    award25260: false,
    award25280: false,
    award252100: false,
    award25220SignOffDates: ["2025-05-01", "2025-05-08", "2025-05-15"],
    award25230SignOffDates: ["", "", ""],
    award25240SignOffDates: ["", "", ""],
    award25250SignOffDates: ["", "", ""],
    award25260SignOffDates: ["", "", ""],
    award25280SignOffDates: ["", "", ""],
    award252100SignOffDates: ["", "", ""],
    cloutWhite20: false,
    cloutWhite30: false,
    cloutWhite40: false,
    cloutWhite50: false,
    cloutWhite60: false,
    cloutWhite7080: false,
    cloutWhite90100: false,
    createdAtDate: "2026-01-01",
    createdAtTime: "09:00:00",
    updatedAtDate: "2026-01-01",
    updatedAtTime: "09:00:00",
    updatedByUsername: "admin",
  };
  const { service, updatedEntries } = buildTestService({
    existingEntries: [existingEntry],
    snapshot,
  });

  const result = await service.syncMember({
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  });

  assert.equal(result.createdCount, 0);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.syncedCount, 1);
  assert.equal(updatedEntries.length, 1);
  assert.equal(updatedEntries[0].id, 7);
  assert.equal(updatedEntries[0].handicap, 32);
  assert.equal(updatedEntries[0].archer3rd, false);
  assert.equal(updatedEntries[0].archer3rdDate, "");
  assert.equal(updatedEntries[0].bowman1st, true);
  assert.equal(updatedEntries[0].bowman1stDate, "2026-07-10");
  assert.deepEqual(updatedEntries[0].award25220SignOffDates, ["", "", ""]);
  assert.equal(updatedEntries[0].updatedByUsername, "robin");
});

test("Golden Records sync accepts descriptive outdoor handicap type labels", async () => {
  const snapshot = {
    achievements: [],
    candidateMatches: [],
    classifications: [],
    enabled: true,
    fetchedAt: "2026-07-28T12:00:00Z",
    handicaps: [
      {
        bowClass: "Recurve",
        handicap: 28,
        type: "Outdoor Handicap",
      },
      {
        bowClass: "Recurve",
        handicap: 19,
        type: "Indoor Handicap",
      },
    ],
    matchedMemberId: "gr-123",
    matchedMemberName: "Robin Archer",
    matchSource: "matched-id",
  };
  const { createdEntries, service } = buildTestService({ snapshot });

  const result = await service.syncMember({
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  });

  assert.equal(result.createdCount, 1);
  assert.equal(createdEntries.length, 1);
  assert.equal(createdEntries[0].handicap, 28);
});
