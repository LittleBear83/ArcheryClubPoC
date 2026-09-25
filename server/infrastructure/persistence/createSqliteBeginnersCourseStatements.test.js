import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { bootstrapSqliteBaseSchema } from "./bootstrapSqliteBaseSchema.js";
import { bootstrapSqliteUserCompatibility } from "./bootstrapSqliteUserCompatibility.js";
import { createSqliteBeginnersCourseStatements } from "./createSqliteBeginnersCourseStatements.js";

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
