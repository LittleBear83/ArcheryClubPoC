import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  bootstrapSqliteBaseSchema,
  CLUB_EVENTS_TABLE_SQL,
  COACHING_SESSIONS_TABLE_SQL,
  COACHING_SESSION_BOOKINGS_TABLE_SQL,
  EVENT_BOOKINGS_TABLE_SQL,
  TOURNAMENTS_TABLE_SQL,
  TOURNAMENT_REGISTRATIONS_TABLE_SQL,
  TOURNAMENT_SCORES_TABLE_SQL,
} from "./bootstrapSqliteBaseSchema.js";
import { bootstrapSqliteCourseScheduleCompatibility } from "./bootstrapSqliteCourseScheduleCompatibility.js";
import { bootstrapSqliteEquipmentCompatibility } from "./bootstrapSqliteEquipmentCompatibility.js";
import { createSqliteEquipmentStatements } from "./createSqliteEquipmentStatements.js";
import { bootstrapSqliteUserCompatibility } from "./bootstrapSqliteUserCompatibility.js";
import { bootstrapPersistence } from "../../bootstrap/bootstrapPersistence.js";
import { getSeedUsers } from "./seedUsers.js";

test("SQLite equipment loan upgrade preserves old rows and adds nullable expected date", () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    db.pragma("foreign_keys = OFF");
    db.exec("ALTER TABLE equipment_loans DROP COLUMN expected_return_date");
    db.exec("INSERT INTO equipment_loans (equipment_item_id, member_username, loaned_by_username, loaned_at_date, loaned_at_time) VALUES (1, 'member', 'staff', '2026-01-01', '12:00:00')");
    bootstrapSqliteEquipmentCompatibility({ db });
    bootstrapSqliteEquipmentCompatibility({ db });
    const row = db.prepare("SELECT expected_return_date, loaned_at_date FROM equipment_loans").get();
    assert.equal(row.expected_return_date, null);
    assert.equal(row.loaned_at_date, "2026-01-01");
    bootstrapSqliteUserCompatibility({ db });
    const due = "2026-12-31";
    const statements = createSqliteEquipmentStatements(db);
    statements.insertEquipmentLoan.run(2, "member", "staff", "2026-09-30", "12:00:00", null, due);
    assert.equal(statements.listEquipmentLoans.all().find((loan) => loan.equipment_item_id === 2).expected_return_date, due);
  } finally {
    db.close();
  }
});

