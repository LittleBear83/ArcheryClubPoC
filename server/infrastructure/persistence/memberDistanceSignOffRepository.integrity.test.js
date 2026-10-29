import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createMemberDistanceSignOffRepository } from "./memberDistanceSignOffRepository.js";
import { migrateSqliteExternalDistanceSigners } from "./migrateSqliteExternalDistanceSigners.js";
import { upsertMemberDistanceSignOffRows } from "./localSyncCommitteeGateway.js";

test("SQLite migration preserves manual signers and imported rows coexist without a human signer", async () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (username TEXT PRIMARY KEY, first_name TEXT, surname TEXT);
      INSERT INTO users VALUES ('member', 'Club', 'Member'), ('coach', 'Club', 'Coach');
      CREATE TABLE member_distance_sign_offs (
        username TEXT NOT NULL REFERENCES users(username),
        discipline TEXT NOT NULL,
        distance_yards INTEGER NOT NULL,
        signed_off_by_username TEXT NOT NULL REFERENCES users(username),
        source TEXT NOT NULL DEFAULT 'manual',
        signed_off_at_date TEXT NOT NULL,
        signed_off_at_time TEXT NOT NULL,
        PRIMARY KEY (username, discipline, distance_yards)
      );
      INSERT INTO member_distance_sign_offs VALUES
        ('member', 'Recurve Bow', 20, 'coach', 'manual', '2026-01-01', '10:00:00');
    `);
    migrateSqliteExternalDistanceSigners(db);
    migrateSqliteExternalDistanceSigners(db);
    const repository = createMemberDistanceSignOffRepository(db, {
      allowedDisciplines: ["Recurve Bow"], distanceYards: [20, 30, 40],
    });
    const imported = (distanceYards) => ({ username: "member", discipline: "Recurve Bow",
      distanceYards, source: "golden-records", signedOffByUsername: null,
      signedOffAtDate: "2026-02-01", signedOffAtTime: "09:00:00" });
    await repository.replaceForDiscipline("member", "Recurve Bow", [imported(20), imported(40)]);
    await repository.replaceForDiscipline("member", "Recurve Bow", [imported(20), imported(40)]);
    await repository.replaceForDiscipline("member", "Recurve Bow", []);
    const rows = await repository.listByUsername("member");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].signedOffByUsername, "coach");
    assert.equal(rows[0].source, "manual");
    assert.equal(rows[1].signedOffByUsername, null);
    assert.equal(rows[1].source, "golden-records");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
});

test("Pi-to-Cloud sign-off replication carries a nullable external signer", async () => {
  const calls = [];
  await upsertMemberDistanceSignOffRows({ query: async (sql, values) => {
    calls.push({ sql, values });
  } }, [{ username: "member", discipline: "Recurve Bow", distance_yards: 40,
    signed_off_by_username: null, source: "golden-records",
    signed_off_at_date: "2026-02-01", signed_off_at_time: "09:00:00" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values[3], null);
  assert.match(calls[0].sql, /signed_off_by_user_id/);
});
