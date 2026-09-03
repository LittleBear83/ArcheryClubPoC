function normalizeCountRow(row) {
  return {
    count: Number(row?.count ?? 0),
  };
}

function normalizeRowsWithCount(rows) {
  return rows.map((row) => ({
    ...row,
    count: Number(row.count ?? 0),
    dayOfWeek:
      row.dayOfWeek === undefined ? row.day_of_week : Number(row.dayOfWeek ?? row.day_of_week ?? 0),
    hour: row.hour === undefined ? undefined : Number(row.hour),
  }));
}

function normalizeUserRows(rows) {
  return rows.map((row) => ({
    ...row,
    active_member: Number(row.active_member ?? 0),
    junior_member: Number(row.junior_member ?? 0),
  }));
}

function normalizeReportingMemberRows(rows) {
  return rows.map((row) => ({
    ...row,
    membership_status: row.membership_status ?? "member",
    programme_type: row.programme_type ?? "none",
    user_type: row.user_type ?? "",
  }));
}

function normalizeMemberJourneyRows(rows) {
  return rows.map((row) => ({
    ...row,
    origin_course_type: row.origin_course_type ?? "beginners",
    current_course_type: row.current_course_type ?? "beginners",
    membership_status: row.membership_status ?? "member",
    programme_type: row.programme_type ?? "none",
    user_type: row.user_type ?? "",
    converted_to_member: Number(row.converted_to_member ?? 0),
  }));
}

const POSTGRES_MEMBER_PRESENCE_EVENTS_CTE = `
  WITH RECURSIVE ordered_member_presence_events AS (
    SELECT
      username,
      logged_in_date,
      logged_in_time,
      (logged_in_date::text || 'T' || logged_in_time::text) AS logged_in_at,
      ROW_NUMBER() OVER (
        PARTITION BY username
        ORDER BY logged_in_date, logged_in_time
      ) AS sequence_number
    FROM login_events
    WHERE login_method IN ('rfid', 'mobile-app')
      AND (logged_in_date::text || 'T' || logged_in_time::text) < $1
  ),
  member_presence_sessions AS (
    SELECT
      username,
      logged_in_date,
      logged_in_time,
      logged_in_at,
      sequence_number,
      logged_in_at AS session_started_at
    FROM ordered_member_presence_events
    WHERE sequence_number = 1

    UNION ALL

    SELECT
      current_event.username,
      current_event.logged_in_date,
      current_event.logged_in_time,
      current_event.logged_in_at,
      current_event.sequence_number,
      CASE
        WHEN current_event.logged_in_at::timestamp >
          previous_session.session_started_at::timestamp + INTERVAL '2 hours'
          THEN current_event.logged_in_at
        ELSE previous_session.session_started_at
      END AS session_started_at
    FROM ordered_member_presence_events AS current_event
    INNER JOIN member_presence_sessions AS previous_session
      ON previous_session.username = current_event.username
     AND previous_session.sequence_number = current_event.sequence_number - 1
  ),
  member_presence_visit_starts AS (
    SELECT
      username,
      MIN(logged_in_date) AS logged_in_date,
      MIN(logged_in_time) AS logged_in_time,
      session_started_at AS logged_in_at
    FROM member_presence_sessions
    GROUP BY username, session_started_at
  )
`;

function createSqliteActivityReportingGateway({
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findLatestRangeMembers,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
  listMemberJourneyParticipants,
  listReportingGuestLogins,
  listReportingMemberLogins,
  memberLoginsByDateForUserInRange,
  memberLoginsByDateInRange,
  memberLoginsByHourForUserInRange,
  memberLoginsByHourInRange,
  memberLoginsByWeekdayForUserInRange,
  memberLoginsByWeekdayInRange,
}) {
  return {
    async countGuestLoginsInRange(startIso, endIsoExclusive) {
      return normalizeCountRow(countGuestLoginsInRange.get(startIso, endIsoExclusive));
    },
    async countMemberLoginsForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeCountRow(
        countMemberLoginsForUserInRange.get(endIsoExclusive, username, startIso),
      );
    },
    async countMemberLoginsInRange(startIso, endIsoExclusive) {
      return normalizeCountRow(countMemberLoginsInRange.get(endIsoExclusive, startIso));
    },
    async findMemberCoachingBookingsByUserId(userId) {
      return findMemberCoachingBookingsByUserId.all(userId);
    },
    async findMemberEventBookingsByUserId(userId) {
      return findMemberEventBookingsByUserId.all(userId);
    },
    async findLatestRangeMembers() {
      return normalizeUserRows(findLatestRangeMembers.all());
    },
    async findRecentGuestLogins(cutoff) {
      return findRecentGuestLogins.all(cutoff);
    },
    async findRecentRangeMembers(cutoff) {
      return normalizeUserRows(findRecentRangeMembers.all(cutoff));
    },
    async guestLoginsByDateInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(guestLoginsByDateInRange.all(startIso, endIsoExclusive));
    },
    async guestLoginsByHourInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(guestLoginsByHourInRange.all(startIso, endIsoExclusive));
    },
    async guestLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(guestLoginsByWeekdayInRange.all(startIso, endIsoExclusive));
    },
    async listAllUserDisciplines() {
      return listAllUserDisciplines.all();
    },
    async listMemberJourneyParticipants(startDate, endDate) {
      return normalizeMemberJourneyRows(
        listMemberJourneyParticipants.all(startDate, endDate),
      );
    },
    async listReportingGuestLogins(startIso, endIsoExclusive) {
      return listReportingGuestLogins.all(startIso, endIsoExclusive);
    },
    async listReportingMemberLogins(startIso, endIsoExclusive) {
      return normalizeReportingMemberRows(
        listReportingMemberLogins.all(startIso, endIsoExclusive),
      );
    },
    async memberLoginsByDateForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByDateForUserInRange.all(endIsoExclusive, username, startIso),
      );
    },
    async memberLoginsByDateInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByDateInRange.all(endIsoExclusive, startIso));
    },
    async memberLoginsByHourForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByHourForUserInRange.all(endIsoExclusive, username, startIso),
      );
    },
    async memberLoginsByHourInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByHourInRange.all(endIsoExclusive, startIso));
    },
    async memberLoginsByWeekdayForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByWeekdayForUserInRange.all(endIsoExclusive, username, startIso),
      );
    },
    async memberLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByWeekdayInRange.all(endIsoExclusive, startIso));
    },
  };
}