test("SQLite course requirement upgrade changes only unaudited default Beginners lessons once", () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    db.prepare("INSERT INTO users (username, first_name, surname) VALUES ('coordinator', 'Course', 'Coordinator')").run();
    const course = db.prepare(`
      INSERT INTO beginners_courses (course_type, coordinator_username, submitted_by_username,
        first_lesson_date, start_time, end_time, lesson_count, beginner_capacity,
        created_at_date, created_at_time)
      VALUES (?, 'coordinator', 'coordinator', '2026-08-01', '10:00', '12:00', 1, 8,
        '2026-07-01', '09:00')
    `);
    const defaultBeginnerCourseId = course.run("beginners").lastInsertRowid;
    const configuredBeginnerCourseId = course.run("beginners").lastInsertRowid;
    const tasterCourseId = course.run("taster-session").lastInsertRowid;
    const insertLesson = db.prepare(`
      INSERT INTO beginners_course_lessons (course_id, lesson_number, lesson_date, start_time, end_time, required_coach_count)
      VALUES (?, 1, '2026-08-01', '10:00', '12:00', 1)
    `);
    const defaultLessonId = insertLesson.run(defaultBeginnerCourseId).lastInsertRowid;
    const configuredLessonId = insertLesson.run(configuredBeginnerCourseId).lastInsertRowid;
    const tasterLessonId = insertLesson.run(tasterCourseId).lastInsertRowid;
    db.prepare(`
      INSERT INTO audit_events (actor_username, action, target, status_code, created_at_date, created_at_time)
      VALUES ('coordinator', 'required_coach_count_changed', ?, 200, '2026-07-01', '09:00:00')
    `).run(`/api/beginners-course-lessons/${configuredLessonId}/required-coaches`);
    const migrate = () => bootstrapSqliteCourseScheduleCompatibility({
      db,
      clubEventsTableSql: CLUB_EVENTS_TABLE_SQL,
      coachingSessionBookingsTableSql: COACHING_SESSION_BOOKINGS_TABLE_SQL,
      coachingSessionsTableSql: COACHING_SESSIONS_TABLE_SQL,
      eventBookingsTableSql: EVENT_BOOKINGS_TABLE_SQL,
      tournamentsTableSql: TOURNAMENTS_TABLE_SQL,
      tournamentRegistrationsTableSql: TOURNAMENT_REGISTRATIONS_TABLE_SQL,
      tournamentScoresTableSql: TOURNAMENT_SCORES_TABLE_SQL,
    });
    migrate();
    migrate();
    const requirements = new Map(db.prepare("SELECT id, required_coach_count FROM beginners_course_lessons")
      .all().map((row) => [row.id, row.required_coach_count]));
    assert.equal(requirements.get(defaultLessonId), 5);
    assert.equal(requirements.get(configuredLessonId), 1);
    assert.equal(requirements.get(tasterLessonId), 1);
  } finally {
    db.close();
  }
});

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
      const indoorColumns = db.prepare("PRAGMA table_info(indoor_table_entries)").all().map((column) => column.name);
      for (const name of ["season_year", "archer_username", "bow_type", "handicap", "classifications_json", "scores_json", "updated_by_username"]) {
        assert.ok(indoorColumns.includes(name), name);
      }
      for (const name of ["handicap_allowance_percent", "left_handicap_value", "right_handicap_value", "right_handicap_table_title"]) {
        assert.ok(columns.includes(name), name);
      }
      bootstrap();
      assert.deepEqual(db.prepare("PRAGMA table_info(tournament_matches)").all().map((column) => column.name), columns);
      const dashboardPlan = db.prepare(`EXPLAIN QUERY PLAN
        SELECT login_method, COUNT(*) FROM login_events
        WHERE logged_in_date >= ? AND logged_in_date < ?
        GROUP BY login_method`).all("2026-09-01", "2026-10-01");
      assert.ok(dashboardPlan.some(({ detail }) =>
        detail.includes("USING COVERING INDEX login_events_reporting_date_method_idx")));
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

test("SQLite member upsert preserves an existing password when an RFID edit omits it", async () => {
  const { bootstrapSqliteUserData } = await import("./bootstrapSqliteUserData.js");
  const { bootstrapSqliteUserCompatibility } = await import("./bootstrapSqliteUserCompatibility.js");
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({db, defaultEquipmentCupboardLabel: "Club cupboard"});
    bootstrapSqliteUserCompatibility({db});
    for (const { userType } of getSeedUsers({ hashPassword: (value) => value, isLive: false })) {
      db.prepare("INSERT OR IGNORE INTO roles (role_key, title) VALUES (?, ?)").run(userType, userType);
    }
    const statements = bootstrapSqliteUserData({
      db, committeeRoleSeed: [], isLive: false,
      hashPassword: (password) => `hashed:${password}`,
      isPasswordHash: (password) => password.startsWith("hashed:"),
    });
    const row = db.prepare("SELECT * FROM users ORDER BY id LIMIT 1").get();
    db.prepare("UPDATE users SET password = 'existing-hash' WHERE username = ?").run(row.username);

    statements.upsertUser.run({
      username: row.username,
      firstName: row.first_name,
      surname: row.surname,
      goldenRecordsId: row.gr_id,
      archeryGbMembershipNumber: row.archery_gb_membership_number,
      emailAddress: row.email_address,
      password: null,
      rfidTag: "NEW-RFID",
      activeMember: row.active_member,
      affiliateMember: row.affiliate_member,
      juniorMember: row.junior_member,
      membershipFeesDue: row.membership_fees_due,
      coachingVolunteer: row.coaching_volunteer,
      membershipStatus: row.membership_status,
      programmeType: row.programme_type,
    });

    assert.deepEqual(
      db.prepare("SELECT password, rfid_tag FROM users WHERE username = ?").get(row.username),
      { password: "existing-hash", rfid_tag: "NEW-RFID" },
    );
  } finally {
    db.close();
  }
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
