import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrateSqliteBowDisciplineNames } from "./migrateSqliteBowDisciplineNames.js";

test("SQLite bow rename preserves existing disciplines, sign-offs, and triggers", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (username TEXT PRIMARY KEY);
      INSERT INTO users VALUES ('archer'), ('coach');
      CREATE TABLE user_disciplines (
        username TEXT NOT NULL REFERENCES users(username),
        discipline TEXT NOT NULL CHECK (discipline IN ('Bare Bow', 'Long Bow', 'Recurve Bow', 'Compound Bow')),
        user_id INTEGER,
        PRIMARY KEY (username, discipline)
      );
      CREATE TRIGGER user_disciplines_audit AFTER INSERT ON user_disciplines BEGIN
        UPDATE user_disciplines SET user_id = 5 WHERE username = NEW.username AND discipline = NEW.discipline;
      END;
      CREATE TABLE member_distance_sign_offs (
        username TEXT NOT NULL REFERENCES users(username),
        discipline TEXT NOT NULL CHECK (discipline IN ('Bare Bow', 'Long Bow', 'Recurve Bow', 'Compound Bow')),
        distance_yards INTEGER NOT NULL,
        signed_off_by_username TEXT REFERENCES users(username),
        source TEXT NOT NULL DEFAULT 'manual',
        signed_off_at_date TEXT NOT NULL,
        signed_off_at_time TEXT NOT NULL,
        PRIMARY KEY (username, discipline, distance_yards)
      );
      CREATE TABLE tournament_matches (
        left_handicap_discipline TEXT,
        right_handicap_discipline TEXT
      );
      INSERT INTO user_disciplines VALUES ('archer', 'Bare Bow', 7), ('archer', 'Long Bow', 8);
      UPDATE user_disciplines SET user_id = 7 WHERE discipline = 'Bare Bow';
      UPDATE user_disciplines SET user_id = 8 WHERE discipline = 'Long Bow';
      INSERT INTO member_distance_sign_offs VALUES
        ('archer', 'Bare Bow', 30, 'coach', 'manual', '2026-01-01', '10:00'),
        ('archer', 'Long Bow', 40, NULL, 'golden-records', '2026-01-02', '10:00');
      INSERT INTO tournament_matches VALUES ('Bare Bow', 'Long Bow');
    `);
    migrateSqliteBowDisciplineNames(db);
    migrateSqliteBowDisciplineNames(db);
    assert.deepEqual(db.prepare("SELECT discipline, user_id FROM user_disciplines ORDER BY discipline").all(), [
      { discipline: "Barebow", user_id: 7 }, { discipline: "Longbow", user_id: 8 },
    ]);
    assert.deepEqual(db.prepare("SELECT discipline, signed_off_by_username FROM member_distance_sign_offs ORDER BY discipline").all(), [
      { discipline: "Barebow", signed_off_by_username: "coach" },
      { discipline: "Longbow", signed_off_by_username: null },
    ]);
    assert.deepEqual(db.prepare("SELECT * FROM tournament_matches").get(), {
      left_handicap_discipline: "Barebow", right_handicap_discipline: "Longbow",
    });
    db.prepare("INSERT INTO user_disciplines (username, discipline) VALUES ('coach', 'Barebow')").run();
    assert.equal(db.prepare("SELECT user_id FROM user_disciplines WHERE username = 'coach'").get().user_id, 5);
    assert.throws(() => db.prepare("INSERT INTO user_disciplines (username, discipline) VALUES ('coach', 'Bare Bow')").run(), /CHECK constraint failed/);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally {
    db.close();
  }
});
