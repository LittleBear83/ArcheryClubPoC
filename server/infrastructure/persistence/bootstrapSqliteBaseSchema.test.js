import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { bootstrapSqliteBaseSchema } from "./bootstrapSqliteBaseSchema.js";
import { bootstrapPersistence } from "../../bootstrap/bootstrapPersistence.js";
import { getSeedUsers } from "./seedUsers.js";

test("fresh SQLite bootstrap creates tournament tables before upgrading columns and can repeat", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Test cupboard" });
    const columns = db.prepare("PRAGMA table_info(tournament_matches)").all();
    for (const name of ["handicap_allowance_percent", "left_adjusted_score", "right_handicap_table_title"]) {
      assert.ok(columns.some((column) => column.name === name), name);
    }
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Test cupboard" });
    assert.deepEqual(db.prepare("PRAGMA table_info(tournament_matches)").all(), columns);
  } finally { db.close(); }
});

test("SQLite bootstrap upgrades legacy tournament matches without replacing existing rows", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE tournament_matches (tournament_id INTEGER, round_number INTEGER, match_number INTEGER, left_score INTEGER); INSERT INTO tournament_matches VALUES (7,1,1,123);");
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Test cupboard" });
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Test cupboard" });
    assert.deepEqual(db.prepare("SELECT tournament_id, round_number, match_number, left_score, handicap_allowance_percent, right_adjusted_score FROM tournament_matches").all(), [{ tournament_id: 7, round_number: 1, match_number: 1, left_score: 123, handicap_allowance_percent: null, right_adjusted_score: null }]);
  } finally { db.close(); }
});

test("full development SQLite bootstrap seeds users with optional membership numbers", async () => {
  const db = new Database(":memory:");
  try {
    const hashPassword = (password) => `hashed:${password}`;
    const systemRoleDefinitions = [...new Set(getSeedUsers({ hashPassword, isLive: false }).map((user) => user.userType))].map((roleKey) => ({ roleKey, title: roleKey, permissions: [] }));
    await bootstrapPersistence({ db, defaultEquipmentCupboardLabel: "Test cupboard", committeeRoleSeed: [], currentPermissionKeys: [], currentPermissionSqlPlaceholders: "", permissionDefinitions: [], systemRoleDefinitions, runtime: { databaseEngine: "sqlite", isLive: false }, hashPassword, isPasswordHash: (password) => password.startsWith("hashed:") });
    assert.ok(db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0);
    assert.equal(db.prepare("SELECT archery_gb_membership_number FROM users WHERE username = 'Cfleetham'").get().archery_gb_membership_number, null);
  } finally { db.close(); }
});
