import { createDatabase } from "../server/infrastructure/persistence/createDatabase.js";
import { serverRuntime } from "../server/config/runtime.js";

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

async function getUserId(client, username) {
  const result = await client.query(
    `SELECT id FROM users WHERE username = $1`,
    [username],
  );

  if (!result.rows[0]?.id) {
    throw new Error(`Unable to find user '${username}' in the runtime database.`);
  }

  return Number(result.rows[0].id);
}

async function insertAnnouncement(client, values) {
  const result = await client.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      values.activeFromDate,
      values.activeTillDate,
      values.severity,
      values.message,
      values.escalateSeverity ? 1 : 0,
      values.createdByUsername,
      values.createdAtDate,
      values.createdAtTime,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertAnnouncementSeen(client, announcementId, username, date, time) {
  await client.query(
    `
      INSERT INTO announcement_seen_members (
        announcement_id,
        username,
        seen_at_date,
        seen_at_time
      )
      VALUES ($1, $2, $3, $4)
    `,
    [announcementId, username, date, time],
  );
}

async function insertClubEvent(client, values) {
  const submittedByUserId = await getUserId(client, values.submittedByUsername);
  const approvedByUserId = await getUserId(client, values.approvedByUsername);
  const result = await client.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [
      values.eventDate,
      values.startTime,
      values.endTime,
      values.title,
      values.details,
      values.type,
      values.venue,
      values.submittedByUsername,
      values.approvedByUsername,
      values.approvedAtDate,
      values.approvedAtTime,
      values.createdAtDate,
      values.createdAtTime,
      submittedByUserId,
      approvedByUserId,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertEventBooking(client, eventId, username, bookedAtDate, bookedAtTime) {
  await client.query(
    `
      INSERT INTO event_bookings (
        club_event_id,
        member_username,
        booked_at_date,
        booked_at_time,
        member_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [eventId, username, bookedAtDate, bookedAtTime, await getUserId(client, username)],
  );
}

async function insertCoachingSession(client, values) {
  const coachUserId = await getUserId(client, values.coachUsername);
  const approvedByUserId = await getUserId(client, values.approvedByUsername);
  const result = await client.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `,
    [
      values.coachUsername,
      values.sessionDate,
      values.startTime,
      values.endTime,
      values.availableSlots,
      values.topic,
      values.summary,
      values.venue,
      values.approvedByUsername,
      values.approvedAtDate,
      values.approvedAtTime,
      values.createdAtDate,
      values.createdAtTime,
      coachUserId,
      approvedByUserId,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertCoachingBooking(
  client,
  coachingSessionId,
  username,
  bookedAtDate,
  bookedAtTime,
) {
  await client.query(
    `
      INSERT INTO coaching_session_bookings (
        coaching_session_id,
        member_username,
        booked_at_date,
        booked_at_time,
        member_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      coachingSessionId,
      username,
      bookedAtDate,
      bookedAtTime,
      await getUserId(client, username),
    ],
  );
}

async function insertTournament(client, values) {
  const createdByUserId = await getUserId(client, values.createdBy);
  const result = await client.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [
      values.name,
      values.tournamentType,
      values.registrationStartDate,
      values.registrationEndDate,
      values.scoreSubmissionStartDate,
      values.scoreSubmissionEndDate,
      values.createdBy,
      values.createdAtDate,
      values.createdAtTime,
      createdByUserId,
    ],
  );

  return Number(result.rows[0].id);
}

async function insertTournamentRegistration(
  client,
  tournamentId,
  username,
  registeredAtDate,
  registeredAtTime,
) {
  await client.query(
    `
      INSERT INTO tournament_registrations (
        tournament_id,
        member_username,
        registered_at_date,
        registered_at_time,
        member_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      tournamentId,
      username,
      registeredAtDate,
      registeredAtTime,
      await getUserId(client, username),
    ],
  );
}

async function insertTournamentScore(
  client,
  tournamentId,
  roundNumber,
  username,
  score,
  submittedAtDate,
  submittedAtTime,
) {
  await client.query(
    `
      INSERT INTO tournament_scores (
        tournament_id,
        round_number,
        member_username,
        score,
        submitted_at_date,
        submitted_at_time,
        member_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      tournamentId,
      roundNumber,
      username,
      score,
      submittedAtDate,
      submittedAtTime,
      await getUserId(client, username),
    ],
  );
}

async function insertLoginEvent(client, username, method, date, time) {
  await client.query(
    `
      INSERT INTO login_events (
        username,
        login_method,
        logged_in_date,
        logged_in_time,
        user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [username, method, date, time, await getUserId(client, username)],
  );
}

async function insertLostArrow(client, values) {
  await client.query(
    `
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `,
    [
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
    ],
  );
}

async function insertOutdoorTableEntry(client, values) {
  await client.query(
    `
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
        $45, $46, $47, $48
      )
    `,
    [
      values.seasonYear,
      values.archerUsername,
      values.bowType,
      values.handicap ?? null,
      values.archer3rd ? 1 : 0,
      values.archer2nd ? 1 : 0,
      values.archer1st ? 1 : 0,
      values.bowman3rd ? 1 : 0,
      values.bowman2nd ? 1 : 0,
      values.bowman1st ? 1 : 0,
      values.masterBowman ? 1 : 0,
      values.grandMasterBowman ? 1 : 0,
      values.eliteMasterBowman ? 1 : 0,
      values.archer3rdDate ?? "",
      values.archer2ndDate ?? "",
      values.archer1stDate ?? "",
      values.bowman3rdDate ?? "",
      values.bowman2ndDate ?? "",
      values.bowman1stDate ?? "",
      values.masterBowmanDate ?? "",
      values.grandMasterBowmanDate ?? "",
      values.eliteMasterBowmanDate ?? "",
      values.award25220 ? 1 : 0,
      values.award25230 ? 1 : 0,
      values.award25240 ? 1 : 0,
      values.award25250 ? 1 : 0,
      values.award25260 ? 1 : 0,
      values.award25280 ? 1 : 0,
      values.award252100 ? 1 : 0,
      JSON.stringify(values.award25220SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award25230SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award25240SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award25250SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award25260SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award25280SignOffDates ?? ["", "", ""]),
      JSON.stringify(values.award252100SignOffDates ?? ["", "", ""]),
      values.cloutWhite20 ? 1 : 0,
      values.cloutWhite30 ? 1 : 0,
      values.cloutWhite40 ? 1 : 0,
      values.cloutWhite50 ? 1 : 0,
      values.cloutWhite60 ? 1 : 0,
      values.cloutWhite7080 ? 1 : 0,
      values.cloutWhite90100 ? 1 : 0,
      values.createdAtDate,
      values.createdAtTime,
      values.updatedAtDate ?? null,
      values.updatedAtTime ?? null,
      values.updatedByUsername ?? null,
    ],
  );
}

async function updateCommitteeRole(client, values) {
  await client.query(
    `
      UPDATE committee_roles
      SET
        assigned_username = $1,
        assigned_user_id = $2,
        responsibilities = $3,
        personal_blurb = $4,
        photo_data_url = NULL
      WHERE role_key = $5
    `,
    [
      values.assignedUsername ?? null,
      values.assignedUsername ? await getUserId(client, values.assignedUsername) : null,
      values.responsibilities,
      values.personalBlurb,
      values.roleKey,
    ],
  );
}

async function deleteExistingShowcaseData(client) {
  await client.query(`DELETE FROM announcement_seen_members`);
  await client.query(`DELETE FROM announcements`);
  await client.query(`DELETE FROM coaching_session_bookings`);
  await client.query(`DELETE FROM coaching_sessions`);
  await client.query(`DELETE FROM event_bookings`);
  await client.query(`DELETE FROM club_events`);
  await client.query(`DELETE FROM tournament_scores`);
  await client.query(`DELETE FROM tournament_registrations`);
  await client.query(`DELETE FROM tournaments`);
  await client.query(`DELETE FROM lost_arrows`);
  await client.query(`DELETE FROM outdoor_table_entries`);
  await client.query(`DELETE FROM guest_login_events`);
  await client.query(`DELETE FROM login_events`);
  await client.query(`
    UPDATE committee_roles
    SET
      assigned_username = NULL,
      assigned_user_id = NULL,
      responsibilities = summary,
      personal_blurb = '',
      photo_data_url = NULL
  `);
}

async function seedShowcaseData(client) {
  const now = new Date();
  const today = toUtcDateString(now);
  const currentYear = Number.parseInt(today.slice(0, 4), 10);

  const announcementOneId = await insertAnnouncement(client, {
    activeFromDate: toUtcDateString(addUtcDays(now, -3)),
    activeTillDate: toUtcDateString(addUtcDays(now, 10)),
    severity: "information",
    message:
      "Demo week is active. Range usage, tournaments, outdoor table progress, and lost-arrow workflows have all been refreshed for showcase testing.",
    escalateSeverity: false,
    createdByUsername: "LTaylor",
    createdAtDate: toUtcDateString(addUtcDays(now, -3)),
    createdAtTime: "08:15:00.000Z",
  });
  const announcementTwoId = await insertAnnouncement(client, {
    activeFromDate: toUtcDateString(addUtcDays(now, -1)),
    activeTillDate: toUtcDateString(addUtcDays(now, 4)),
    severity: "urgent",
    message:
      "Saturday outdoor setup starts 45 minutes early. Please check the calendar and tournament bookings before the demo.",
    escalateSeverity: true,
    createdByUsername: "Cfleetham",
    createdAtDate: toUtcDateString(addUtcDays(now, -1)),
    createdAtTime: "07:45:00.000Z",
  });
  await insertAnnouncement(client, {
    activeFromDate: toUtcDateString(addUtcDays(now, -6)),
    activeTillDate: toUtcDateString(addUtcDays(now, 14)),
    severity: "information",
    message:
      "Committee contacts have been updated with responsibilities and member blurbs for the new org chart cards.",
    escalateSeverity: false,
    createdByUsername: "CLikley",
    createdAtDate: toUtcDateString(addUtcDays(now, -6)),
    createdAtTime: "11:20:00.000Z",
  });

  await insertAnnouncementSeen(
    client,
    announcementOneId,
    "Cfleetham",
    toUtcDateString(addUtcDays(now, -2)),
    "09:05:00.000Z",
  );
  await insertAnnouncementSeen(
    client,
    announcementOneId,
    "LTaylor",
    toUtcDateString(addUtcDays(now, -2)),
    "09:20:00.000Z",
  );
  await insertAnnouncementSeen(
    client,
    announcementTwoId,
    "Cfleetham",
    toUtcDateString(addUtcDays(now, -1)),
    "08:10:00.000Z",
  );

  const clubNightId = await insertClubEvent(client, {
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
  const summerShootId = await insertClubEvent(client, {
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
  const bbqId = await insertClubEvent(client, {
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
  const noviceMorningId = await insertClubEvent(client, {
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

  await insertEventBooking(client, clubNightId, "Cfleetham", today, "08:05:00.000Z");
  await insertEventBooking(client, clubNightId, "tstark", today, "08:12:00.000Z");
  await insertEventBooking(client, summerShootId, "RWilliams", today, "08:25:00.000Z");
  await insertEventBooking(client, summerShootId, "MMurdock", today, "08:27:00.000Z");
  await insertEventBooking(client, bbqId, "PParker", today, "08:40:00.000Z");
  await insertEventBooking(client, noviceMorningId, "NOdinson", today, "08:55:00.000Z");

  const sightMarksClinicId = await insertCoachingSession(client, {
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
  const scoringSessionId = await insertCoachingSession(client, {
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

  await insertCoachingBooking(client, sightMarksClinicId, "Cfleetham", today, "09:00:00.000Z");
  await insertCoachingBooking(client, sightMarksClinicId, "tstark", today, "09:04:00.000Z");
  await insertCoachingBooking(client, scoringSessionId, "RWilliams", today, "09:15:00.000Z");
  await insertCoachingBooking(client, scoringSessionId, "PParker", today, "09:22:00.000Z");

  const activeRegistrationTournamentId = await insertTournament(client, {
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
  const activeScoringTournamentId = await insertTournament(client, {
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
  const concludedTournamentId = await insertTournament(client, {
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
    await insertTournamentRegistration(
      client,
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
    await insertTournamentRegistration(
      client,
      activeScoringTournamentId,
      username,
      toUtcDateString(addUtcDays(now, -10)),
      time,
    );
  }

  for (const [username, score, time] of [
    ["Cfleetham", 582, "10:00:00.000Z"],
    ["CLikley", 571, "10:01:00.000Z"],
    ["RWilliams", 576, "10:02:00.000Z"],
    ["MMurdock", 568, "10:03:00.000Z"],
  ]) {
    await insertTournamentScore(
      client,
      activeScoringTournamentId,
      1,
      username,
      score,
      today,
      time,
    );
  }

  for (const [username, time] of [
    ["LTaylor", "09:30:00.000Z"],
    ["Cfleetham", "09:32:00.000Z"],
    ["CLikley", "09:34:00.000Z"],
    ["RWilliams", "09:36:00.000Z"],
  ]) {
    await insertTournamentRegistration(
      client,
      concludedTournamentId,
      username,
      toUtcDateString(addUtcDays(now, -35)),
      time,
    );
  }

  for (const [roundNumber, username, score, date, time] of [
    [1, "LTaylor", 289, toUtcDateString(addUtcDays(now, -24)), "18:00:00.000Z"],
    [1, "Cfleetham", 279, toUtcDateString(addUtcDays(now, -24)), "18:02:00.000Z"],
    [1, "CLikley", 284, toUtcDateString(addUtcDays(now, -24)), "18:04:00.000Z"],
    [1, "RWilliams", 275, toUtcDateString(addUtcDays(now, -24)), "18:06:00.000Z"],
    [2, "LTaylor", 146, toUtcDateString(addUtcDays(now, -23)), "19:10:00.000Z"],
    [2, "CLikley", 139, toUtcDateString(addUtcDays(now, -23)), "19:12:00.000Z"],
  ]) {
    await insertTournamentScore(
      client,
      concludedTournamentId,
      roundNumber,
      username,
      score,
      date,
      time,
    );
  }

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
    if (![2, 4, 6].includes(weekday)) {
      continue;
    }

    const sessionMembers =
      weekday === 6
        ? recurringUsageMembers.slice(0, 6)
        : recurringUsageMembers.slice(0, 4);

    for (const [index, [username, method]] of sessionMembers.entries()) {
      const loginAt = new Date(Date.UTC(
        eventDate.getUTCFullYear(),
        eventDate.getUTCMonth(),
        eventDate.getUTCDate(),
        weekday === 6 ? 9 : 18,
        weekday === 6 ? 15 + index * 7 : 10 + index * 6,
      ));
      const parts = toUtcTimestampParts(loginAt);
      await insertLoginEvent(client, username, method, parts.date, parts.time);
    }
  }

  for (const [username, minutesAgo, method] of [
    ["LTaylor", -30, "rfid"],
    ["Cfleetham", -52, "password"],
    ["CLikley", -74, "rfid"],
    ["RWilliams", -101, "password"],
  ]) {
    const loginAt = addUtcMinutes(now, minutesAgo);
    const parts = toUtcTimestampParts(loginAt);
    await insertLoginEvent(client, username, method, parts.date, parts.time);
  }

  await insertLostArrow(client, {
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
  await insertLostArrow(client, {
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
  await insertLostArrow(client, {
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
  await insertLostArrow(client, {
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

  for (const entry of [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ]) {
    await insertOutdoorTableEntry(client, entry);
  }

  for (const role of [
    {
      roleKey: "chairman",
      assignedUsername: "LTaylor",
      responsibilities:
        "Leads the committee, chairs meetings, coordinates seasonal priorities, and provides the final sign-off on club-wide operational decisions.",
      personalBlurb:
        "Les keeps the club moving by balancing competition planning, committee decisions, and member-facing communication during busy summer periods.",
    },
    {
      roleKey: "secretary",
      assignedUsername: "Cfleetham",
      responsibilities:
        "Maintains meeting records, circulates updates, tracks action points, and keeps committee information aligned across the portal.",
      personalBlurb:
        "Craig focuses on turning committee decisions into visible updates across the system, helping members see what has changed and why.",
    },
    {
      roleKey: "treasurer",
      assignedUsername: "MMurdock",
      responsibilities:
        "Oversees finance reporting, monitors renewal periods, and helps the committee plan spending around equipment and range activity.",
      personalBlurb:
        "Matt brings a steady eye to budgets and renewal timing so the club can plan responsibly without losing momentum on improvements.",
    },
    {
      roleKey: "membership-secretary",
      assignedUsername: "PParker",
      responsibilities:
        "Tracks member records, supports renewals, and helps keep profile data and club access details accurate.",
      personalBlurb:
        "Peter helps keep member information tidy and approachable, making admin follow-up feel lighter for the rest of the club.",
    },
    {
      roleKey: "records-officer",
      assignedUsername: "RWilliams",
      responsibilities:
        "Maintains records, outdoor table accuracy, classification progress, and score-related follow-up after shoots and competitions.",
      personalBlurb:
        "Riri helps members keep track of performance progress and makes sure the club's achievements stay visible and up to date.",
    },
    {
      roleKey: "tournament-officer",
      assignedUsername: "CLikley",
      responsibilities:
        "Coordinates tournament calendars, competitor lists, registration windows, and matchplay logistics for demo and live events.",
      personalBlurb:
        "Chris is the main point of contact for tournament activity and keeps the competition experience organised from sign-up through to results.",
    },
    {
      roleKey: "equipment-officer",
      assignedUsername: "TBarnes",
      responsibilities:
        "Oversees issue and return workflows, monitors cupboard organisation, and helps the club keep equipment ready for busy sessions.",
      personalBlurb:
        "Bucky focuses on practical readiness so members can get on the shooting line quickly with the right kit in the right place.",
    },
    {
      roleKey: "coaching-representative",
      assignedUsername: "CLikley",
      responsibilities:
        "Represents coaching needs, links member development with session planning, and supports practical progression opportunities.",
      personalBlurb:
        "Chris also acts as a bridge between competition goals and day-to-day coaching, helping newer archers progress with confidence.",
    },
  ]) {
    await updateCommitteeRole(client, role);
  }
}

async function summarizeTables(client) {
  const tables = [
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

  for (const table of tables) {
    const result = await client.query(`SELECT COUNT(*) AS count FROM ${table}`);
    console.log(`${table}: ${result.rows[0].count}`);
  }
}

async function main() {
  if (serverRuntime.databaseEngine !== "postgres") {
    throw new Error(
      "seed:runtime-showcase is intended for PostgreSQL/Cloud SQL. For local SQLite demo data, use npm run seed:live-showcase.",
    );
  }

  const db = createDatabase(serverRuntime);
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    try {
      await deleteExistingShowcaseData(client);
      await seedShowcaseData(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log("Runtime showcase data seeded successfully.");
    await summarizeTables(client);
  } finally {
    client.release();
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
