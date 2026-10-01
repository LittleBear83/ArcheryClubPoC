import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createIndoorTableGateway } from "./indoorTableGateway.js";

test("SQLite indoor gateway preserves separate bows and dated progress", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, first_name TEXT, surname TEXT);
      INSERT INTO users VALUES ('a', 'Alex', 'Archer');
      CREATE TABLE indoor_table_entries (id INTEGER PRIMARY KEY AUTOINCREMENT,
        season_year INTEGER, archer_username TEXT, bow_type TEXT, handicap INTEGER,
        classifications_json TEXT, scores_json TEXT, created_at_date TEXT, created_at_time TEXT,
        updated_at_date TEXT, updated_at_time TEXT, updated_by_username TEXT,
        UNIQUE(season_year, archer_username, bow_type));`);
    const gateway = createIndoorTableGateway({ databaseEngine: "sqlite", db });
    const row = await gateway.createEntry({ seasonYear: 2026, archerUsername: "a", bowType: "Rec",
      handicap: 30, classifications: { archer3rd: "2026-01-01" }, scores: { 500: "2026-01-02" },
      createdAtDate: "2026-01-01", createdAtTime: "12:00:00", updatedAtDate: "2026-01-01",
      updatedAtTime: "12:00:00", updatedByUsername: "a" });
    assert.equal(row.archerName, "Alex Archer");
    assert.equal(row.classifications.archer3rd, "2026-01-01");
    assert.equal((await gateway.findDuplicate(row)).id, row.id);
    const updated = await gateway.updateEntry({ ...row, handicap: 25 });
    assert.equal(updated.handicap, 25);
    assert.equal((await gateway.listEntriesByYear(2026)).length, 1);
    await gateway.deleteEntry(row.id);
    assert.equal((await gateway.listEntriesByYear(2026)).length, 0);
  } finally { db.close(); }
});
