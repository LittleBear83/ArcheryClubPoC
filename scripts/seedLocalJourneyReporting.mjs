import Database from "better-sqlite3";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

import { DEFAULT_EQUIPMENT_CUPBOARD_LABEL } from "../server/domain/constants.js";
import { bootstrapSqliteBaseSchema } from "../server/infrastructure/persistence/bootstrapSqliteBaseSchema.js";

const rootDirectory = process.cwd();
const databasePath = path.join(rootDirectory, "server", "data", "auth.sqlite");

function toBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getUserId(db, username) {
  const row = db
    .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username);

  if (!row?.id) {
    throw new Error(`Unable to find local user '${username}'.`);
  }

  return Number(row.id);
}

function findCourseId(db, courseType, firstLessonDate) {
  const row = db.prepare(`
    SELECT id
    FROM beginners_courses
    WHERE course_type = ?
      AND first_lesson_date = ?
      AND approval_status = 'approved'
      AND COALESCE(is_cancelled, 0) = 0
    ORDER BY id ASC
    LIMIT 1
  `).get(courseType, firstLessonDate);

  return row?.id ? Number(row.id) : null;
}

function createCourse(db, {
  approvedAtDate,
  approvedAtTime,
  coordinatorUsername,
  courseType,
  createdAtDate,
  createdAtTime,
  endTime,
  firstLessonDate,
  lessonCount,
  startTime,
  submittedByUsername,
}) {
  const result = db.prepare(`
    INSERT INTO beginners_courses (
      course_type,
      coordinator_username,
      submitted_by_username,
      first_lesson_date,
      start_time,
      end_time,
      lesson_count,
      beginner_capacity,
      approval_status,
      rejection_reason,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', '', ?, ?, ?, ?, ?)
  `).run(
    courseType,
    coordinatorUsername,
    submittedByUsername,
    firstLessonDate,
    startTime,
    endTime,
    lessonCount,
    8,
    submittedByUsername,
    approvedAtDate,
    approvedAtTime,
    createdAtDate,
    createdAtTime,
  );

  const courseId = Number(result.lastInsertRowid);
  for (let lessonNumber = 1; lessonNumber <= lessonCount; lessonNumber += 1) {
    db.prepare(`
      INSERT INTO beginners_course_lessons (
        course_id,
        lesson_number,
        lesson_date,
        start_time,
        end_time
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(courseId, lessonNumber, firstLessonDate, startTime, endTime);
  }

  return courseId;
}

function ensureCourse(db, definition) {
  return (
    findCourseId(db, definition.courseType, definition.firstLessonDate) ??
    createCourse(db, definition)
  );
}

function removeParticipantByUsername(db, username) {
  db.prepare(`
    DELETE FROM beginners_course_participants
    WHERE username = ? COLLATE NOCASE
  `).run(username);
}

function updateUserJourneyStatus(db, username, membershipStatus, programmeType, activeMember) {
  db.prepare(`
    UPDATE users
    SET
      membership_status = ?,
      programme_type = ?,
      active_member = ?
    WHERE username = ? COLLATE NOCASE
  `).run(membershipStatus, programmeType, activeMember ? 1 : 0, username);
}

function insertParticipant(db, participant) {
  db.prepare(`
    INSERT INTO beginners_course_participants (
      course_id,
      username,
      first_name,
      surname,
      beginner_size_category,
      height_text,
      draw_length,
      handedness,
      eye_dominance,
      initial_email_sent,
      thirty_day_reminder_sent,
      course_fee_paid,
      origin_course_type,
      converted_to_member,
      converted_at_date,
      converted_at_time,
      converted_by_username,
      created_by_username,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    participant.courseId,
    participant.username,
    participant.firstName,
    participant.surname,
    participant.sizeCategory,
    participant.heightText,
    participant.drawLength,
    participant.handedness,
    participant.eyeDominance,
    participant.initialEmailSent ? 1 : 0,
    participant.thirtyDayReminderSent ? 1 : 0,
    participant.courseFeePaid ? 1 : 0,
    participant.originCourseType,
    participant.convertedToMember ? 1 : 0,
    participant.convertedAtDate ?? null,
    participant.convertedAtTime ?? null,
    participant.convertedByUsername ?? null,
    participant.createdByUsername,
    participant.createdAtDate,
    participant.createdAtTime,
  );
}

function main() {
  if (!existsSync(databasePath)) {
    throw new Error(`Local database not found at ${databasePath}`);
  }

  const backupPath = `${databasePath}.backup-journey-report-${toBackupTimestamp()}`;
  copyFileSync(databasePath, backupPath);

  const db = new Database(databasePath);

  try {
    bootstrapSqliteBaseSchema({
      db,
      defaultEquipmentCupboardLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
    });
    db.pragma("foreign_keys = ON");

    db.transaction(() => {
      const actorUsername = "LTaylor";
      const approvedAtDate = "2026-08-01";
      const approvedAtTime = "09:00:00";

      const beginnersCourseId = ensureCourse(db, {
        approvedAtDate,
        approvedAtTime,
        coordinatorUsername: actorUsername,
        courseType: "beginners",
        createdAtDate: "2026-08-01",
        createdAtTime: "08:30:00",
        endTime: "20:00",
        firstLessonDate: "2026-08-03",
        lessonCount: 3,
        startTime: "18:00",
        submittedByUsername: actorUsername,
      });
      const tasterCourseId = ensureCourse(db, {
        approvedAtDate: "2026-08-20",
        approvedAtTime: "09:00:00",
        coordinatorUsername: actorUsername,
        courseType: "taster-session",
        createdAtDate: "2026-08-20",
        createdAtTime: "08:30:00",
        endTime: "20:00",
        firstLessonDate: "2026-08-22",
        lessonCount: 1,
        startTime: "18:00",
        submittedByUsername: actorUsername,
      });

      const participants = [
        {
          courseId: tasterCourseId,
          username: "PParker",
          firstName: "Peter",
          surname: "Parker",
          sizeCategory: "senior",
          heightText: "5ft 8in",
          drawLength: '28"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-22",
          createdAtTime: "17:40:00",
          convertedToMember: false,
          membershipStatus: "non-member",
          programmeType: "taster-session",
          activeMember: false,
        },
        {
          courseId: tasterCourseId,
          username: "NOdinson",
          firstName: "Thor",
          surname: "Odinson",
          sizeCategory: "senior",
          heightText: "6ft 2in",
          drawLength: '30"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-22",
          createdAtTime: "17:45:00",
          convertedToMember: false,
          membershipStatus: "non-member",
          programmeType: "taster-session",
          activeMember: false,
        },
        {
          courseId: beginnersCourseId,
          username: "CLikley",
          firstName: "Chris",
          surname: "Likley",
          sizeCategory: "senior",
          heightText: "5ft 10in",
          drawLength: '28"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-10",
          createdAtTime: "18:05:00",
          convertedToMember: false,
          membershipStatus: "non-member",
          programmeType: "beginners",
          activeMember: false,
        },
        {
          courseId: beginnersCourseId,
          username: "MMurdock",
          firstName: "Matt",
          surname: "Murdock",
          sizeCategory: "senior",
          heightText: "5ft 11in",
          drawLength: '27"',
          handedness: "right",
          eyeDominance: "left",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-11",
          createdAtTime: "18:10:00",
          convertedToMember: false,
          membershipStatus: "non-member",
          programmeType: "beginners",
          activeMember: false,
        },
        {
          courseId: beginnersCourseId,
          username: "Cfleetham",
          firstName: "Craig",
          surname: "Fleetham",
          sizeCategory: "senior",
          heightText: "5ft 9in",
          drawLength: '28"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-06",
          createdAtTime: "18:00:00",
          convertedToMember: true,
          convertedAtDate: "2026-08-19",
          convertedAtTime: "20:15:00",
          convertedByUsername: actorUsername,
          membershipStatus: "member",
          programmeType: "none",
          activeMember: true,
        },
        {
          courseId: beginnersCourseId,
          username: "LTaylor",
          firstName: "Les",
          surname: "Taylor",
          sizeCategory: "senior",
          heightText: "6ft 0in",
          drawLength: '29"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "taster-session",
          createdAtDate: "2026-08-07",
          createdAtTime: "18:12:00",
          convertedToMember: true,
          convertedAtDate: "2026-08-20",
          convertedAtTime: "20:10:00",
          convertedByUsername: actorUsername,
          membershipStatus: "member",
          programmeType: "none",
          activeMember: true,
        },
        {
          courseId: beginnersCourseId,
          username: "TBarnes",
          firstName: "Bucky",
          surname: "Barnes",
          sizeCategory: "senior",
          heightText: "5ft 10in",
          drawLength: '29"',
          handedness: "right",
          eyeDominance: "left",
          originCourseType: "beginners",
          createdAtDate: "2026-08-05",
          createdAtTime: "17:55:00",
          convertedToMember: false,
          membershipStatus: "non-member",
          programmeType: "beginners",
          activeMember: false,
        },
        {
          courseId: beginnersCourseId,
          username: "RWilliams",
          firstName: "Riri",
          surname: "Williams",
          sizeCategory: "senior",
          heightText: "5ft 7in",
          drawLength: '27"',
          handedness: "right",
          eyeDominance: "right",
          originCourseType: "beginners",
          createdAtDate: "2026-08-05",
          createdAtTime: "18:20:00",
          convertedToMember: true,
          convertedAtDate: "2026-08-18",
          convertedAtTime: "20:05:00",
          convertedByUsername: actorUsername,
          membershipStatus: "member",
          programmeType: "none",
          activeMember: true,
        },
      ];

      for (const participant of participants) {
        removeParticipantByUsername(db, participant.username);
        updateUserJourneyStatus(
          db,
          participant.username,
          participant.membershipStatus,
          participant.programmeType,
          participant.activeMember,
        );
        insertParticipant(db, {
          ...participant,
          courseFeePaid: true,
          createdByUsername: actorUsername,
          initialEmailSent: true,
          thirtyDayReminderSent: participant.convertedToMember,
        });
      }
    })();

    const summary = db.prepare(`
      SELECT
        SUM(CASE WHEN origin_course_type = 'taster-session' THEN 1 ELSE 0 END) AS taster_count,
        SUM(CASE WHEN origin_course_type = 'taster-session' AND converted_to_member = 1 THEN 1 ELSE 0 END) AS taster_member_count,
        SUM(CASE WHEN origin_course_type = 'beginners' THEN 1 ELSE 0 END) AS direct_beginners_count,
        SUM(CASE WHEN origin_course_type = 'beginners' AND converted_to_member = 1 THEN 1 ELSE 0 END) AS direct_beginners_member_count
      FROM beginners_course_participants
      WHERE created_at_date >= '2026-08-01' AND created_at_date <= '2026-08-31'
    `).get();

    console.log(`Backed up local database to ${backupPath}`);
    console.log(`Seeded journey reporting data into ${databasePath}`);
    console.log(`Taster starters: ${summary.taster_count ?? 0}`);
    console.log(`Taster path to member: ${summary.taster_member_count ?? 0}`);
    console.log(`Direct beginners starters: ${summary.direct_beginners_count ?? 0}`);
    console.log(`Direct beginners to member: ${summary.direct_beginners_member_count ?? 0}`);
  } finally {
    db.close();
  }
}

main();
