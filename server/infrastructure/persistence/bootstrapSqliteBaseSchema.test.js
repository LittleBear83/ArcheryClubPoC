import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { bootstrapSqliteBaseSchema } from "./bootstrapSqliteBaseSchema.js";

for (const legacy of [false, true]) {
  test(`SQLite bootstrap supports ${legacy ? "legacy" : "fresh"} databases and repeated startup`, () => {
    const db = new Database(":memory:");
    try {
      if (legacy) {
        db.exec(`CREATE TABLE tournament_matches (
          tournament_id INTEGER NOT NULL, round_number INTEGER NOT NULL,
          match_number INTEGER NOT NULL, left_score INTEGER,
          PRIMARY KEY (tournament_id, round_number, match_number)
        ); INSERT INTO tournament_matches VALUES (1, 1, 1, 252);`);
      }
      const bootstrap = () => bootstrapSqliteBaseSchema({db, defaultEquipmentCupboardLabel: "Club cupboard"});
      bootstrap();
      const columns = db.prepare("PRAGMA table_info(tournament_matches)").all().map((column) => column.name);
      for (const name of ["handicap_allowance_percent", "left_handicap_value", "right_handicap_value", "right_handicap_table_title"]) {
        assert.ok(columns.includes(name), name);
      }
      bootstrap();
      assert.deepEqual(db.prepare("PRAGMA table_info(tournament_matches)").all().map((column) => column.name), columns);
      if (legacy) assert.equal(db.prepare("SELECT left_score FROM tournament_matches").get().left_score, 252);
    } finally {
      db.close();
    }
  });
}

test("fresh SQLite development seeding accepts missing optional AGB numbers", async () => {
  const { bootstrapSqliteUserData } = await import("./bootstrapSqliteUserData.js");
  const { getSeedUsers } = await import("./seedUsers.js");
  const { bootstrapSqliteUserCompatibility } = await import("./bootstrapSqliteUserCompatibility.js");
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({db, defaultEquipmentCupboardLabel: "Club cupboard"});
    bootstrapSqliteUserCompatibility({db});
    for (const { userType } of getSeedUsers({ hashPassword: (value) => value, isLive: false })) {
      db.prepare("INSERT OR IGNORE INTO roles (role_key, title) VALUES (?, ?)").run(userType, userType);
    }
    const seed = () => bootstrapSqliteUserData({
      db, committeeRoleSeed: [], isLive: false,
      hashPassword: (password) => `hashed:${password}`,
      isPasswordHash: (password) => password.startsWith("hashed:"),
    });
    seed();
    const users = db.prepare("SELECT username, archery_gb_membership_number FROM users ORDER BY username").all();
    assert.ok(users.length > 0);
    assert.ok(users.some((user) => user.archery_gb_membership_number === null));
    seed();
    assert.deepEqual(db.prepare("SELECT username, archery_gb_membership_number FROM users ORDER BY username").all(), users);
  } finally {
    db.close();
  }
});
