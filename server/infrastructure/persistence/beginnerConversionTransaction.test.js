import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { runBeginnerConversion } from "../../domain/services/runBeginnerConversion.js";
import { withBeginnerConversionTransaction } from "./beginnerConversionTransaction.js";

test("no-case participant failure rolls back a successful membership write", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE users (role TEXT); INSERT INTO users VALUES ('beginner');
      CREATE TABLE participants (converted INTEGER); INSERT INTO participants VALUES (0);`);
    await assert.rejects(
      () => runBeginnerConversion({
        inTransaction: (operation) => withBeginnerConversionTransaction({ databaseEngine: "sqlite", db }, operation),
        prepareCase: null,
        saveMembership: async () => {
          db.exec("UPDATE users SET role = 'member'");
          return { success: true };
        },
        loanCase: () => { throw new Error("No equipment work expected"); },
        markParticipant: async () => { throw new Error("participant update failed"); },
      }),
      /participant update failed/,
    );
    assert.equal(db.prepare("SELECT role FROM users").get().role, "beginner");
    assert.equal(db.prepare("SELECT converted FROM participants").get().converted, 0);
  } finally { db.close(); }
});

test("SQLite conversion rolls back membership, equipment, and participant on a later write failure", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE users (role TEXT); INSERT INTO users VALUES ('beginner');
      CREATE TABLE equipment_loans (item_id INTEGER); CREATE TABLE participants (converted INTEGER);
      INSERT INTO participants VALUES (0);`);
    await assert.rejects(
      () => withBeginnerConversionTransaction({ databaseEngine: "sqlite", db }, async () => {
        db.exec("UPDATE users SET role = 'member'");
        await Promise.resolve();
        db.exec("INSERT INTO equipment_loans VALUES (24)");
        db.exec("UPDATE participants SET converted = 1");
        throw new Error("later write failed");
      }),
      /later write failed/,
    );
    assert.equal(db.prepare("SELECT role FROM users").get().role, "beginner");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM equipment_loans").get().count, 0);
    assert.equal(db.prepare("SELECT converted FROM participants").get().converted, 0);
  } finally { db.close(); }
});

test("PostgreSQL conversion uses one client and rolls back on failure", async () => {
  const statements = [];
  let released = false;
  const client = { query: async (sql) => { statements.push(sql); }, release: () => { released = true; } };
  const db = { pool: { connect: async () => client } };
  await assert.rejects(
    () => withBeginnerConversionTransaction({ databaseEngine: "postgres", db }, async (ownedClient) => {
      assert.equal(ownedClient, client);
      await ownedClient.query("UPDATE users SET membership_status = 'member'");
      throw new Error("loan failed");
    }),
    /loan failed/,
  );
  assert.deepEqual(statements, ["BEGIN", "UPDATE users SET membership_status = 'member'", "ROLLBACK"]);
  assert.equal(released, true);
});

test("PostgreSQL no-case conversion uses one client for membership and participant writes", async () => {
  const statements = [];
  const client = { query: async (sql) => { statements.push(sql); }, release: () => {} };
  const db = { pool: { connect: async () => client } };
  await runBeginnerConversion({
    inTransaction: (operation) => withBeginnerConversionTransaction({ databaseEngine: "postgres", db }, operation),
    prepareCase: null,
    saveMembership: async (ownedClient) => {
      assert.equal(ownedClient, client);
      await ownedClient.query("UPDATE users SET membership_status = 'member'");
      return { success: true };
    },
    loanCase: () => { throw new Error("No equipment work expected"); },
    markParticipant: async (ownedClient) => {
      assert.equal(ownedClient, client);
      await ownedClient.query("UPDATE beginners_course_participants SET converted_to_member = 1");
    },
  });
  assert.deepEqual(statements, ["BEGIN", "UPDATE users SET membership_status = 'member'",
    "UPDATE beginners_course_participants SET converted_to_member = 1", "COMMIT"]);
});
