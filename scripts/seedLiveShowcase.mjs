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

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function toUtcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function toUtcTimeString(date) {
  return date.toISOString().slice(11);
}

function toUtcTimestampParts(date) {
  return {
    date: toUtcDateString(date),
    time: toUtcTimeString(date),
  };
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

function insertTournamentScore(
  db,
  tournamentId,
  roundNumber,
  username,
  score,
  submittedAtDate,
  submittedAtTime,
) {
  db.prepare(`
    INSERT INTO tournament_scores (
      tournament_id,
      round_number,
      member_username,
      score,
      submitted_at_date,
      submitted_at_time,
      member_user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tournamentId,
    roundNumber,
    username,
    score,
    submittedAtDate,
    submittedAtTime,
    getUserId(db, username),
  );
}

function insertLoginEvent(db, username, method, date, time) {
  db.prepare(`
    INSERT INTO login_events (
      username,
      login_method,
      logged_in_date,
      logged_in_time,
      user_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(username, method, date, time, getUserId(db, username));
}

function insertLostArrow(db, values) {
  const result = db.prepare(`
    INSERT INTO lost_arrows (
      archer_username,
      date_lost,
      arrow_material,
      arrow_colour,
      arrow_identifier,
      fletching_colour_1,
      fletching_colour_2,
      fletching_colour_3,
      nock_colour,
      target_distance,
      lane_number,
      other_details,
      date_found,
      found_by_username,
      found_seen_at_date,
      found_seen_at_time,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.archerUsername,
    values.dateLost,
    values.arrowMaterial,
    values.arrowColour,
    values.arrowIdentifier,
    values.fletchingColour1,
    values.fletchingColour2,
    values.fletchingColour3,
    values.nockColour,
    values.targetDistance,
    values.laneNumber,
    values.otherDetails ?? "",
    values.dateFound ?? null,
    values.foundByUsername ?? null,
    values.foundSeenAtDate ?? null,
    values.foundSeenAtTime ?? null,
    values.createdAtDate,
    values.createdAtTime,
  );

  return Number(result.lastInsertRowid);
}

function insertOutdoorTableEntry(db, values) {
  db.prepare(`
    INSERT INTO outdoor_table_entries (
      season_year,
      archer_username,
      bow_type,
      handicap,
      archer_3rd,
      archer_2nd,
      archer_1st,
      bowman_3rd,
      bowman_2nd,
      bowman_1st,
      master_bowman,
      grand_master_bowman,
      elite_master_bowman,
      archer_3rd_date,
      archer_2nd_date,
      archer_1st_date,
      bowman_3rd_date,
      bowman_2nd_date,
      bowman_1st_date,
      master_bowman_date,
      grand_master_bowman_date,
      elite_master_bowman_date,
      award_252_20,
      award_252_30,
      award_252_40,
      award_252_50,
      award_252_60,
      award_252_80,
      award_252_100,
      award_252_20_sign_off_dates,
      award_252_30_sign_off_dates,
      award_252_40_sign_off_dates,
      award_252_50_sign_off_dates,
      award_252_60_sign_off_dates,
      award_252_80_sign_off_dates,
      award_252_100_sign_off_dates,
      clout_white_20,
      clout_white_30,
      clout_white_40,
      clout_white_50,
      clout_white_60,
      clout_white_70_80,
      clout_white_90_100,
      created_at_date,
      created_at_time,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (
      @seasonYear,
      @archerUsername,
      @bowType,
      @handicap,
      @archer3rd,
      @archer2nd,
      @archer1st,
      @bowman3rd,
      @bowman2nd,
      @bowman1st,
      @masterBowman,
      @grandMasterBowman,
      @eliteMasterBowman,
      @archer3rdDate,
      @archer2ndDate,
      @archer1stDate,
      @bowman3rdDate,
      @bowman2ndDate,
      @bowman1stDate,
      @masterBowmanDate,
      @grandMasterBowmanDate,
      @eliteMasterBowmanDate,
      @award25220,
      @award25230,
      @award25240,
      @award25250,
      @award25260,
      @award25280,
      @award252100,
      @award25220SignOffDates,
      @award25230SignOffDates,
      @award25240SignOffDates,
      @award25250SignOffDates,
      @award25260SignOffDates,
      @award25280SignOffDates,
      @award252100SignOffDates,
      @cloutWhite20,
      @cloutWhite30,
      @cloutWhite40,
      @cloutWhite50,
      @cloutWhite60,
      @cloutWhite7080,
      @cloutWhite90100,
      @createdAtDate,
      @createdAtTime,
      @updatedAtDate,
      @updatedAtTime,
      @updatedByUsername
    )
  `).run({
    seasonYear: values.seasonYear,
    archerUsername: values.archerUsername,
    bowType: values.bowType,
    handicap: values.handicap ?? null,
    archer3rd: values.archer3rd ? 1 : 0,
    archer2nd: values.archer2nd ? 1 : 0,
    archer1st: values.archer1st ? 1 : 0,
    bowman3rd: values.bowman3rd ? 1 : 0,
    bowman2nd: values.bowman2nd ? 1 : 0,
    bowman1st: values.bowman1st ? 1 : 0,
    masterBowman: values.masterBowman ? 1 : 0,
    grandMasterBowman: values.grandMasterBowman ? 1 : 0,
    eliteMasterBowman: values.eliteMasterBowman ? 1 : 0,
    archer3rdDate: values.archer3rdDate ?? "",
    archer2ndDate: values.archer2ndDate ?? "",
    archer1stDate: values.archer1stDate ?? "",
    bowman3rdDate: values.bowman3rdDate ?? "",
    bowman2ndDate: values.bowman2ndDate ?? "",
    bowman1stDate: values.bowman1stDate ?? "",
    masterBowmanDate: values.masterBowmanDate ?? "",
    grandMasterBowmanDate: values.grandMasterBowmanDate ?? "",
    eliteMasterBowmanDate: values.eliteMasterBowmanDate ?? "",
    award25220: values.award25220 ? 1 : 0,
    award25230: values.award25230 ? 1 : 0,
    award25240: values.award25240 ? 1 : 0,
    award25250: values.award25250 ? 1 : 0,
    award25260: values.award25260 ? 1 : 0,
    award25280: values.award25280 ? 1 : 0,
    award252100: values.award252100 ? 1 : 0,
    award25220SignOffDates: JSON.stringify(values.award25220SignOffDates ?? ["", "", ""]),
    award25230SignOffDates: JSON.stringify(values.award25230SignOffDates ?? ["", "", ""]),
    award25240SignOffDates: JSON.stringify(values.award25240SignOffDates ?? ["", "", ""]),
    award25250SignOffDates: JSON.stringify(values.award25250SignOffDates ?? ["", "", ""]),
    award25260SignOffDates: JSON.stringify(values.award25260SignOffDates ?? ["", "", ""]),
    award25280SignOffDates: JSON.stringify(values.award25280SignOffDates ?? ["", "", ""]),
    award252100SignOffDates: JSON.stringify(values.award252100SignOffDates ?? ["", "", ""]),
    cloutWhite20: values.cloutWhite20 ? 1 : 0,
    cloutWhite30: values.cloutWhite30 ? 1 : 0,
    cloutWhite40: values.cloutWhite40 ? 1 : 0,
    cloutWhite50: values.cloutWhite50 ? 1 : 0,
    cloutWhite60: values.cloutWhite60 ? 1 : 0,
    cloutWhite7080: values.cloutWhite7080 ? 1 : 0,
    cloutWhite90100: values.cloutWhite90100 ? 1 : 0,
    createdAtDate: values.createdAtDate,
    createdAtTime: values.createdAtTime,
    updatedAtDate: values.updatedAtDate ?? null,
    updatedAtTime: values.updatedAtTime ?? null,
    updatedByUsername: values.updatedByUsername ?? null,
  });
}

function updateCommitteeRole(db, values) {
  db.prepare(`
    UPDATE committee_roles
    SET
      assigned_username = ?,
      assigned_user_id = ?,
      responsibilities = ?,
      personal_blurb = ?,
      photo_data_url = NULL
    WHERE role_key = ?
  `).run(
    values.assignedUsername ?? null,
    values.assignedUsername ? getUserId(db, values.assignedUsername) : null,
    values.responsibilities,
    values.personalBlurb,
    values.roleKey,
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

    const now = new Date();
    const today = toUtcDateString(now);
    const currentYear = Number.parseInt(today.slice(0, 4), 10);

    db.transaction(() => {
      db.prepare(`DELETE FROM announcement_seen_members`).run();
      db.prepare(`DELETE FROM announcements`).run();
      db.prepare(`DELETE FROM coaching_session_bookings`).run();
      db.prepare(`DELETE FROM coaching_sessions`).run();
      db.prepare(`DELETE FROM event_bookings`).run();
      db.prepare(`DELETE FROM club_events`).run();
      db.prepare(`DELETE FROM tournament_scores`).run();
      db.prepare(`DELETE FROM tournament_registrations`).run();
      db.prepare(`DELETE FROM tournaments`).run();
      db.prepare(`DELETE FROM lost_arrows`).run();
      db.prepare(`DELETE FROM outdoor_table_entries`).run();
      db.prepare(`DELETE FROM guest_login_events`).run();
      db.prepare(`DELETE FROM login_events`).run();

      db.prepare(`
        UPDATE committee_roles
        SET
          assigned_username = NULL,
          assigned_user_id = NULL,
          responsibilities = summary,
          personal_blurb = '',
          photo_data_url = NULL
      `).run();

      const announcementOneCreated = addUtcDays(now, -3);
      const announcementTwoCreated = addUtcDays(now, -1);
      const announcementThreeCreated = addUtcDays(now, -6);

      const announcementOneId = insertAnnouncement(db, {
        activeFromDate: toUtcDateString(addUtcDays(now, -3)),
        activeTillDate: toUtcDateString(addUtcDays(now, 10)),
        severity: "information",
        message:
          "Demo week is active. Range usage, tournaments, outdoor table progress, and lost-arrow workflows have all been refreshed for showcase testing.",
        escalateSeverity: false,
        createdByUsername: "LTaylor",
        createdAtDate: toUtcDateString(announcementOneCreated),
        createdAtTime: toUtcTimeString(announcementOneCreated),
      });
      const announcementTwoId = insertAnnouncement(db, {
        activeFromDate: toUtcDateString(addUtcDays(now, -1)),
        activeTillDate: toUtcDateString(addUtcDays(now, 4)),
        severity: "urgent",
        message:
          "Saturday outdoor setup starts 45 minutes early. Please check the calendar and tournament bookings before the demo.",
        escalateSeverity: true,
        createdByUsername: "Cfleetham",
        createdAtDate: toUtcDateString(announcementTwoCreated),
        createdAtTime: toUtcTimeString(announcementTwoCreated),
      });
      insertAnnouncement(db, {
        activeFromDate: toUtcDateString(addUtcDays(now, -6)),
        activeTillDate: toUtcDateString(addUtcDays(now, 14)),
        severity: "information",
        message:
          "Committee contacts have been updated with responsibilities and member blurbs for the new org chart cards.",
        escalateSeverity: false,
        createdByUsername: "CLikley",
        createdAtDate: toUtcDateString(announcementThreeCreated),
        createdAtTime: toUtcTimeString(announcementThreeCreated),
      });

      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(
        announcementOneId,
        "Cfleetham",
        toUtcDateString(addUtcDays(now, -2)),
        "09:05:00.000Z",
      );
      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(
        announcementOneId,
        "LTaylor",
        toUtcDateString(addUtcDays(now, -2)),
        "09:20:00.000Z",
      );
      db.prepare(`
        INSERT INTO announcement_seen_members (
          announcement_id,
          username,
          seen_at_date,
          seen_at_time
        )
        VALUES (?, ?, ?, ?)
      `).run(
        announcementTwoId,
        "Cfleetham",
        toUtcDateString(addUtcDays(now, -1)),
        "08:10:00.000Z",
      );

      const clubNightId = insertClubEvent(db, {
        eventDate: toUtcDateString(addUtcDays(now, 1)),
        startTime: "18:00",
        endTime: "20:30",
        title: "Club Night Practice",
        details:
          "General practice evening with open lanes outdoors and indoor fallback if the weather turns.",
        type: "social",
        venue: "outdoor",
        submittedByUsername: "CLikley",
        approvedByUsername: "LTaylor",
        approvedAtDate: toUtcDateString(addUtcDays(now, -5)),
        approvedAtTime: "18:20:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -5)),
        createdAtTime: "18:00:00.000Z",
      });
      const summerShootId = insertClubEvent(db, {
        eventDate: toUtcDateString(addUtcDays(now, 3)),
        startTime: "10:00",
        endTime: "13:30",
        title: "Summer Handicap Shoot",
        details:
          "Outdoor ranking round followed by a handicap ladder and short shoot-off finale.",
        type: "competition",
        venue: "outdoor",
        submittedByUsername: "CLikley",
        approvedByUsername: "LTaylor",
        approvedAtDate: toUtcDateString(addUtcDays(now, -4)),
        approvedAtTime: "18:30:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -4)),
        createdAtTime: "18:00:00.000Z",
      });
      const bbqId = insertClubEvent(db, {
        eventDate: toUtcDateString(addUtcDays(now, 9)),
        startTime: "17:30",
        endTime: "20:30",
        title: "Club BBQ and Awards Evening",
        details:
          "Bring a side dish. Trophy recap starts at 19:00 after open shooting wraps up.",
        type: "social",
        venue: "outdoor",
        submittedByUsername: "Cfleetham",
        approvedByUsername: "LTaylor",
        approvedAtDate: toUtcDateString(addUtcDays(now, -3)),
        approvedAtTime: "19:15:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -3)),
        createdAtTime: "18:45:00.000Z",
      });
      const noviceMorningId = insertClubEvent(db, {
        eventDate: toUtcDateString(addUtcDays(now, 14)),
        startTime: "09:30",
        endTime: "12:00",
        title: "Novice Progress Morning",
        details:
          "Structured scoring rounds, distance confidence checks, and informal feedback for newer members.",
        type: "competition",
        venue: "outdoor",
        submittedByUsername: "Cfleetham",
        approvedByUsername: "LTaylor",
        approvedAtDate: toUtcDateString(addUtcDays(now, -2)),
        approvedAtTime: "20:10:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -2)),
        createdAtTime: "19:50:00.000Z",
      });

      insertEventBooking(db, clubNightId, "Cfleetham", today, "08:05:00.000Z");
      insertEventBooking(db, clubNightId, "tstark", today, "08:12:00.000Z");
      insertEventBooking(db, summerShootId, "RWilliams", today, "08:25:00.000Z");
      insertEventBooking(db, summerShootId, "MMurdock", today, "08:27:00.000Z");
      insertEventBooking(db, bbqId, "PParker", today, "08:40:00.000Z");
      insertEventBooking(db, noviceMorningId, "NOdinson", today, "08:55:00.000Z");

      const sightMarksClinicId = insertCoachingSession(db, {
        coachUsername: "CLikley",
        sessionDate: toUtcDateString(addUtcDays(now, 1)),
        startTime: "18:30",
        endTime: "19:30",
        availableSlots: 4,
        topic: "Outdoor Sight Marks Clinic",
        summary:
          "A practical session on sight mark setup, windy-day adjustments, and scoring confidence.",
        venue: "outdoor",
        approvedByUsername: "LTaylor",
        approvedAtDate: toUtcDateString(addUtcDays(now, -3)),
        approvedAtTime: "18:40:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -3)),
        createdAtTime: "18:05:00.000Z",
      });
      const scoringSessionId = insertCoachingSession(db, {
        coachUsername: "LTaylor",
        sessionDate: toUtcDateString(addUtcDays(now, 6)),
        startTime: "10:30",
        endTime: "11:30",
        availableSlots: 5,
        topic: "Scoring Under Pressure",
        summary:
          "Focused coaching on matchplay routine, timing, and score submission readiness before tournament finals.",
        venue: "indoor",
        approvedByUsername: "Cfleetham",
        approvedAtDate: toUtcDateString(addUtcDays(now, -2)),
        approvedAtTime: "12:05:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -2)),
        createdAtTime: "11:30:00.000Z",
      });

      insertCoachingBooking(db, sightMarksClinicId, "Cfleetham", today, "09:00:00.000Z");
      insertCoachingBooking(db, sightMarksClinicId, "tstark", today, "09:04:00.000Z");
      insertCoachingBooking(db, scoringSessionId, "RWilliams", today, "09:15:00.000Z");
      insertCoachingBooking(db, scoringSessionId, "PParker", today, "09:22:00.000Z");

      const activeRegistrationTournamentId = insertTournament(db, {
        name: "Summer Portsmouth Ladder",
        tournamentType: "portsmouth",
        registrationStartDate: toUtcDateString(addUtcDays(now, -3)),
        registrationEndDate: toUtcDateString(addUtcDays(now, 5)),
        scoreSubmissionStartDate: toUtcDateString(addUtcDays(now, 6)),
        scoreSubmissionEndDate: toUtcDateString(addUtcDays(now, 12)),
        createdBy: "LTaylor",
        createdAtDate: toUtcDateString(addUtcDays(now, -3)),
        createdAtTime: "10:30:00.000Z",
      });
      const activeScoringTournamentId = insertTournament(db, {
        name: "WA 720 Matchplay Weekend",
        tournamentType: "wa720",
        registrationStartDate: toUtcDateString(addUtcDays(now, -21)),
        registrationEndDate: toUtcDateString(addUtcDays(now, -2)),
        scoreSubmissionStartDate: toUtcDateString(addUtcDays(now, -1)),
        scoreSubmissionEndDate: toUtcDateString(addUtcDays(now, 6)),
        createdBy: "Cfleetham",
        createdAtDate: toUtcDateString(addUtcDays(now, -21)),
        createdAtTime: "09:10:00.000Z",
      });
      const concludedTournamentId = insertTournament(db, {
        name: "Spring Head-to-Head Finals",
        tournamentType: "head-to-head",
        registrationStartDate: toUtcDateString(addUtcDays(now, -45)),
        registrationEndDate: toUtcDateString(addUtcDays(now, -27)),
        scoreSubmissionStartDate: toUtcDateString(addUtcDays(now, -26)),
        scoreSubmissionEndDate: toUtcDateString(addUtcDays(now, -19)),
        createdBy: "LTaylor",
        createdAtDate: toUtcDateString(addUtcDays(now, -45)),
        createdAtTime: "18:00:00.000Z",
      });

      for (const [username, time] of [
        ["Cfleetham", "10:31:00.000Z"],
        ["CLikley", "10:33:00.000Z"],
        ["RWilliams", "10:35:00.000Z"],
        ["MMurdock", "10:37:00.000Z"],
        ["PParker", "10:39:00.000Z"],
      ]) {
        insertTournamentRegistration(
          db,
          activeRegistrationTournamentId,
          username,
          toUtcDateString(addUtcDays(now, -2)),
          time,
        );
      }

      for (const [username, time] of [
        ["Cfleetham", "11:00:00.000Z"],
        ["CLikley", "11:02:00.000Z"],
        ["RWilliams", "11:04:00.000Z"],
        ["MMurdock", "11:06:00.000Z"],
      ]) {
        insertTournamentRegistration(
          db,
          activeScoringTournamentId,
          username,
          toUtcDateString(addUtcDays(now, -10)),
          time,
        );
      }

      insertTournamentScore(
        db,
        activeScoringTournamentId,
        1,
        "Cfleetham",
        582,
        today,
        "10:00:00.000Z",
      );
      insertTournamentScore(
        db,
        activeScoringTournamentId,
        1,
        "CLikley",
        571,
        today,
        "10:01:00.000Z",
      );
      insertTournamentScore(
        db,
        activeScoringTournamentId,
        1,
        "RWilliams",
        576,
        today,
        "10:02:00.000Z",
      );
      insertTournamentScore(
        db,
        activeScoringTournamentId,
        1,
        "MMurdock",
        568,
        today,
        "10:03:00.000Z",
      );

      for (const [username, time] of [
        ["LTaylor", "09:30:00.000Z"],
        ["Cfleetham", "09:32:00.000Z"],
        ["CLikley", "09:34:00.000Z"],
        ["RWilliams", "09:36:00.000Z"],
      ]) {
        insertTournamentRegistration(
          db,
          concludedTournamentId,
          username,
          toUtcDateString(addUtcDays(now, -35)),
          time,
        );
      }

      insertTournamentScore(
        db,
        concludedTournamentId,
        1,
        "LTaylor",
        289,
        toUtcDateString(addUtcDays(now, -24)),
        "18:00:00.000Z",
      );
      insertTournamentScore(
        db,
        concludedTournamentId,
        1,
        "Cfleetham",
        279,
        toUtcDateString(addUtcDays(now, -24)),
        "18:02:00.000Z",
      );
      insertTournamentScore(
        db,
        concludedTournamentId,
        1,
        "CLikley",
        284,
        toUtcDateString(addUtcDays(now, -24)),
        "18:04:00.000Z",
      );
      insertTournamentScore(
        db,
        concludedTournamentId,
        1,
        "RWilliams",
        275,
        toUtcDateString(addUtcDays(now, -24)),
        "18:06:00.000Z",
      );
      insertTournamentScore(
        db,
        concludedTournamentId,
        2,
        "LTaylor",
        146,
        toUtcDateString(addUtcDays(now, -23)),
        "19:10:00.000Z",
      );
      insertTournamentScore(
        db,
        concludedTournamentId,
        2,
        "CLikley",
        139,
        toUtcDateString(addUtcDays(now, -23)),
        "19:12:00.000Z",
      );

      const recurringUsageMembers = [
        ["LTaylor", "rfid"],
        ["Cfleetham", "password"],
        ["CLikley", "rfid"],
        ["RWilliams", "rfid"],
        ["MMurdock", "password"],
        ["PParker", "rfid"],
        ["NOdinson", "password"],
        ["TBarnes", "rfid"],
      ];

      for (let daysAgo = 35; daysAgo >= 0; daysAgo -= 1) {
        const eventDate = addUtcDays(now, -daysAgo);
        const weekday = eventDate.getUTCDay();
        const shouldSeedSession = [2, 4, 6].includes(weekday);

        if (!shouldSeedSession) {
          continue;
        }

        const sessionMembers =
          weekday === 6
            ? recurringUsageMembers.slice(0, 6)
            : recurringUsageMembers.slice(0, 4);

        sessionMembers.forEach(([username, method], index) => {
          const loginAt = new Date(Date.UTC(
            eventDate.getUTCFullYear(),
            eventDate.getUTCMonth(),
            eventDate.getUTCDate(),
            weekday === 6 ? 9 : 18,
            weekday === 6 ? 15 + index * 7 : 10 + index * 6,
          ));
          const parts = toUtcTimestampParts(loginAt);
          insertLoginEvent(db, username, method, parts.date, parts.time);
        });
      }

      for (const [username, minutesAgo, method] of [
        ["LTaylor", -30, "rfid"],
        ["Cfleetham", -52, "password"],
        ["CLikley", -74, "rfid"],
        ["RWilliams", -101, "password"],
      ]) {
        const loginAt = addUtcMinutes(now, minutesAgo);
        const parts = toUtcTimestampParts(loginAt);
        insertLoginEvent(db, username, method, parts.date, parts.time);
      }

      insertLostArrow(db, {
        archerUsername: "Cfleetham",
        dateLost: toUtcDateString(addUtcDays(now, -2)),
        arrowMaterial: "carbon",
        arrowColour: "black",
        arrowIdentifier: "CF-03",
        fletchingColour1: "yellow",
        fletchingColour2: "yellow",
        fletchingColour3: "white",
        nockColour: "green",
        targetDistance: "70m",
        laneNumber: 4,
        otherDetails: "Lost during the windy end of the WA 720 practice round.",
        createdAtDate: toUtcDateString(addUtcDays(now, -2)),
        createdAtTime: "19:25:00.000Z",
      });
      insertLostArrow(db, {
        archerUsername: "RWilliams",
        dateLost: toUtcDateString(addUtcDays(now, -5)),
        arrowMaterial: "aluminium",
        arrowColour: "blue",
        arrowIdentifier: "RW-7",
        fletchingColour1: "orange",
        fletchingColour2: "orange",
        fletchingColour3: "white",
        nockColour: "red",
        targetDistance: "50m",
        laneNumber: 6,
        otherDetails: "Possibly buried just short of the boss after a low release.",
        createdAtDate: toUtcDateString(addUtcDays(now, -5)),
        createdAtTime: "18:45:00.000Z",
      });
      insertLostArrow(db, {
        archerUsername: "MMurdock",
        dateLost: toUtcDateString(addUtcDays(now, -9)),
        arrowMaterial: "wood",
        arrowColour: "white",
        arrowIdentifier: "MM-Long-2",
        fletchingColour1: "red",
        fletchingColour2: "red",
        fletchingColour3: "black",
        nockColour: "black",
        targetDistance: "30m",
        laneNumber: 2,
        otherDetails: "Longbow arrow last seen left of the target stand.",
        createdAtDate: toUtcDateString(addUtcDays(now, -9)),
        createdAtTime: "11:05:00.000Z",
      });
      insertLostArrow(db, {
        archerUsername: "PParker",
        dateLost: toUtcDateString(addUtcDays(now, -12)),
        arrowMaterial: "carbon",
        arrowColour: "red",
        arrowIdentifier: "PP-12",
        fletchingColour1: "blue",
        fletchingColour2: "blue",
        fletchingColour3: "yellow",
        nockColour: "blue",
        targetDistance: "60m",
        laneNumber: 5,
        otherDetails: "Found after mowing the overshoot.",
        dateFound: toUtcDateString(addUtcDays(now, -1)),
        foundByUsername: "LTaylor",
        foundSeenAtDate: toUtcDateString(addUtcDays(now, -1)),
        foundSeenAtTime: "17:40:00.000Z",
        createdAtDate: toUtcDateString(addUtcDays(now, -12)),
        createdAtTime: "12:15:00.000Z",
      });

      insertOutdoorTableEntry(db, {
        seasonYear: currentYear,
        archerUsername: "LTaylor",
        bowType: "Recurve",
        handicap: 34,
        archer3rd: true,
        archer2nd: true,
        archer1st: true,
        bowman3rd: true,
        bowman2nd: true,
        bowman1st: true,
        masterBowman: true,
        archer3rdDate: `${currentYear}-04-06`,
        archer2ndDate: `${currentYear}-04-20`,
        archer1stDate: `${currentYear}-05-04`,
        bowman3rdDate: `${currentYear}-05-18`,
        bowman2ndDate: `${currentYear}-06-01`,
        bowman1stDate: `${currentYear}-06-15`,
        masterBowmanDate: `${currentYear}-06-29`,
        award25220: true,
        award25230: true,
        award25240: true,
        award25250: true,
        award25260: true,
        award25280: true,
        award25220SignOffDates: [`${currentYear}-04-02`, `${currentYear}-04-09`, `${currentYear}-04-16`],
        award25230SignOffDates: [`${currentYear}-04-23`, `${currentYear}-04-30`, `${currentYear}-05-07`],
        award25240SignOffDates: [`${currentYear}-05-14`, `${currentYear}-05-21`, `${currentYear}-05-28`],
        award25250SignOffDates: [`${currentYear}-06-04`, `${currentYear}-06-11`, `${currentYear}-06-18`],
        award25260SignOffDates: [`${currentYear}-06-25`, `${currentYear}-07-02`, `${currentYear}-07-09`],
        award25280SignOffDates: [`${currentYear}-07-10`, `${currentYear}-07-17`, ""],
        cloutWhite20: true,
        cloutWhite30: true,
        cloutWhite40: true,
        cloutWhite50: true,
        createdAtDate: today,
        createdAtTime: "08:00:00.000Z",
        updatedAtDate: today,
        updatedAtTime: "08:00:00.000Z",
        updatedByUsername: "LTaylor",
      });
      insertOutdoorTableEntry(db, {
        seasonYear: currentYear,
        archerUsername: "Cfleetham",
        bowType: "Recurve",
        handicap: 47,
        archer3rd: true,
        archer2nd: true,
        archer1st: true,
        bowman3rd: true,
        archer3rdDate: `${currentYear}-04-10`,
        archer2ndDate: `${currentYear}-05-01`,
        archer1stDate: `${currentYear}-05-29`,
        bowman3rdDate: `${currentYear}-06-26`,
        award25220: true,
        award25230: true,
        award25240: true,
        award25250: true,
        award25260: false,
        award25280: false,
        award25220SignOffDates: [`${currentYear}-04-12`, `${currentYear}-04-19`, `${currentYear}-04-26`],
        award25230SignOffDates: [`${currentYear}-05-03`, `${currentYear}-05-10`, `${currentYear}-05-17`],
        award25240SignOffDates: [`${currentYear}-05-24`, `${currentYear}-05-31`, `${currentYear}-06-07`],
        award25250SignOffDates: [`${currentYear}-06-14`, `${currentYear}-06-21`, `${currentYear}-06-28`],
        award25260SignOffDates: [`${currentYear}-07-05`, "", ""],
        cloutWhite20: true,
        cloutWhite30: true,
        createdAtDate: today,
        createdAtTime: "08:05:00.000Z",
        updatedAtDate: today,
        updatedAtTime: "08:05:00.000Z",
        updatedByUsername: "LTaylor",
      });
      insertOutdoorTableEntry(db, {
        seasonYear: currentYear,
        archerUsername: "CLikley",
        bowType: "Recurve",
        handicap: 51,
        archer3rd: true,
        archer2nd: true,
        bowman3rd: true,
        archer3rdDate: `${currentYear}-04-14`,
        archer2ndDate: `${currentYear}-05-12`,
        bowman3rdDate: `${currentYear}-06-23`,
        award25220: true,
        award25230: true,
        award25240: true,
        award25220SignOffDates: [`${currentYear}-04-15`, `${currentYear}-04-22`, `${currentYear}-04-29`],
        award25230SignOffDates: [`${currentYear}-05-06`, `${currentYear}-05-13`, `${currentYear}-05-20`],
        award25240SignOffDates: [`${currentYear}-05-27`, `${currentYear}-06-03`, `${currentYear}-06-10`],
        award25250SignOffDates: [`${currentYear}-06-17`, `${currentYear}-06-24`, ""],
        cloutWhite20: true,
        cloutWhite30: true,
        createdAtDate: today,
        createdAtTime: "08:10:00.000Z",
        updatedAtDate: today,
        updatedAtTime: "08:10:00.000Z",
        updatedByUsername: "LTaylor",
      });
      insertOutdoorTableEntry(db, {
        seasonYear: currentYear,
        archerUsername: "RWilliams",
        bowType: "Compound",
        handicap: 39,
        archer3rd: true,
        archer2nd: true,
        archer1st: true,
        bowman3rd: true,
        bowman2nd: true,
        archer3rdDate: `${currentYear}-04-08`,
        archer2ndDate: `${currentYear}-04-29`,
        archer1stDate: `${currentYear}-05-20`,
        bowman3rdDate: `${currentYear}-06-10`,
        bowman2ndDate: `${currentYear}-07-01`,
        award25220: true,
        award25230: true,
        award25240: true,
        award25250: true,
        award25260: true,
        award25220SignOffDates: [`${currentYear}-04-09`, `${currentYear}-04-16`, `${currentYear}-04-23`],
        award25230SignOffDates: [`${currentYear}-04-30`, `${currentYear}-05-07`, `${currentYear}-05-14`],
        award25240SignOffDates: [`${currentYear}-05-21`, `${currentYear}-05-28`, `${currentYear}-06-04`],
        award25250SignOffDates: [`${currentYear}-06-11`, `${currentYear}-06-18`, `${currentYear}-06-25`],
        award25260SignOffDates: [`${currentYear}-07-02`, `${currentYear}-07-09`, `${currentYear}-07-16`],
        cloutWhite20: true,
        cloutWhite30: true,
        cloutWhite40: true,
        createdAtDate: today,
        createdAtTime: "08:15:00.000Z",
        updatedAtDate: today,
        updatedAtTime: "08:15:00.000Z",
        updatedByUsername: "LTaylor",
      });
      insertOutdoorTableEntry(db, {
        seasonYear: currentYear,
        archerUsername: "NOdinson",
        bowType: "Longbow",
        handicap: 61,
        archer3rd: true,
        award25220: true,
        archer3rdDate: `${currentYear}-05-18`,
        award25220SignOffDates: [`${currentYear}-05-22`, `${currentYear}-05-29`, `${currentYear}-06-05`],
        cloutWhite20: true,
        createdAtDate: today,
        createdAtTime: "08:20:00.000Z",
        updatedAtDate: today,
        updatedAtTime: "08:20:00.000Z",
        updatedByUsername: "LTaylor",
      });

      updateCommitteeRole(db, {
        roleKey: "chairman",
        assignedUsername: "LTaylor",
        responsibilities:
          "Leads the committee, chairs meetings, coordinates seasonal priorities, and provides the final sign-off on club-wide operational decisions.",
        personalBlurb:
          "Les keeps the club moving by balancing competition planning, committee decisions, and member-facing communication during busy summer periods.",
      });
      updateCommitteeRole(db, {
        roleKey: "secretary",
        assignedUsername: "Cfleetham",
        responsibilities:
          "Maintains meeting records, circulates updates, tracks action points, and keeps committee information aligned across the portal.",
        personalBlurb:
          "Craig focuses on turning committee decisions into visible updates across the system, helping members see what has changed and why.",
      });
      updateCommitteeRole(db, {
        roleKey: "treasurer",
        assignedUsername: "MMurdock",
        responsibilities:
          "Oversees finance reporting, monitors renewal periods, and helps the committee plan spending around equipment and range activity.",
        personalBlurb:
          "Matt brings a steady eye to budgets and renewal timing so the club can plan responsibly without losing momentum on improvements.",
      });
      updateCommitteeRole(db, {
        roleKey: "records-officer",
        assignedUsername: "RWilliams",
        responsibilities:
          "Maintains records, outdoor table accuracy, classification progress, and score-related follow-up after shoots and competitions.",
        personalBlurb:
          "Riri helps members keep track of performance progress and makes sure the club's achievements stay visible and up to date.",
      });
      updateCommitteeRole(db, {
        roleKey: "tournament-officer",
        assignedUsername: "CLikley",
        responsibilities:
          "Coordinates tournament calendars, competitor lists, registration windows, and matchplay logistics for demo and live events.",
        personalBlurb:
          "Chris is the main point of contact for tournament activity and keeps the competition experience organised from sign-up through to results.",
      });
      updateCommitteeRole(db, {
        roleKey: "equipment-officer",
        assignedUsername: "TBarnes",
        responsibilities:
          "Oversees issue and return workflows, monitors cupboard organisation, and helps the club keep equipment ready for busy sessions.",
        personalBlurb:
          "Bucky focuses on practical readiness so members can get on the shooting line quickly with the right kit in the right place.",
      });
      updateCommitteeRole(db, {
        roleKey: "coaching-representative",
        assignedUsername: "CLikley",
        responsibilities:
          "Represents coaching needs, links member development with session planning, and supports practical progression opportunities.",
        personalBlurb:
          "Chris also acts as a bridge between competition goals and day-to-day coaching, helping newer archers progress with confidence.",
      });
      updateCommitteeRole(db, {
        roleKey: "membership-secretary",
        assignedUsername: "PParker",
        responsibilities:
          "Tracks member records, supports renewals, and helps keep profile data and club access details accurate.",
        personalBlurb:
          "Peter helps keep member information tidy and approachable, making admin follow-up feel lighter for the rest of the club.",
      });
    })();

    const summaryTables = [
      "announcements",
      "club_events",
      "event_bookings",
      "coaching_sessions",
      "coaching_session_bookings",
      "tournaments",
      "tournament_registrations",
      "tournament_scores",
      "login_events",
      "lost_arrows",
      "outdoor_table_entries",
      "committee_roles",
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
