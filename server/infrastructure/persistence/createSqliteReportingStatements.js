export function createSqliteReportingStatements(db) {
  const findRecentRangeMembers = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.first_name,
      users.surname,
      users.password,
      users.rfid_tag,
      users.active_member,
      users.membership_fees_due,
      users.coaching_volunteer,
      user_types.user_type,
      MAX(login_events.logged_in_date || 'T' || login_events.logged_in_time) AS last_logged_in_at
    FROM login_events
    INNER JOIN users
      ON users.id = login_events.user_id
    INNER JOIN user_types
      ON user_types.user_id = users.id
    WHERE login_events.logged_in_date || 'T' || login_events.logged_in_time >= ?
    GROUP BY users.id, users.username, users.first_name, users.surname, users.password,
      users.rfid_tag, users.active_member, users.membership_fees_due, users.coaching_volunteer, user_types.user_type
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  const findDisciplinesByUsername = db.prepare(`
    SELECT discipline
    FROM user_disciplines
    WHERE username = ?
    ORDER BY discipline ASC
  `);

  const listAllUserDisciplines = db.prepare(`
    SELECT username, discipline
    FROM user_disciplines
    ORDER BY username ASC, discipline ASC
  `);

  const findRecentGuestLogins = db.prepare(`
    SELECT
      first_name,
      surname,
      archery_gb_membership_number,
      invited_by_username,
      invited_by_name,
      MAX(logged_in_date || 'T' || logged_in_time) AS last_logged_in_at
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
    GROUP BY first_name, surname, archery_gb_membership_number, invited_by_username, invited_by_name
    ORDER BY surname ASC, first_name ASC
  `);

  const countMemberLoginsInRange = db.prepare(`
    SELECT COUNT(*) AS count
    FROM login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
  `);

  const countGuestLoginsInRange = db.prepare(`
    SELECT COUNT(*) AS count
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
  `);

  const memberLoginsByHourInRange = db.prepare(`
    SELECT substr(logged_in_time, 1, 2) AS hour, COUNT(*) AS count
    FROM login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY substr(logged_in_time, 1, 2)
  `);

  const guestLoginsByHourInRange = db.prepare(`
    SELECT substr(logged_in_time, 1, 2) AS hour, COUNT(*) AS count
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY substr(logged_in_time, 1, 2)
  `);

  const memberLoginsByWeekdayInRange = db.prepare(`
    SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
    FROM login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY strftime('%w', logged_in_date)
  `);

  const guestLoginsByWeekdayInRange = db.prepare(`
    SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY strftime('%w', logged_in_date)
  `);

  const memberLoginsByDateInRange = db.prepare(`
    SELECT logged_in_date AS usageDate, COUNT(*) AS count
    FROM login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY logged_in_date
  `);

  const guestLoginsByDateInRange = db.prepare(`
    SELECT logged_in_date AS usageDate, COUNT(*) AS count
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY logged_in_date
  `);

  const countMemberLoginsForUserInRange = db.prepare(`
    SELECT COUNT(*) AS count
    FROM login_events
    WHERE username = ?
      AND logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
  `);

  const memberLoginsByHourForUserInRange = db.prepare(`
    SELECT substr(logged_in_time, 1, 2) AS hour, COUNT(*) AS count
    FROM login_events
    WHERE username = ?
      AND logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY substr(logged_in_time, 1, 2)
  `);

  const memberLoginsByWeekdayForUserInRange = db.prepare(`
    SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
    FROM login_events
    WHERE username = ?
      AND logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY strftime('%w', logged_in_date)
  `);

  const memberLoginsByDateForUserInRange = db.prepare(`
    SELECT logged_in_date AS usageDate, COUNT(*) AS count
    FROM login_events
    WHERE username = ?
      AND logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    GROUP BY logged_in_date
  `);

  const listReportingMemberLogins = db.prepare(`
    SELECT
      login_events.id,
      users.username,
      users.first_name,
      users.surname,
      login_events.login_method,
      login_events.logged_in_date,
      login_events.logged_in_time
    FROM login_events
    INNER JOIN users
      ON users.id = login_events.user_id
    WHERE login_events.logged_in_date || 'T' || login_events.logged_in_time >= ?
      AND login_events.logged_in_date || 'T' || login_events.logged_in_time < ?
    ORDER BY login_events.logged_in_date ASC, login_events.logged_in_time ASC, users.surname ASC, users.first_name ASC
  `);

  const listReportingGuestLogins = db.prepare(`
    SELECT
      id,
      first_name,
      surname,
      archery_gb_membership_number,
      invited_by_username,
      invited_by_name,
      logged_in_date,
      logged_in_time
    FROM guest_login_events
    WHERE logged_in_date || 'T' || logged_in_time >= ?
      AND logged_in_date || 'T' || logged_in_time < ?
    ORDER BY logged_in_date ASC, logged_in_time ASC, surname ASC, first_name ASC
  `);

  return {
    countGuestLoginsInRange,
    countMemberLoginsForUserInRange,
    countMemberLoginsInRange,
    findDisciplinesByUsername,
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
  };
}
