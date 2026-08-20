import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import {
  TOURNAMENT_HANDICAP_TABLE_ROWS_SQL,
  TOURNAMENT_HANDICAP_TABLES_SQL,
} from "./bootstrapSqliteBaseSchema.js";
import { createHandicapTableGateway } from "./handicapTableGateway.js";

test("handicap table gateway syncs source tables and exposes grouped results", async () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE users (
      username TEXT PRIMARY KEY
    )
  `);
  db.exec(TOURNAMENT_HANDICAP_TABLES_SQL);
  db.exec(TOURNAMENT_HANDICAP_TABLE_ROWS_SQL);

  const gateway = createHandicapTableGateway({
    databaseEngine: "sqlite",
    db,
    pool: null,
  });

  const firstSync = await gateway.syncSourceTables({
    updatedAtDate: "2026-08-20",
    updatedAtTime: "12:00:00.000Z",
    updatedByUsername: null,
  });
  const secondSync = await gateway.syncSourceTables({
    updatedAtDate: "2026-08-20",
    updatedAtTime: "12:05:00.000Z",
    updatedByUsername: null,
  });
  const snapshot = await gateway.listHandicapTables();

  assert.ok(firstSync.updatedTables > 0);
  assert.equal(secondSync.updatedTables, 0);
  assert.equal(snapshot.sourceRevision, "released-may-2025");
  assert.equal(snapshot.families.length, 7);

  const outdoorRounds = snapshot.families.find((family) => family.familyKey === "outdoor-rounds");
  assert.ok(outdoorRounds);
  assert.equal(outdoorRounds.tables.length, 32);

  const yorkTable = outdoorRounds.tables.find((table) => table.tableKey === "outdoor-round-york");
  assert.ok(yorkTable);
  assert.equal(yorkTable.rows[0].handicapValue, 0);
  assert.equal(yorkTable.rows[0].referenceScore, 1284);
  assert.equal(yorkTable.rows.at(-1).handicapValue, 150);

  db.close();
});
