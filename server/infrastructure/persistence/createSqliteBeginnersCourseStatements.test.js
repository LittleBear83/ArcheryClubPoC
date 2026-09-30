import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { bootstrapSqliteBaseSchema } from "./bootstrapSqliteBaseSchema.js";
import { bootstrapSqliteUserCompatibility } from "./bootstrapSqliteUserCompatibility.js";
import { createSqliteBeginnersCourseStatements } from "./createSqliteBeginnersCourseStatements.js";
import { createBeginnersCourseWriteGateway } from "./beginnersCourseWriteGateway.js";
import { createSqliteReportingStatements } from "./createSqliteReportingStatements.js";

test("taster transfers retain their source session while ordinary reallocations do not", () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    bootstrapSqliteUserCompatibility({ db });
    db.exec("ALTER TABLE beginners_course_lessons ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
    db.prepare("INSERT INTO users (username, first_name, surname) VALUES (?, ?, ?)")
      .run("coordinator", "Course", "Coordinator");
    for (const username of ["taster", "beginner"]) {
      db.prepare("INSERT INTO users (username, first_name, surname) VALUES (?, ?, ?)")
        .run(username, username, "Participant");
    }
    const insertCourse = db.prepare(`
      INSERT INTO beginners_courses (course_type, coordinator_username, submitted_by_username,
        first_lesson_date, start_time, end_time, lesson_count, beginner_capacity,
        created_at_date, created_at_time)
      VALUES (?, 'coordinator', 'coordinator', '2026-08-01', '10:00', '12:00', 1, 8,
        '2026-07-01', '09:00')
    `);
    const tasterCourseId = insertCourse.run("taster-session").lastInsertRowid;
    const targetCourseId = insertCourse.run("beginners").lastInsertRowid;
    const laterCourseId = insertCourse.run("beginners").lastInsertRowid;
    const insertParticipant = db.prepare(`
      INSERT INTO beginners_course_participants (course_id, username, first_name, surname,
        beginner_size_category, origin_course_type, created_by_username,
        created_at_date, created_at_time)
      VALUES (?, ?, ?, 'Participant', 'senior', ?, 'coordinator', '2026-07-01', '09:00')
    `);
    const tasterId = insertParticipant.run(tasterCourseId, "taster", "Taster", "taster-session").lastInsertRowid;
    const beginnerId = insertParticipant.run(targetCourseId, "beginner", "Beginner", "beginners").lastInsertRowid;
    const { transferBeginnersCourseParticipant } = createSqliteBeginnersCourseStatements(db);

    transferBeginnersCourseParticipant.run(tasterCourseId, targetCourseId, tasterId);
    transferBeginnersCourseParticipant.run(null, laterCourseId, tasterId);
    transferBeginnersCourseParticipant.run(null, laterCourseId, beginnerId);

    const rows = db.prepare("SELECT username, course_id, origin_course_id FROM beginners_course_participants ORDER BY username").all();
    assert.deepEqual(rows, [
      { username: "beginner", course_id: Number(laterCourseId), origin_course_id: null },
      { username: "taster", course_id: Number(laterCourseId), origin_course_id: Number(tasterCourseId) },
    ]);
  } finally {
    db.close();
  }
});

test("conversion writes the original beginner and taster journey without creating another participant", async () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    bootstrapSqliteUserCompatibility({ db });
    db.exec("ALTER TABLE beginners_course_lessons ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
    for (const username of ["coordinator", "beginner", "taster", "waiting"]) {
      db.prepare("INSERT INTO users (username, first_name, surname) VALUES (?, ?, 'Attendee')")
        .run(username, username);
    }
    const insertCourse = db.prepare(`
      INSERT INTO beginners_courses (course_type, coordinator_username, submitted_by_username,
        first_lesson_date, start_time, end_time, lesson_count, beginner_capacity,
        created_at_date, created_at_time)
      VALUES (?, 'coordinator', 'coordinator', '2026-08-01', '10:00', '12:00', 1, 8,
        '2026-08-01', '09:00')
    `);
    const tasterCourseId = Number(insertCourse.run("taster-session").lastInsertRowid);
    const beginnersCourseId = Number(insertCourse.run("beginners").lastInsertRowid);
    const statements = createSqliteBeginnersCourseStatements(db);
    const gateway = createBeginnersCourseWriteGateway({ databaseEngine: "sqlite", db, ...statements });
    const participant = (firstName) => ({
      firstName, surname: "Attendee", sizeCategory: "senior", heightText: "",
      drawLength: "", handedness: "right", eyeDominance: "right",
      initialEmailSent: false, thirtyDayReminderSent: false, courseFeePaid: false,
    });
    for (const [username, courseId, originCourseType] of [
      ["beginner", beginnersCourseId, "beginners"],
      ["taster", tasterCourseId, "taster-session"],
      ["waiting", beginnersCourseId, "beginners"],
    ]) {
      await gateway.createParticipant({ actorUsername: "coordinator", courseId, createdAtDate: "2026-08-01", createdAtTime: "09:00:00", originCourseType, participant: participant(username), username });
    }
    const rows = db.prepare("SELECT id, username, user_id FROM beginners_course_participants ORDER BY username").all();
    assert.ok(rows.every((row) => row.user_id !== null));
    const tasterId = rows.find((row) => row.username === "taster").id;
    await gateway.transferParticipantToCourse({ courseId: beginnersCourseId, participantId: tasterId, originCourseId: tasterCourseId });
    for (const username of ["beginner", "taster"]) {
      await gateway.markParticipantConverted({ actorUsername: "coordinator", convertedAtDate: "2026-08-12", convertedAtTime: "19:00:00", participantId: rows.find((row) => row.username === username).id });
      db.prepare("UPDATE users SET membership_status = 'member', programme_type = 'none' WHERE username = ?").run(username);
    }
    const report = createSqliteReportingStatements(db).listMemberJourneyParticipants.all("2026-08-01", "2026-08-31");
    assert.equal(report.length, 3);
    assert.deepEqual(report.map((row) => [row.username, row.origin_course_type, row.converted_to_member]), [
      ["beginner", "beginners", 1], ["taster", "taster-session", 1], ["waiting", "beginners", 0],
    ]);
    assert.deepEqual(db.prepare("SELECT username, converted_at_date, converted_at_time, converted_by_username FROM beginners_course_participants WHERE converted_to_member = 1 ORDER BY username").all(), [
      { username: "beginner", converted_at_date: "2026-08-12", converted_at_time: "19:00:00", converted_by_username: "coordinator" },
      { username: "taster", converted_at_date: "2026-08-12", converted_at_time: "19:00:00", converted_by_username: "coordinator" },
    ]);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM beginners_course_participants").get().count, 3);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users").get().count, 4);
  } finally {
    db.close();
  }
});
