import Database from "better-sqlite3";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

import { DEFAULT_EQUIPMENT_CUPBOARD_LABEL } from "../server/domain/constants.js";
import { bootstrapSqliteBaseSchema } from "../server/infrastructure/persistence/bootstrapSqliteBaseSchema.js";

const rootDirectory = process.cwd();
const liveDatabasePath = path.join(rootDirectory, "server", "data", "auth.live.sqlite");
const baselineDatabasePath = path.join(rootDirectory, "server", "data", "auth.sqlite");

function toBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getUserId(db, username) {
  const user = db
    .prepare(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username);

  if (!user?.id) {
    throw new Error(`Unable to find user '${username}' in live database.`);
  }

  return Number(user.id);
}

function insertAnnouncement(db, values) {
  const result = db.prepare(`
    INSERT INTO announcements (
      active_from_date,
      active_till_date,
      severity,
      message,
      escalate_severity,
      created_by_username,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.activeFromDate,
    values.activeTillDate,
    values.severity,
    values.message,
    values.escalateSeverity ? 1 : 0,
    values.createdByUsername,
    values.createdAtDate,
    values.createdAtTime,
  );

  return Number(result.lastInsertRowid);
}

function insertClubEvent(db, values) {
  const result = db.prepare(`
    INSERT INTO club_events (
      event_date,
      start_time,
      end_time,
      title,
      details,
      type,
      venue,
      submitted_by_username,
      approval_status,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time,
      submitted_by_user_id,
      approved_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.eventDate,
    values.startTime,
    values.endTime,
    values.title,
    values.details,
    values.type,
    values.venue,
    values.submittedByUsername,
    "approved",
    values.approvedByUsername,
    values.approvedAtDate,
    values.approvedAtTime,
    values.createdAtDate,
    values.createdAtTime,
    getUserId(db, values.submittedByUsername),
    getUserId(db, values.approvedByUsername),
  );

  return Number(result.lastInsertRowid);
}

function insertEventBooking(db, eventId, username, bookedAtDate, bookedAtTime) {
  db.prepare(`
    INSERT INTO event_bookings (
      club_event_id,
      member_username,
      booked_at_date,
      booked_at_time,
      member_user_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, username, bookedAtDate, bookedAtTime, getUserId(db, username));
}

function insertCoachingSession(db, values) {
  const result = db.prepare(`
    INSERT INTO coaching_sessions (
      coach_username,
      session_date,
      start_time,
      end_time,
      available_slots,
      topic,
      summary,
      venue,
      approval_status,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time,
      coach_user_id,
      approved_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.coachUsername,
    values.sessionDate,
    values.startTime,
    values.endTime,
    values.availableSlots,
    values.topic,
    values.summary,
    values.venue,
    "approved",
    values.approvedByUsername,
    values.approvedAtDate,
    values.approvedAtTime,
    values.createdAtDate,
    values.createdAtTime,
    getUserId(db, values.coachUsername),
    getUserId(db, values.approvedByUsername),
  );

  return Number(result.lastInsertRowid);
}

function insertCoachingBooking(
  db,
  coachingSessionId,
  username,
  bookedAtDate,
  bookedAtTime,
) {
  db.prepare(`
    INSERT INTO coaching_session_bookings (
      coaching_session_id,
      member_username,
      booked_at_date,
      booked_at_time,
      member_user_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    coachingSessionId,
    username,
    bookedAtDate,
    bookedAtTime,
    getUserId(db, username),
  );
}

function insertTournament(db, values) {
  const result = db.prepare(`
    INSERT INTO tournaments (
      name,
      tournament_type,
      registration_start_date,
      registration_end_date,
      score_submission_start_date,
      score_submission_end_date,
      created_by,
      created_at_date,
      created_at_time,
      created_by_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.name,
    values.tournamentType,
    values.registrationStartDate,
    values.registrationEndDate,
    values.scoreSubmissionStartDate,
    values.scoreSubmissionEndDate,
    values.createdBy,
    values.createdAtDate,
    values.createdAtTime,
    getUserId(db, values.createdBy),
  );

  return Number(result.lastInsertRowid);
}

function insertTournamentRegistration(
  db,
  tournamentId,
  username,
  registeredAtDate,
  registeredAtTime,
) {
  db.prepare(`
    INSERT INTO tournament_registrations (
      tournament_id,
      member_username,
      registered_at_date,
      registered_at_time,
      member_user_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    tournamentId,
    username,
    registeredAtDate,
    registeredAtTime,
    getUserId(db, username),
  );
}

function main() {
  if (!existsSync(baselineDatabasePath)) {
    throw new Error(`Baseline database not found at ${baselineDatabasePath}`);
  }

  const backupPath = `${liveDatabasePath}.backup-showcase-${toBackupTimestamp()}`;

  if (existsSync(liveDatabasePath)) {
    copyFileSync(liveDatabasePath, backupPath);
  }

  copyFileSync(baselineDatabasePath, liveDatabasePath);

  const db = new Database(liveDatabasePath);

  try {
    bootstrapSqliteBaseSchema({
      db,
      defaultEquipmentCupboardLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
    });

    db.pragma("foreign_keys = ON");

    db.transaction(() => {
      db.prepare(`DELETE FROM announcement_seen_members`).run();
      db.prepare(`DELETE FROM announcements`).run();

      const announcementOneId = insertAnnouncement(db, {
        activeFromDate: "2026-07-01",
        activeTillDate: "2026-07-20",
        severity: "information",
        message:
          "Summer outdoor season is underway. Please confirm coaching sessions and tournament entries for July.",
        escalateSeverity: false,
        createdByUsername: "LTaylor",
        createdAtDate: "2026-07-01",
        createdAtTime: "08:15:00.000Z",
      });
      const announcementTwoId = insertAnnouncement(db, {
        activeFromDate: "2026-07-06",
        activeTillDate: "2026-07-08",
        severity: "urgent",
        message:
          "Outdoor range opens at 19:00 on Tuesday while targets are reset after maintenance.",
        escalateSeverity: true,
        createdByUsername: "Cfleetham",
        createdAtDate: "2026-07-06",
        createdAtTime: "07:45:00.000Z",
      });

      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(announcementOneId, "Cfleetham", "2026-07-01", "08:40:00.000Z");
      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(announcementOneId, "LTaylor", "2026-07-01", "09:05:00.000Z");
      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(announcementTwoId, "Cfleetham", "2026-07-06", "08:10:00.000Z");

      const summerShootId = insertClubEvent(db, {
        eventDate: "2026-07-12",
        startTime: "10:00",
        endTime: "13:00",
        title: "Summer Handicap Shoot",
        details: "Outdoor ranking round followed by team handicaps and a short finals session.",
        type: "competition",
        venue: "outdoor",
        submittedByUsername: "CLikley",
        approvedByUsername: "LTaylor",
        approvedAtDate: "2026-07-02",
        approvedAtTime: "18:30:00.000Z",
        createdAtDate: "2026-07-02",
        createdAtTime: "18:00:00.000Z",
      });
      const bbqId = insertClubEvent(db, {
        eventDate: "2026-07-18",
        startTime: "17:30",
        endTime: "20:30",
        title: "Club BBQ and Awards Evening",
        details: "Bring a side dish. Trophy recap starts at 19:00 after open shooting wraps up.",
        type: "social",
        venue: "outdoor",
        submittedByUsername: "Cfleetham",
        approvedByUsername: "LTaylor",
        approvedAtDate: "2026-07-03",
        approvedAtTime: "19:15:00.000Z",
        createdAtDate: "2026-07-03",
        createdAtTime: "18:45:00.000Z",
      });

      insertEventBooking(db, summerShootId, "Cfleetham", "2026-07-03", "20:15:00.000Z");
      insertEventBooking(db, summerShootId, "tstark", "2026-07-03", "20:18:00.000Z");
      insertEventBooking(db, bbqId, "RWilliams", "2026-07-04", "09:05:00.000Z");
      insertEventBooking(db, bbqId, "MMurdock", "2026-07-04", "09:22:00.000Z");

      const coachingSessionId = insertCoachingSession(db, {
        coachUsername: "CLikley",
        sessionDate: "2026-07-10",
        startTime: "18:30",
        endTime: "19:30",
        availableSlots: 4,
        topic: "Outdoor Sight Marks Clinic",
        summary:
          "A practical session on sight mark setup, windy-day adjustments, and scoring confidence.",
        venue: "outdoor",
        approvedByUsername: "LTaylor",
        approvedAtDate: "2026-07-02",
        approvedAtTime: "18:40:00.000Z",
        createdAtDate: "2026-07-02",
        createdAtTime: "18:05:00.000Z",
      });

      insertCoachingBooking(
        db,
        coachingSessionId,
        "Cfleetham",
        "2026-07-03",
        "08:55:00.000Z",
      );
      insertCoachingBooking(
        db,
        coachingSessionId,
        "tstark",
        "2026-07-03",
        "09:05:00.000Z",
      );

      const tournamentId = insertTournament(db, {
        name: "Summer Portsmouth Ladder",
        tournamentType: "portsmouth",
        registrationStartDate: "2026-07-01",
        registrationEndDate: "2026-07-12",
        scoreSubmissionStartDate: "2026-07-13",
        scoreSubmissionEndDate: "2026-07-20",
        createdBy: "LTaylor",
        createdAtDate: "2026-07-01",
        createdAtTime: "10:30:00.000Z",
      });

      for (const [username, time] of [
        ["Cfleetham", "10:31:00.000Z"],
        ["CLikley", "10:33:00.000Z"],
        ["RWilliams", "10:35:00.000Z"],
        ["MMurdock", "10:37:00.000Z"],
      ]) {
        insertTournamentRegistration(db, tournamentId, username, "2026-07-01", time);
      }
    })();

    const summaryTables = [
      "users",
      "announcements",
      "club_events",
      "event_bookings",
      "coaching_sessions",
      "coaching_session_bookings",
      "equipment_items",
      "equipment_loans",
      "beginners_courses",
      "beginners_course_participants",
      "tournaments",
      "tournament_registrations",
      "tournament_scores",
      "login_events",
    ];

    console.log(`Backed up previous live database to ${backupPath}`);
    console.log(`Seeded showcase data into ${liveDatabasePath}`);

    for (const table of summaryTables) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
      console.log(`${table}: ${row.count}`);
    }
  } finally {
    db.close();
  }
}

main();
