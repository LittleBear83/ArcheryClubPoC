import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { bootstrapSqliteBaseSchema } from "./bootstrapSqliteBaseSchema.js";
import { bootstrapSqliteUserCompatibility } from "./bootstrapSqliteUserCompatibility.js";
import { createSqliteBeginnersCourseStatements } from "./createSqliteBeginnersCourseStatements.js";
import { createBeginnersCourseWriteGateway } from "./beginnersCourseWriteGateway.js";
import { createSqliteReportingStatements } from "./createSqliteReportingStatements.js";

test("course creation persists the Beginners default and independent lesson overrides", async () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    bootstrapSqliteUserCompatibility({ db });
    db.exec("ALTER TABLE beginners_course_lessons ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
    db.prepare("INSERT INTO users (username, first_name, surname) VALUES ('coordinator', 'Course', 'Coordinator')").run();
    const statements = createSqliteBeginnersCourseStatements(db);
    const gateway = createBeginnersCourseWriteGateway({ databaseEngine: "sqlite", db, ...statements });
    const lessonDates = Array.from({ length: 6 }, (_value, index) => ({
      lessonNumber: index + 1,
      lessonDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
    }));
    const courseId = await gateway.createCourseWithLessons({
      actorUsername: "coordinator",
      courseType: "beginners",
      coordinatorUsername: "coordinator",
      firstLessonDate: "2026-08-01",
      startTime: "10:00:00",
      endTime: "12:00:00",
      lessonCount: 6,
      beginnerCapacity: 12,
      requiredCoachesDefault: 5,
      lessonDates: lessonDates.map((lesson) => ({
        ...lesson,
        requiredCoachCount: lesson.lessonNumber === 3 ? 4 : 5,
      })),
      createdAtDate: "2026-07-01",
      createdAtTime: "09:00:00",
    });
    assert.deepEqual(
      db.prepare("SELECT lesson_number, required_coach_count FROM beginners_course_lessons WHERE course_id = ? ORDER BY lesson_number").all(courseId),
      lessonDates.map((lesson) => ({ lesson_number: lesson.lessonNumber, required_coach_count: lesson.lessonNumber === 3 ? 4 : 5 })),
    );

    const customDefaultCourseId = await gateway.createCourseWithLessons({
      actorUsername: "coordinator",
      courseType: "beginners",
      coordinatorUsername: "coordinator",
      firstLessonDate: "2026-09-01",
      startTime: "10:00:00",
      endTime: "12:00:00",
      lessonCount: 3,
      beginnerCapacity: 12,
      requiredCoachesDefault: 3,
      lessonDates: [1, 2, 3].map((lessonNumber) => ({
        lessonNumber,
        lessonDate: `2026-09-0${lessonNumber}`,
        ...(lessonNumber === 1 ? { requiredCoachCount: 2 } : lessonNumber === 3 ? { requiredCoachCount: 4 } : {}),
      })),
      createdAtDate: "2026-07-01",
      createdAtTime: "09:00:00",
    });
    assert.deepEqual(
      db.prepare("SELECT required_coach_count FROM beginners_course_lessons WHERE course_id = ? ORDER BY lesson_number").all(customDefaultCourseId).map((row) => row.required_coach_count),
      [2, 3, 4],
    );

    const tasterCourseId = await gateway.createCourseWithLessons({
      actorUsername: "coordinator",
      courseType: "taster-session",
      coordinatorUsername: "coordinator",
      firstLessonDate: "2026-08-01",
      startTime: "10:00:00",
      endTime: "12:00:00",
      lessonCount: 1,
      beginnerCapacity: 12,
      lessonDates: [{ lessonNumber: 1, lessonDate: "2026-08-01" }],
      createdAtDate: "2026-07-01",
      createdAtTime: "09:00:00",
    });
    assert.equal(db.prepare("SELECT required_coach_count FROM beginners_course_lessons WHERE course_id = ?").get(tasterCourseId).required_coach_count, 5);
  } finally {
    db.close();
  }
});

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

