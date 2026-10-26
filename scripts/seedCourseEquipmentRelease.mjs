import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { serverRuntime } from "../server/config/runtime.js";

if (serverRuntime.isLive || serverRuntime.databaseEngine !== "sqlite" || serverRuntime.sync.isLocalPiNode) {
  throw new Error("Equipment release samples require a non-live local SQLite runtime.");
}
if (!existsSync(serverRuntime.databasePath)) {
  throw new Error("Start the local server once to create the SQLite database before seeding.");
}

const db = new Database(serverRuntime.databasePath);
const marker = "dev_release_ready_anna";
const actor = "Cfleetham";
const coordinator = "CLikley";
const now = new Date();
const day = (offset) => {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const today = day(0);
const time = now.toISOString().slice(11);
const backupPath = `${serverRuntime.databasePath}.before-equipment-release-seed-${now.toISOString().replace(/[:.]/g, "-")}.sqlite`;

function userId(username) {
  const row = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!row) throw new Error(`Missing local staff account ${username}. Start the server and seed baseline users first.`);
  return row.id;
}

function addUser(username, firstName, surname, converted = false) {
  const result = db.prepare(`INSERT INTO users
    (username, first_name, surname, active_member, membership_status, programme_type)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(username, firstName, surname, converted ? 1 : 0,
      converted ? "member" : "non-member", converted ? "none" : "beginners");
  db.prepare("INSERT INTO user_types (username, user_type, user_id) VALUES (?, ?, ?)")
    .run(username, converted ? "general" : "non-member", result.lastInsertRowid);
}

function addCourse(firstOffset, lessonCount) {
  const courseId = Number(db.prepare(`INSERT INTO beginners_courses
    (course_type, coordinator_username, submitted_by_username, first_lesson_date,
      start_time, end_time, lesson_count, beginner_capacity, approval_status,
      approved_by_username, approved_at_date, approved_at_time, created_at_date, created_at_time)
    VALUES ('beginners', ?, ?, ?, '18:00', '20:00', ?, 8, 'approved', ?, ?, ?, ?, ?)`)
    .run(coordinator, actor, day(firstOffset), lessonCount, actor, today, time, today, time).lastInsertRowid);
  const insertLesson = db.prepare(`INSERT INTO beginners_course_lessons
    (course_id, lesson_number, lesson_date, start_time, end_time)
    VALUES (?, ?, ?, '18:00', '20:00')`);
  const lessons = [];
  for (let index = 0; index < lessonCount; index += 1) {
    lessons.push(Number(insertLesson.run(courseId, index + 1, day(firstOffset + index * 7)).lastInsertRowid));
  }
  return { courseId, lessons };
}

function addCase(number, { status = "active", member = null } = {}) {
  return Number(db.prepare(`INSERT INTO equipment_items
    (equipment_type, item_number, size_category, status, location_type, location_label,
      location_member_username, added_by_username, added_at_date, added_at_time)
    VALUES ('case', ?, 'standard', ?, ?, ?, ?, ?, ?, ?)`)
    .run(number, status, member ? "member" : "cupboard",
      member ? null : "Equipment cupboard", member, actor, today, time).lastInsertRowid);
}

function addContent(number, caseId) {
  return Number(db.prepare(`INSERT INTO equipment_items
    (equipment_type, item_number, size_category, status, location_type, location_case_id,
      added_by_username, added_at_date, added_at_time)
    VALUES ('riser', ?, 'standard', 'active', 'case', ?, ?, ?, ?)`)
    .run(number, caseId, actor, today, time).lastInsertRowid);
}

function addParticipant(courseId, username, firstName, surname, caseId, converted = false) {
  addUser(username, firstName, surname, converted);
  return Number(db.prepare(`INSERT INTO beginners_course_participants
    (course_id, username, first_name, surname, beginner_size_category,
      converted_to_member, converted_at_date, converted_at_time, converted_by_username,
      assigned_case_id, assigned_case_by_username, assigned_case_at_date, assigned_case_at_time,
      created_by_username, created_at_date, created_at_time)
    VALUES (?, ?, ?, ?, 'senior', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(courseId, username, firstName, surname, converted ? 1 : 0,
      converted ? today : null, converted ? time : null, converted ? actor : null,
      converted ? null : caseId, converted ? null : actor,
      converted ? null : today, converted ? null : time,
      actor, today, time).lastInsertRowid);
}

function addAttendance(lessonId, participantId) {
  db.prepare(`INSERT INTO beginners_course_manual_attendance
    (lesson_id, participant_id, recorded_by_username, recorded_at_date, recorded_at_time)
    VALUES (?, ?, ?, ?, ?)`)
    .run(lessonId, participantId, actor, today, time);
}

function addOpenLoan(itemId, username, caseId = null) {
  db.prepare(`INSERT INTO equipment_loans
    (equipment_item_id, member_username, loaned_by_username, loaned_at_date, loaned_at_time,
      loan_context_case_id, expected_return_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(itemId, username, actor, today, time, caseId, day(21));
}

try {
  db.pragma("foreign_keys = ON");
  userId(actor);
  userId(coordinator);
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(marker);
  if (existing) {
    console.log("Equipment release sample data already exists; no records were changed.");
    process.exitCode = 0;
  } else {
    await db.backup(backupPath);
    const result = db.transaction(() => {
      const ready = addCourse(-49, 4);
      const blocked = addCourse(-42, 4);
      const active = addCourse(-7, 4);

      const annaCase = addCase("DEV-RELEASE-READY-01");
      const benCase = addCase("DEV-RELEASE-READY-02");
      const blockedCase = addCase("DEV-RELEASE-BLOCKED-01");
      const activeCase = addCase("DEV-RELEASE-ACTIVE-01");
      addCase("DEV-RELEASE-AVAILABLE-01");
      addCase("DEV-RELEASE-DECOMMISSIONED-01", { status: "decommissioned" });

      addContent("DEV-RELEASE-RISER-01", annaCase);
      addContent("DEV-RELEASE-RISER-02", benCase);
      const blockedContent = addContent("DEV-RELEASE-RISER-BLOCKED", blockedCase);

      const anna = addParticipant(ready.courseId, marker, "Anna", "Sample", annaCase);
      const ben = addParticipant(ready.courseId, "dev_release_ready_ben", "Ben", "Sample", benCase);
      const chris = addParticipant(blocked.courseId, "dev_release_blocked_chris", "Chris", "Sample", blockedCase);
      addParticipant(blocked.courseId, "dev_release_converted_ella", "Ella", "Sample", null, true);
      db.prepare(`UPDATE equipment_items SET location_type = 'member', location_case_id = NULL,
        location_member_username = ? WHERE id = ?`).run("dev_release_converted_ella", blockedContent);
      const loanedCase = addCase("DEV-RELEASE-LOAN-01", { member: "dev_release_converted_ella" });
      const dana = addParticipant(active.courseId, "dev_release_active_dana", "Dana", "Sample", activeCase);
      addAttendance(ready.lessons[0], anna);
      addAttendance(ready.lessons[1], anna);
      addAttendance(ready.lessons[0], ben);
      addAttendance(blocked.lessons[0], chris);
      addAttendance(active.lessons[0], dana);
      addOpenLoan(blockedContent, "dev_release_converted_ella", blockedCase);
      addOpenLoan(loanedCase, "dev_release_converted_ella");
      return { readyCourseId: ready.courseId, blockedCourseId: blocked.courseId,
        activeCourseId: active.courseId, readyCases: [annaCase, benCase], blockedCase,
        activeCase, loanedCase };
    })();
    console.log(`Equipment release samples added to ${serverRuntime.databasePath}`);
    console.log(`Backup: ${backupPath}`);
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  db.close();
}
