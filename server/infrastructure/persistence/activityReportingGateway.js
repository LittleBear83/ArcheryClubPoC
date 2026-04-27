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
  }));
}

function createSqliteActivityReportingGateway({
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
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
        countMemberLoginsForUserInRange.get(username, startIso, endIsoExclusive),
      );
    },
    async countMemberLoginsInRange(startIso, endIsoExclusive) {
      return normalizeCountRow(countMemberLoginsInRange.get(startIso, endIsoExclusive));
    },
    async findMemberCoachingBookingsByUserId(userId) {
      return findMemberCoachingBookingsByUserId.all(userId);
    },
    async findMemberEventBookingsByUserId(userId) {
      return findMemberEventBookingsByUserId.all(userId);
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
    async listReportingGuestLogins(startIso, endIsoExclusive) {
      return listReportingGuestLogins.all(startIso, endIsoExclusive);
    },
    async listReportingMemberLogins(startIso, endIsoExclusive) {
      return listReportingMemberLogins.all(startIso, endIsoExclusive);
    },
    async memberLoginsByDateForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByDateForUserInRange.all(username, startIso, endIsoExclusive),
      );
    },
    async memberLoginsByDateInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByDateInRange.all(startIso, endIsoExclusive));
    },
    async memberLoginsByHourForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByHourForUserInRange.all(username, startIso, endIsoExclusive),
      );
    },
    async memberLoginsByHourInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByHourInRange.all(startIso, endIsoExclusive));
    },
    async memberLoginsByWeekdayForUserInRange(username, startIso, endIsoExclusive) {
      return normalizeRowsWithCount(
        memberLoginsByWeekdayForUserInRange.all(username, startIso, endIsoExclusive),
      );
    },
    async memberLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      return normalizeRowsWithCount(memberLoginsByWeekdayInRange.all(startIso, endIsoExclusive));
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
        `SELECT COUNT(*) AS count FROM login_events
         WHERE username = $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) >= $2
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $3`,
        [username, startIso, endIsoExclusive],
      );
      return normalizeCountRow(result.rows[0]);
    },
    async countMemberLoginsInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT COUNT(*) AS count FROM login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2`,
        [startIso, endIsoExclusive],
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
          users.membership_fees_due,
          user_types.user_type,
          MAX(login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) AS last_logged_in_at
        FROM login_events
        INNER JOIN users ON users.id = login_events.user_id
        INNER JOIN user_types ON user_types.user_id = users.id
        WHERE (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) >= $1
        GROUP BY users.id, users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.membership_fees_due, user_types.user_type
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
          login_events.login_method,
          login_events.logged_in_date,
          login_events.logged_in_time
         FROM login_events
         LEFT JOIN users ON users.id = login_events.user_id
         WHERE (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) >= $1
           AND (login_events.logged_in_date::text || 'T' || login_events.logged_in_time::text) < $2
         ORDER BY login_events.logged_in_date ASC, login_events.logged_in_time ASC, surname ASC, first_name ASC`,
        [startIso, endIsoExclusive],
      );
      return result.rows;
    },
    async memberLoginsByDateForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT logged_in_date AS "usageDate", COUNT(*) AS count
         FROM login_events
         WHERE username = $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) >= $2
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $3
         GROUP BY "usageDate"`,
        [username, startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByDateInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT logged_in_date AS "usageDate", COUNT(*) AS count
         FROM login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY "usageDate"`,
        [startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByHourForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(HOUR FROM logged_in_time::time)::integer AS hour, COUNT(*) AS count
         FROM login_events
         WHERE username = $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) >= $2
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $3
         GROUP BY hour`,
        [username, startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByHourInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(HOUR FROM logged_in_time::time)::integer AS hour, COUNT(*) AS count
         FROM login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY hour`,
        [startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByWeekdayForUserInRange(username, startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(DOW FROM logged_in_date::date)::integer AS "dayOfWeek", COUNT(*) AS count
         FROM login_events
         WHERE username = $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) >= $2
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $3
         GROUP BY "dayOfWeek"`,
        [username, startIso, endIsoExclusive],
      );
      return normalizeRowsWithCount(result.rows);
    },
    async memberLoginsByWeekdayInRange(startIso, endIsoExclusive) {
      const result = await pool.query(
        `SELECT EXTRACT(DOW FROM logged_in_date::date)::integer AS "dayOfWeek", COUNT(*) AS count
         FROM login_events
         WHERE (logged_in_date::text || 'T' || logged_in_time::text) >= $1
           AND (logged_in_date::text || 'T' || logged_in_time::text) < $2
         GROUP BY "dayOfWeek"`,
        [startIso, endIsoExclusive],
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
