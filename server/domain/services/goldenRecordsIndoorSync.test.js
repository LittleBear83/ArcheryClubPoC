import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createGoldenRecordsMemberSyncService } from "./goldenRecordsMemberSyncService.js";
import { createGoldenRecordsSyncGateway } from "../../infrastructure/persistence/goldenRecordsSyncGateway.js";
import { createIndoorTableGateway } from "../../infrastructure/persistence/indoorTableGateway.js";

function harness(snapshot, storedSnapshots = []) {
  const indoor = [];
  const outdoor = [];
  const service = createGoldenRecordsMemberSyncService({
    getUtcTimestampParts: () => ["2026-10-01", "12:00:00"],
    goldenRecordsCurrentHandicapService: { isEnabled: true, getSnapshotForMember: async () => snapshot },
    goldenRecordsSyncGateway: { upsertSnapshot: async () => {},
      listStoredSnapshots: async () => storedSnapshots },
    memberDirectoryGateway: { findDisciplinesByUsername: async () => [
      { discipline: "Recurve Bow" }, { discipline: "Bare Bow" },
    ], listAllUsers: async () => [user] },
    memberDistanceSignOffRepository: { replaceForDiscipline: async () => {} },
    indoorTableGateway: {
      listEntriesByYear: async () => [...indoor],
      createEntry: async (entry) => { const result = { id: indoor.length + 1, ...entry }; indoor.push(result); return result; },
      createEntryIfAbsent: async (entry) => {
        if (indoor.some((row) => row.seasonYear === entry.seasonYear &&
          row.archerUsername === entry.archerUsername && row.bowType === entry.bowType)) return false;
        indoor.push({ id: indoor.length + 1, ...entry }); return true;
      },
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

test("stored Indoor Handicap snapshot backfills missing current-year row without remote refresh", async () => {
  const storedSnapshot = { enabled: true, matchSource: "gr-id", matchedMemberId: "gr-1",
    achievements: [], classifications: [], handicaps: [
      { memberId: "gr-1", bowClass: "Recurve", type: "Indoor Handicap", handicap: 78 },
      { memberId: "gr-1", bowClass: "Recurve", type: "Outdoor Handicap", handicap: 55 },
    ] };
  const { indoor, outdoor, service } = harness(null, [{ username: "archer", snapshot: storedSnapshot }]);
  assert.equal(await service.backfillIndoorTableFromStoredSnapshots(), 1);
  assert.deepEqual(indoor.map((row) => [row.seasonYear, row.bowType, row.handicap]),
    [[new Date().getUTCFullYear(), "Rec", 78]]);
  assert.deepEqual(indoor[0].classifications, {});
  assert.deepEqual(indoor[0].scores, {});
  assert.equal(outdoor.length, 0);
  assert.equal(await service.backfillIndoorTableFromStoredSnapshots(), 0);
});

test("existing SQLite Golden Records snapshot creates current-year indoor rows", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, first_name TEXT, surname TEXT, gr_id TEXT);
      INSERT INTO users VALUES ('Cfleetham', 'C', 'Fleetham', 'gr-c');
      CREATE TABLE golden_records_member_sync (username TEXT PRIMARY KEY, snapshot_json TEXT,
        fetched_at TEXT, synced_at_date TEXT, synced_at_time TEXT, updated_by_username TEXT);
      CREATE TABLE indoor_table_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_year INTEGER NOT NULL, archer_username TEXT NOT NULL, bow_type TEXT NOT NULL,
        handicap INTEGER, classifications_json TEXT NOT NULL, scores_json TEXT NOT NULL,
        created_at_date TEXT NOT NULL, created_at_time TEXT NOT NULL,
        updated_at_date TEXT, updated_at_time TEXT, updated_by_username TEXT,
        UNIQUE(season_year, archer_username, bow_type));`);
    const snapshot = { enabled: true, matchSource: "gr-id", matchedMemberId: "gr-c",
      handicaps: [
        { memberId: "gr-c", type: "indoor", bowClass: "Compound", handicap: 48 },
        { memberId: "gr-c", type: "indoor", bowClass: "Recurve", handicap: 78 },
      ], classifications: [], achievements: [] };
    db.prepare("INSERT INTO golden_records_member_sync (username, snapshot_json) VALUES (?, ?)").run("Cfleetham", JSON.stringify(snapshot));
    const service = createGoldenRecordsMemberSyncService({
      getUtcTimestampParts: () => ["2026-10-01", "12:00:00"],
      goldenRecordsCurrentHandicapService: { isEnabled: true,
        getSnapshotForMember: async () => { throw new Error("Remote API must not be called"); } },
      goldenRecordsSyncGateway: createGoldenRecordsSyncGateway({ databaseEngine: "sqlite", db }),
      indoorTableGateway: createIndoorTableGateway({ databaseEngine: "sqlite", db }),
      memberDirectoryGateway: {
        listAllUsers: async () => [{ username: "Cfleetham" }],
        findDisciplinesByUsername: async () => [
          { discipline: "Compound Bow" }, { discipline: "Recurve Bow" },
        ],
      },
    });
    assert.equal(await service.backfillIndoorTableFromStoredSnapshots(), 2);
    const rows = db.prepare("SELECT season_year, bow_type, handicap, classifications_json, scores_json FROM indoor_table_entries ORDER BY bow_type").all();
    assert.deepEqual(rows.map((row) => [row.season_year, row.bow_type, row.handicap]), [
      [new Date().getUTCFullYear(), "Comp", 48], [new Date().getUTCFullYear(), "Rec", 78],
    ]);
    assert.ok(rows.every((row) => row.classifications_json === "{}" && row.scores_json === "{}"));
  } finally { db.close(); }
});

test("full-club remote sync creates indoor row through the member sync path", async () => {
  const snapshot = { enabled: true, matchSource: "gr-id", matchedMemberId: "gr-1",
    achievements: [], classifications: [], handicaps: [
      { memberId: "gr-1", bowClass: "Recurve", type: "Indoor Handicap", handicap: 71 },
    ] };
  const { indoor, service } = harness(snapshot);
  const summary = await service.syncAllMembers({ updatedByUsername: "archer" });
  assert.equal(summary.matchedCount, 1);
  assert.equal(indoor.length, 1);
  assert.equal(indoor[0].seasonYear, new Date().getUTCFullYear());
  assert.equal(indoor[0].handicap, 71);
});