test("self-coaching assignment atomically adds once with profile IDs and allows future self-withdrawal", async () => {
  const db = new Database(":memory:");
  try {
    bootstrapSqliteBaseSchema({ db, defaultEquipmentCupboardLabel: "Club cupboard" });
    bootstrapSqliteUserCompatibility({ db });
    db.exec("ALTER TABLE beginners_course_lessons ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0");
    for (const username of ["coordinator", "coach"]) {
      db.prepare("INSERT INTO users (username, first_name, surname) VALUES (?, ?, 'Archer')").run(username, username);
    }
    const assignedAtDate = new Date().toISOString().slice(0, 10);
    const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const courseId = Number(db.prepare(`
      INSERT INTO beginners_courses (course_type, coordinator_username, submitted_by_username,
        first_lesson_date, start_time, end_time, lesson_count, beginner_capacity,
        approval_status, created_at_date, created_at_time)
      VALUES ('beginners', 'coordinator', 'coordinator', ?, '18:00', '20:00', 1, 8,
        'approved', ?, '09:00')
    `).run(futureDate, assignedAtDate).lastInsertRowid);
    const lessonId = Number(db.prepare(`
      INSERT INTO beginners_course_lessons (course_id, lesson_number, lesson_date, start_time, end_time)
      VALUES (?, 1, ?, '18:00', '20:00')
    `).run(courseId, futureDate).lastInsertRowid);
    assert.equal(db.prepare("SELECT required_coach_count FROM beginners_course_lessons WHERE id = ?").get(lessonId).required_coach_count, 1);
    const gateway = createBeginnersCourseWriteGateway({
      databaseEngine: "sqlite", db, ...createSqliteBeginnersCourseStatements(db),
    });
    const assignedAtTime = new Date().toISOString().slice(11, 19);
    const input = { actorUsername: "coach", assignedAtDate, assignedAtTime, lessonId };
    assert.equal(await gateway.addLessonCoachSelf(input), true);
    assert.equal(await gateway.addLessonCoachSelf(input), false);
    const row = db.prepare("SELECT coach_user_id, assigned_by_user_id FROM beginners_course_lesson_coaches WHERE lesson_id = ?").get(lessonId);
    assert.ok(row.coach_user_id);
    assert.equal(row.coach_user_id, row.assigned_by_user_id);
    assert.equal(await gateway.removeLessonCoachSelf({ actorUsername: "coach", lessonId, nowDate: assignedAtDate, nowTime: "12:00:00" }), true);
    assert.equal(await gateway.removeLessonCoachSelf({ actorUsername: "coach", lessonId, nowDate: assignedAtDate, nowTime: "12:00:00" }), false);

    for (const username of ["coach-two", "coach-three"]) {
      db.prepare("INSERT INTO users (username, first_name, surname) VALUES (?, ?, 'Archer')").run(username, username);
    }
    const multiCoachLessonId = Number(db.prepare(`
      INSERT INTO beginners_course_lessons (course_id, lesson_number, lesson_date, start_time, end_time, required_coach_count)
      VALUES (?, 2, ?, '18:00', '20:00', 2)
    `).run(courseId, futureDate).lastInsertRowid);
    const firstSlot = { actorUsername: "coach", assignedAtDate, assignedAtTime, lessonId: multiCoachLessonId };
    assert.equal(await gateway.addLessonCoachSelf(firstSlot), true);
    const finalSlotClaims = await Promise.all(["coach-two", "coach-three"].map((actorUsername) =>
      gateway.addLessonCoachSelf({ actorUsername, assignedAtDate, assignedAtTime, lessonId: multiCoachLessonId }),
    ));
    assert.equal(finalSlotClaims.filter(Boolean).length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM beginners_course_lesson_coaches WHERE lesson_id = ?").get(multiCoachLessonId).count, 2);
  } finally {
    db.close();
  }
});
