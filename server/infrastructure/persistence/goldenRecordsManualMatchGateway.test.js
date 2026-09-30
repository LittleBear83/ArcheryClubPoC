import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createGoldenRecordsSyncGateway } from "./goldenRecordsSyncGateway.js";

const payload = {
  fetchedAt: "2026-09-30T12:00:00Z", memberId: "new-id",
  snapshot: { matchedMemberId: "new-id", matchSource: "manual" },
  syncedAtDate: "2026-09-30", syncedAtTime: "12:00:00",
  updatedByUsername: "admin", username: "robin",
};

test("SQLite manual match commits identity and snapshot together or rolls both back", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, gr_id TEXT);
      INSERT INTO users VALUES ('robin', 'old-id');
      CREATE TABLE golden_records_member_sync (
        username TEXT PRIMARY KEY, snapshot_json TEXT, fetched_at TEXT,
        synced_at_date TEXT, synced_at_time TEXT,
        updated_by_username TEXT CHECK(updated_by_username <> 'reject')
      );`);
    const gateway = createGoldenRecordsSyncGateway({ databaseEngine: "sqlite", db });
    await assert.rejects(gateway.commitManualMatch({ ...payload, updatedByUsername: "reject" }), /CHECK constraint failed/);
    assert.equal(db.prepare("SELECT gr_id FROM users WHERE username = 'robin'").get().gr_id, "old-id");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM golden_records_member_sync").get().count, 0);

    await gateway.commitManualMatch(payload);
    assert.equal(db.prepare("SELECT gr_id FROM users WHERE username = 'robin'").get().gr_id, "new-id");
    assert.equal((await gateway.findByUsername("robin")).matchedMemberId, "new-id");
  } finally { db.close(); }
});

test("PostgreSQL manual match uses a single transaction client", async () => {
  const queries = [];
  let released = false;
  const client = {
    query: async (sql) => {
      const statement = String(sql).trim();
      queries.push(statement);
      return { rowCount: statement.startsWith("UPDATE users") ? 1 : 0 };
    },
    release: () => { released = true; },
  };
  const gateway = createGoldenRecordsSyncGateway({
    databaseEngine: "postgres", pool: { connect: async () => client },
  });
  await gateway.commitManualMatch(payload);
  assert.equal(queries[0], "BEGIN");
  assert.match(queries[1], /^UPDATE users SET gr_id/);
  assert.match(queries[2], /^INSERT INTO golden_records_member_sync/);
  assert.equal(queries[3], "COMMIT");
  assert.equal(released, true);
});

test("PostgreSQL manual match joins the surrounding outdoor and sign-off transaction", async () => {
  const queries = [];
  const client = {
    query: async (sql) => {
      const statement = String(sql).trim();
      queries.push(statement);
      return { rowCount: statement.startsWith("UPDATE users") ? 1 : 0 };
    },
    release: () => { throw new Error("Caller owns this client"); },
  };
  const gateway = createGoldenRecordsSyncGateway({ databaseEngine: "postgres", pool: {
    connect: async () => { throw new Error("Must use the supplied client"); },
  } });
  await gateway.commitManualMatch(payload, client);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /^UPDATE users SET gr_id/);
  assert.match(queries[1], /^INSERT INTO golden_records_member_sync/);
});
