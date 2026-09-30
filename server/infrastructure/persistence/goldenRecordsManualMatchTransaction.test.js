import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createMemberDistanceSignOffRepository } from "./memberDistanceSignOffRepository.js";
import { withGoldenRecordsManualMatchTransaction } from "./goldenRecordsManualMatchTransaction.js";

test("SQLite manual assignment rolls back outdoor and sign-off writes when a later write fails", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE outdoor_rows (id INTEGER); CREATE TABLE sign_offs (id INTEGER);`);
    await assert.rejects(
      () => withGoldenRecordsManualMatchTransaction({ databaseEngine: "sqlite", db, outdoorTableGateway: {} }, async () => {
        db.exec("INSERT INTO outdoor_rows VALUES (1)");
        await Promise.resolve();
        db.exec("INSERT INTO sign_offs VALUES (1)");
        throw new Error("Identity write failed");
      }),
      /Identity write failed/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM outdoor_rows").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sign_offs").get().count, 0);
  } finally { db.close(); }
});

test("PostgreSQL manual assignment passes one client through downstream writes", async () => {
  const statements = [];
  let released = false;
  const client = { query: async (sql) => { statements.push(String(sql)); }, release: () => { released = true; } };
  const db = { pool: { connect: async () => client } };
  await assert.rejects(
    () => withGoldenRecordsManualMatchTransaction({ databaseEngine: "postgres", db }, async ({ outdoorGateway, transactionClient }) => {
      assert.equal(transactionClient, client);
      assert.ok(outdoorGateway);
      await transactionClient.query("UPDATE outdoor_table_entries SET handicap = 37");
      throw new Error("Sign-off write failed");
    }),
    /Sign-off write failed/,
  );
  assert.deepEqual(statements, ["BEGIN", "UPDATE outdoor_table_entries SET handicap = 37", "ROLLBACK"]);
  assert.equal(released, true);
});

test("PostgreSQL sign-off replacement joins the caller-owned transaction", async () => {
  const queries = [];
  const client = { query: async (sql) => { queries.push(String(sql).trim()); },
    release: () => { throw new Error("Caller owns this client"); } };
  const repository = createMemberDistanceSignOffRepository({ engine: "postgres", pool: {
    connect: async () => { throw new Error("Must not request another client"); },
  } }, { allowedDisciplines: ["Recurve Bow"], distanceYards: [20] });
  await repository.replaceForDiscipline("robin", "Recurve Bow", [], client);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^DELETE FROM member_distance_sign_offs/);
});
