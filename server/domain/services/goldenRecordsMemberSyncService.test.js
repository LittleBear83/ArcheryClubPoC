import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";

function buildTestService({
  disciplines = ["Recurve Bow"],
  users = [],
  currentHandicapService,
  existingEntries = [],
  snapshot,
  updateGoldenRecordsId = async () => {},
} = {}) {
  const storedSnapshots = new Map();
  const createdEntries = [];
  const updatedEntries = [];
  let outdoorEntries = [...existingEntries];

  const service = createGoldenRecordsMemberSyncService({
    distanceSignOffYards: [20, 30, 40, 50, 60, 80, 100],
    getUtcTimestampParts: () => ["2026-07-28", "12:00:00"],
    goldenRecordsCurrentHandicapService: currentHandicapService ?? {
      isEnabled: true,
      getSnapshotForMember: async () => snapshot,
    },
    goldenRecordsSyncGateway: {
      findByUsername: async () => null,
      upsertSnapshot: async ({username, snapshot}) => storedSnapshots.set(username, JSON.parse(JSON.stringify(snapshot))),
    },
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () =>
        disciplines.map((discipline) => ({ discipline })),
      listAllUsers: async () => users,
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
    storedSnapshots,
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

test("Golden Records sync treats 252 White and 252 Black as 20yd and 30yd awards", async () => {
  const snapshot = {
    achievements: [
      {
        achievement: "252 White",
        achieved: "2026-05-01T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 White",
        achieved: "2026-05-08T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 White",
        achieved: "2026-05-15T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 Black",
        achieved: "2026-06-01T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 Black",
        achieved: "2026-06-08T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 Black",
        achieved: "2026-06-15T09:00:00Z",
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
  assert.equal(createdEntries.length, 1);
  assert.equal(createdEntries[0].award25220, true);
  assert.equal(createdEntries[0].award25230, true);
  assert.deepEqual(createdEntries[0].award25220SignOffDates, [
    "2026-05-01",
    "2026-05-08",
    "2026-05-15",
  ]);
  assert.deepEqual(createdEntries[0].award25230SignOffDates, [
    "2026-06-01",
    "2026-06-08",
    "2026-06-15",
  ]);
});

test("Golden Records sync normalizes mixed 252 aliases and numbered awards into canonical progress", async () => {
  const snapshot = {
    achievements: [
      {
        achievement: "252@20Yds/3",
        achieved: "2026-06-25T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 Black",
        achieved: "2026-03-01T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252 White",
        achieved: "2025-04-23T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252@20Yds/2",
        achieved: "2025-06-25T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
      {
        achievement: "252@30Yds/3",
        achieved: "2026-03-08T09:00:00Z",
        bowClass: "Recurve",
        memberId: "gr-123",
        round: "",
      },
    ],
    candidateMatches: [],
    classifications: [],
    enabled: true,
    fetchedAt: "2026-08-16T15:19:49.770Z",
    handicaps: [
      {
        bowClass: "Recurve",
        handicap: 71,
        type: "Outdoor",
      },
    ],
    matchedMemberId: "gr-123",
    matchedMemberName: "Robin Archer",
    matchSource: "matched-id",
  };
  const { createdEntries, service } = buildTestService({ snapshot });

  await service.syncMember({
    archery_gb_membership_number: "123456",
    first_name: "Robin",
    gr_id: "gr-123",
    surname: "Archer",
    username: "robin",
  });

  assert.equal(createdEntries.length, 1);
  assert.equal(createdEntries[0].award25220, true);
  assert.equal(createdEntries[0].award25230, true);
  assert.deepEqual(createdEntries[0].award25220SignOffDates, [
    "2025-04-23",
    "2025-06-25",
    "2026-06-25",
  ]);
  assert.deepEqual(createdEntries[0].award25230SignOffDates, [
    "2026-03-01",
    "2026-03-08",
    "2026-03-08",
  ]);
});

test("repeated sync preserves raw rows and does not duplicate or update outdoor awards", async () => {
  const source = { achievement: "252@40YDS/3", achievementId: "third", achieved: "2026-06-01", memberId: "gr-123", bowClass: "Recurve" };
  const snapshot = { enabled: true, matchedMemberId: "gr-123", achievements: [source, source], handicaps: [], classifications: [] };
  const { service, createdEntries, updatedEntries, storedSnapshots } = buildTestService({ snapshot });
  const user = { username: "robin", gr_id: "gr-123" };
  const first = await service.syncMember(user);
  const second = await service.syncMember(user);
  assert.equal(createdEntries.length, 1);
  assert.equal(updatedEntries.length, 0);
  assert.equal(createdEntries[0].award25240, true);
  assert.deepEqual(first.goldenRecords.rawAchievements, [source, source]);
  assert.equal(first.goldenRecords.achievements.length, 3);
  assert.deepEqual(second.goldenRecords, first.goldenRecords);
  assert.equal(storedSnapshots.size, 1);
  assert.deepEqual(storedSnapshots.get("robin").rawAchievements, [source, source]);
  assert.equal(storedSnapshots.get("robin").achievements.filter((row) => row.derived).length, 2);
});

test("club sync fetches once, persists links, leaves archived/unmatched members intact and repeats safely", async () => {
  const users = [{username: "matched", email_address: "member@example.com"}, {username: "archived", gr_id: "old"}, {username: "unmatched"}];
  const persistedIds = [];
  let fetchCount = 0;
  const clubData = { members: [], achievementsByMember: new Map() };
  const { service, createdEntries, updatedEntries } = buildTestService({
    users,
    updateGoldenRecordsId: async (...args) => persistedIds.push(args),
    currentHandicapService: {
      isEnabled: true,
      fetchClubData: async () => { fetchCount += 1; return clubData; },
      getSnapshotForMember: async (criteria) => {
        assert.equal(criteria.clubData, clubData);
        const matched = criteria.email === "member@example.com";
        return { enabled: true, matchedMemberId: matched ? "new" : "", matchSource: matched ? "email" : "not-found", achievements: matched ? [{achievement: "252@20YDS/2", memberId: "new", bowClass: "Recurve", achieved: "2026-01-01"}] : [] };
      },
    },
  });
  for (let run = 0; run < 2; run += 1) {
    const result = await service.syncAllMembers();
    assert.equal(result.matchedCount, 1);
    assert.equal(result.unmatchedCount, 2);
    assert.equal(result.errorCount, 0);
  }
  assert.equal(fetchCount, 2);
  assert.deepEqual(persistedIds, [["matched", "new"]]);
  assert.equal(users.length, 3);
  assert.equal(users[1].gr_id, "old");
  assert.equal(createdEntries.length, 1);
  assert.equal(updatedEntries.length, 0);
  assert.deepEqual(createdEntries[0].award25220SignOffDates, ["2026-01-01", "2026-01-01", ""]);
  assert.equal(createdEntries[0].award25220, false);
});

test("a unique name match persists its Golden Records ID", async () => {
  const saved = [];
  const { service } = buildTestService({
    snapshot: {
      enabled: true,
      matchedMemberId: "gr-craig",
      matchSource: "name",
      achievements: [],
      handicaps: [],
      classifications: [],
    },
    updateGoldenRecordsId: async (...args) => saved.push(args),
  });
  const user = {username: "Cfleetham", first_name: "Craig", surname: "Fleetham"};
  await service.syncMember(user);
  await service.syncMember(user);
  assert.deepEqual(saved, [["Cfleetham", "gr-craig"]]);
  assert.equal(user.gr_id, "gr-craig");
});