function createPostgresActivityReportingGateway({ pool }) {
  return {
    async countGuestLoginsInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT COUNT(*) AS count FROM guest_login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2`,
        [startIso, endIsoExclusive],
      );
      return normalizeCountRow(result.rows[0]);
    },
    async countMemberLoginsForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE username = $2
           AND logged_in_at >= $3`,
        [endIsoExclusive, username, startIso],
      );
      return normalizeCountRow(result.rows[0]);
    },
    async countMemberLoginsInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE logged_in_at >= $2`,
        [endIsoExclusive, startIso],
      );
      return normalizeCountRow(result.rows[0]);
    },
    async findMemberCoachingBookingsByUserId(userId) {
      const result = await pool.query(
        `SELECT
          coaching_sessions.id,
          coaching_sessions.session_date,
          coaching_sessions.start_time,
          coaching_sessions.end_time,
          coaching_sessions.topic,
          coaching_sessions.summary,
          coaching_sessions.venue,
          coach.first_name AS coach_first_name,
          coach.surname AS coach_surname
        FROM coaching_session_bookings
        INNER JOIN coaching_sessions
          ON coaching_sessions.id = coaching_session_bookings.coaching_session_id
        INNER JOIN users AS coach
          ON coach.id = coaching_sessions.coach_user_id
        WHERE coaching_session_bookings.member_user_id = $1
        ORDER BY coaching_sessions.session_date ASC, coaching_sessions.start_time ASC`,
        [userId],
      );
      return result.rows;
    },
    async findMemberEventBookingsByUserId(userId) {
      const result = await pool.query(
        `SELECT
          club_events.id,
          club_events.event_date,
          club_events.start_time,
          club_events.end_time,
          club_events.title,
          club_events.type
        FROM event_bookings
        INNER JOIN club_events
          ON club_events.id = event_bookings.club_event_id
        WHERE event_bookings.member_user_id = $1
        ORDER BY club_events.event_date ASC, club_events.start_time ASC`,
        [userId],
      );
      return result.rows;
    },
    async findLatestRangeMembers() {
      const result = await pool.query(
        `SELECT
          users.username,
          users.first_name,
          users.surname,
          users.rfid_tag,
          users.active_member,
          users.junior_member,
          users.membership_fees_due,
          user_types.user_type,
          MAX(login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) AS last_logged_in_at
        FROM login_events
        INNER JOIN users ON users.id = login_events.user_id
        INNER JOIN user_types ON user_types.user_id = users.id
        WHERE login_events.login_method IN ('rfid', 'mobile-app')
        GROUP BY users.id, users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.junior_member, users.membership_fees_due, user_types.user_type
        ORDER BY users.surname ASC, users.first_name ASC`,
      );
      return normalizeUserRows(result.rows);
    },
    async findRecentGuestLogins(cutoff) {
      const result = await pool.query(
        `SELECT
          first_name,
          surname,
          archery_gb_membership_number,
          invited_by_username,
          invited_by_name,
          MAX(logged_in_date::text || 'T' || logged_in_time::text) AS last_logged_in_at
        FROM guest_login_events
        WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
        GROUP BY first_name, surname, archery_gb_membership_number, invited_by_username, invited_by_name
        ORDER BY surname ASC, first_name ASC`,
        [cutoff],
      );
      return result.rows;
    },
    async findRecentRangeMembers(cutoff) {
      const result = await pool.query(
        `SELECT
          users.username,
          users.first_name,
          users.surname,
          users.rfid_tag,
          users.active_member,
          users.junior_member,
          users.membership_fees_due,
          user_types.user_type,
          MAX(login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) AS last_logged_in_at
        FROM login_events
        INNER JOIN users ON users.id = login_events.user_id
        INNER JOIN user_types ON user_types.user_id = users.id
        WHERE (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) >= $1
          AND login_events.login_method IN ('rfid', 'mobile-app')
        GROUP BY users.id, users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.junior_member, users.membership_fees_due, user_types.user_type
        ORDER BY users.surname ASC, users.first_name ASC`,
        [cutoff],
      );
      return normalizeUserRows(result.rows);
    },
    async guestLoginsByDateInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT logged_in_date AS "usageDate", COUNT(*) AS count
         FROM guest_login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY "usageDate"`,
        [startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async guestLoginsByHourInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(HOUR FROM logged_in_time::time)::integer AS hour, COUNT(*) AS count
         FROM guest_login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY hour`,
        [startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async guestLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(DOW FROM logged_in_date::date)::integer AS "dayOfWeek", COUNT(*) AS count
         FROM guest_login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY "dayOfWeek"`,
        [startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async listAllUserDisciplines() {
      const result = await pool.query(
        `SELECT username, discipline FROM user_disciplines ORDER BY username ASC, discipline ASC`,
      );
      return result.rows;
    },
    async listMemberJourneyParticipants(startDate, endDate) {
      const result = await pool.query(
        `SELECT
          beginners_course_participants.id,
          beginners_course_participants.username,
          beginners_course_participants.first_name,
          beginners_course_participants.surname,
          beginners_course_participants.created_at_date,
          beginners_course_participants.created_at_time,
          beginners_course_participants.origin_course_type,
          beginners_course_participants.converted_to_member,
          beginners_course_participants.converted_at_date,
          beginners_course_participants.converted_at_time,
          beginners_courses.course_type AS current_course_type,
          users.membership_status,
          users.programme_type,
          user_types.user_type
         FROM beginners_course_participants
         INNER JOIN beginners_courses
           ON beginners_courses.id = beginners_course_participants.course_id
         INNER JOIN users
           ON users.id = beginners_course_participants.user_id
         INNER JOIN user_types
           ON user_types.user_id = users.id
         WHERE beginners_course_participants.created_at_date >= $1
           AND beginners_course_participants.created_at_date <= $2
         ORDER BY
           beginners_course_participants.created_at_date ASC,
           beginners_course_participants.created_at_time ASC,
           beginners_course_participants.surname ASC,
           beginners_course_participants.first_name ASC`,
        [startDate, endDate],
      );
      return normalizeMemberJourneyRows(result.rows);
    },
    async listReportingGuestLogins(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT
          id, first_name, surname, archery_gb_membership_number,
          invited_by_username, invited_by_name, logged_in_date, logged_in_time
         FROM guest_login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         ORDER BY logged_in_date ASC, logged_in_time ASC, surname ASC, first_name ASC`,
        [startIso, endIsoExclusive],
      );
      return result.rows;
    },
    async listReportingMemberLogins(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT
          login_events.id,
          COALESCE(users.username, login_events.username) AS username,
          users.first_name,
          users.surname,
          users.membership_status,
          users.programme_type,
          user_types.user_type,
          login_events.login_method,
          login_events.logged_in_date,
          login_events.logged_in_time
         FROM login_events
         LEFT JOIN users ON users.id = login_events.user_id
         LEFT JOIN user_types ON user_types.user_id = users.id
         WHERE (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) >= $1
           AND (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) < $2
         ORDER BY login_events.logged_in_date ASC, login_events.logged_in_time ASC, surname ASC, first_name ASC`,
        [startIso, endIsoExclusive],
      );
      return normalizeReportingMemberRows(result.rows);
    },
    async memberLoginsByDateForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT logged_in_date AS "usageDate", COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE username = $2
           AND logged_in_at >= $3
         GROUP BY "usageDate"`,
        [endIsoExclusive, username, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByDateInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT logged_in_date AS "usageDate", COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE logged_in_at >= $2
         GROUP BY "usageDate"`,
        [endIsoExclusive, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByHourForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT EXTRACT(HOUR FROM logged_in_time::time)::integer AS hour, COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE username = $2
           AND logged_in_at >= $3
         GROUP BY hour`,
        [endIsoExclusive, username, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByHourInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT EXTRACT(HOUR FROM logged_in_time::time)::integer AS hour, COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE logged_in_at >= $2
         GROUP BY hour`,
        [endIsoExclusive, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByWeekdayForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT EXTRACT(DOW FROM logged_in_date::date)::integer AS "dayOfWeek", COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE username = $2
           AND logged_in_at >= $3
         GROUP BY "dayOfWeek"`,
        [endIsoExclusive, username, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `${POSTGRES_MEMBER_PRESENCE_EVENTS_CTE}
         SELECT EXTRACT(DOW FROM logged_in_date::date)::integer AS "dayOfWeek", COUNT(*) AS count
         FROM member_presence_visit_starts
         WHERE logged_in_at >= $2
         GROUP BY "dayOfWeek"`,
        [endIsoExclusive, startIso],
      );
      return normalizeRowsWithCount(result.rows);
    },
  };
}

export function createActivityReportingGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresActivityReportingGateway(options);
  }

  return createSqliteActivityReportingGateway(options);
}
