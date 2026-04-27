export function createSqliteScheduleTournamentStatements(db) {
  const insertCoachingSession = db.prepare(`
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
      rejection_reason,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const listCoachingSessions = db.prepare(`
    SELECT
      coaching_sessions.id,
      coaching_sessions.coach_username,
      coaching_sessions.session_date,
      coaching_sessions.start_time,
      coaching_sessions.end_time,
      coaching_sessions.available_slots,
      coaching_sessions.topic,
      coaching_sessions.summary,
      CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
      coaching_sessions.approval_status,
      coaching_sessions.rejection_reason,
      coaching_sessions.approved_by_username,
      coaching_sessions.approved_at_date || 'T' || coaching_sessions.approved_at_time AS approved_at,
      coaching_sessions.created_at_date || 'T' || coaching_sessions.created_at_time AS created_at,
      users.first_name AS coach_first_name,
      users.surname AS coach_surname
    FROM coaching_sessions
    INNER JOIN users ON users.id = coaching_sessions.coach_user_id
    ORDER BY coaching_sessions.session_date ASC, coaching_sessions.start_time ASC
  `);

  const findCoachingSessionById = db.prepare(`
    SELECT
      coaching_sessions.id,
      coaching_sessions.coach_username,
      coaching_sessions.session_date,
      coaching_sessions.start_time,
      coaching_sessions.end_time,
      coaching_sessions.available_slots,
      coaching_sessions.topic,
      coaching_sessions.summary,
      CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
      coaching_sessions.approval_status,
      coaching_sessions.rejection_reason,
      coaching_sessions.approved_by_username,
      coaching_sessions.approved_at_date || 'T' || coaching_sessions.approved_at_time AS approved_at,
      coaching_sessions.created_at_date || 'T' || coaching_sessions.created_at_time AS created_at,
      users.first_name AS coach_first_name,
      users.surname AS coach_surname
    FROM coaching_sessions
    INNER JOIN users ON users.id = coaching_sessions.coach_user_id
    WHERE coaching_sessions.id = ?
  `);

  const listBookingsByCoachingSessionId = db.prepare(`
    SELECT
      coaching_session_bookings.coaching_session_id,
      coaching_session_bookings.member_username,
      coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
      users.first_name,
      users.surname
    FROM coaching_session_bookings
    INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
    WHERE coaching_session_bookings.coaching_session_id = ?
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  const listAllCoachingSessionBookings = db.prepare(`
    SELECT
      coaching_session_bookings.coaching_session_id,
      coaching_session_bookings.member_username,
      coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
      users.first_name,
      users.surname
    FROM coaching_session_bookings
    INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
    ORDER BY coaching_session_bookings.coaching_session_id ASC, users.surname ASC, users.first_name ASC
  `);

  const insertCoachingSessionBooking = db.prepare(`
    INSERT INTO coaching_session_bookings (
      coaching_session_id,
      member_username,
      booked_at_date,
      booked_at_time
    )
    VALUES (?, ?, ?, ?)
  `);

  const deleteCoachingSessionBooking = db.prepare(`
    DELETE FROM coaching_session_bookings
    WHERE coaching_session_id = ? AND member_user_id = ?
  `);

  const deleteBookingsByCoachingSessionId = db.prepare(`
    DELETE FROM coaching_session_bookings
    WHERE coaching_session_id = ?
  `);

  const deleteCoachingSessionById = db.prepare(`
    DELETE FROM coaching_sessions
    WHERE id = ?
  `);

  const approveCoachingSessionById = db.prepare(`
    UPDATE coaching_sessions
    SET
      approval_status = 'approved',
      rejection_reason = NULL,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  const rejectCoachingSessionById = db.prepare(`
    UPDATE coaching_sessions
    SET
      approval_status = 'rejected',
      rejection_reason = ?,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  const findMemberCoachingBookingsByUserId = db.prepare(`
    SELECT
      coaching_sessions.id,
      coaching_sessions.session_date,
      coaching_sessions.start_time,
      coaching_sessions.end_time,
      coaching_sessions.available_slots,
      coaching_sessions.topic,
      coaching_sessions.summary,
      CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
      coaching_sessions.coach_username,
      users.first_name AS coach_first_name,
      users.surname AS coach_surname
    FROM coaching_session_bookings
    INNER JOIN coaching_sessions
      ON coaching_sessions.id = coaching_session_bookings.coaching_session_id
    INNER JOIN users ON users.id = coaching_sessions.coach_user_id
    WHERE coaching_session_bookings.member_user_id = ?
    ORDER BY coaching_sessions.session_date ASC, coaching_sessions.start_time ASC
  `);

  const listClubEvents = db.prepare(`
    SELECT
      id,
      event_date,
      start_time,
      end_time,
      title,
      details,
      type,
      CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor' ELSE 'both' END AS venue,
      submitted_by_username,
      approval_status,
      rejection_reason,
      approved_by_username,
      created_at_date || 'T' || created_at_time AS created_at,
      approved_at_date || 'T' || approved_at_time AS approved_at
    FROM club_events
    ORDER BY event_date ASC, start_time ASC
  `);

  const insertClubEvent = db.prepare(`
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
      rejection_reason,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const listTournaments = db.prepare(`
    SELECT
      tournaments.id,
      tournaments.name,
      tournaments.tournament_type,
      tournaments.registration_start_date,
      tournaments.registration_end_date,
      tournaments.score_submission_start_date,
      tournaments.score_submission_end_date,
      tournaments.created_by,
      tournaments.created_at_date || 'T' || tournaments.created_at_time AS created_at,
      users.first_name AS created_by_first_name,
      users.surname AS created_by_surname
    FROM tournaments
    INNER JOIN users ON users.id = tournaments.created_by_user_id
    ORDER BY tournaments.registration_start_date DESC, tournaments.created_at_date DESC, tournaments.created_at_time DESC
  `);

  const findTournamentById = db.prepare(`
    SELECT
      tournaments.id,
      tournaments.name,
      tournaments.tournament_type,
      tournaments.registration_start_date,
      tournaments.registration_end_date,
      tournaments.score_submission_start_date,
      tournaments.score_submission_end_date,
      tournaments.created_by,
      tournaments.created_at_date || 'T' || tournaments.created_at_time AS created_at,
      users.first_name AS created_by_first_name,
      users.surname AS created_by_surname
    FROM tournaments
    INNER JOIN users ON users.id = tournaments.created_by_user_id
    WHERE tournaments.id = ?
  `);

  const insertTournament = db.prepare(`
    INSERT INTO tournaments (
      name,
      tournament_type,
      registration_start_date,
      registration_end_date,
      score_submission_start_date,
      score_submission_end_date,
      created_by,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateTournamentById = db.prepare(`
    UPDATE tournaments
    SET
      name = ?,
      tournament_type = ?,
      registration_start_date = ?,
      registration_end_date = ?,
      score_submission_start_date = ?,
      score_submission_end_date = ?
    WHERE id = ?
  `);

  const deleteTournamentScoresByTournamentId = db.prepare(`
    DELETE FROM tournament_scores
    WHERE tournament_id = ?
  `);

  const deleteTournamentRegistrationsByTournamentId = db.prepare(`
    DELETE FROM tournament_registrations
    WHERE tournament_id = ?
  `);

  const deleteTournamentById = db.prepare(`
    DELETE FROM tournaments
    WHERE id = ?
  `);

  const listTournamentRegistrationsByTournamentId = db.prepare(`
    SELECT
      tournament_registrations.tournament_id,
      tournament_registrations.member_username,
      tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
      users.first_name,
      users.surname,
      user_types.user_type
    FROM tournament_registrations
    INNER JOIN users ON users.id = tournament_registrations.member_user_id
    INNER JOIN user_types ON user_types.user_id = users.id
    WHERE tournament_registrations.tournament_id = ?
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  const listAllTournamentRegistrations = db.prepare(`
    SELECT
      tournament_registrations.tournament_id,
      tournament_registrations.member_username,
      tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
      users.first_name,
      users.surname,
      user_types.user_type
    FROM tournament_registrations
    INNER JOIN users ON users.id = tournament_registrations.member_user_id
    INNER JOIN user_types ON user_types.user_id = users.id
    ORDER BY tournament_registrations.tournament_id ASC, users.surname ASC, users.first_name ASC
  `);

  const insertTournamentRegistration = db.prepare(`
    INSERT INTO tournament_registrations (
      tournament_id,
      member_username,
      registered_at_date,
      registered_at_time
    )
    VALUES (?, ?, ?, ?)
  `);

  const deleteTournamentRegistration = db.prepare(`
    DELETE FROM tournament_registrations
    WHERE tournament_id = ? AND member_user_id = ?
  `);

  const listTournamentScoresByTournamentId = db.prepare(`
    SELECT
      tournament_id,
      round_number,
      member_username,
      score,
      submitted_at_date || 'T' || submitted_at_time AS submitted_at
    FROM tournament_scores
    WHERE tournament_id = ?
    ORDER BY round_number ASC, member_username ASC
  `);

  const listAllTournamentScores = db.prepare(`
    SELECT
      tournament_id,
      round_number,
      member_username,
      score,
      submitted_at_date || 'T' || submitted_at_time AS submitted_at
    FROM tournament_scores
    ORDER BY tournament_id ASC, round_number ASC, member_username ASC
  `);

  const upsertTournamentScore = db.prepare(`
    INSERT INTO tournament_scores (
      tournament_id,
      round_number,
      member_username,
      score,
      submitted_at_date,
      submitted_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tournament_id, round_number, member_username) DO UPDATE SET
      score = excluded.score,
      submitted_at_date = excluded.submitted_at_date,
      submitted_at_time = excluded.submitted_at_time
  `);

  const listEventBookingsByEventId = db.prepare(`
    SELECT
      event_bookings.club_event_id,
      event_bookings.member_username,
      event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
      users.first_name,
      users.surname
    FROM event_bookings
    INNER JOIN users ON users.id = event_bookings.member_user_id
    WHERE event_bookings.club_event_id = ?
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  const listAllEventBookings = db.prepare(`
    SELECT
      event_bookings.club_event_id,
      event_bookings.member_username,
      event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
      users.first_name,
      users.surname
    FROM event_bookings
    INNER JOIN users ON users.id = event_bookings.member_user_id
    ORDER BY event_bookings.club_event_id ASC, users.surname ASC, users.first_name ASC
  `);

  const insertEventBooking = db.prepare(`
    INSERT INTO event_bookings (
      club_event_id,
      member_username,
      booked_at_date,
      booked_at_time
    )
    VALUES (?, ?, ?, ?)
  `);

  const deleteEventBooking = db.prepare(`
    DELETE FROM event_bookings
    WHERE club_event_id = ? AND member_user_id = ?
  `);

  const deleteBookingsByEventId = db.prepare(`
    DELETE FROM event_bookings
    WHERE club_event_id = ?
  `);

  const deleteClubEventById = db.prepare(`
    DELETE FROM club_events
    WHERE id = ?
  `);

  const findMemberEventBookingsByUserId = db.prepare(`
    SELECT
      club_events.id,
      club_events.event_date,
      club_events.start_time,
      club_events.end_time,
      club_events.title,
      club_events.type
    FROM event_bookings
    INNER JOIN club_events
      ON club_events.id = event_bookings.club_event_id
    WHERE event_bookings.member_user_id = ?
    ORDER BY club_events.event_date ASC, club_events.start_time ASC
  `);

  const findClubEventById = db.prepare(`
    SELECT
      id,
      event_date,
      start_time,
      end_time,
      title,
      type,
      CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor' ELSE 'both' END AS venue,
      submitted_by_username,
      approval_status,
      rejection_reason,
      approved_by_username,
      created_at_date || 'T' || created_at_time AS created_at,
      approved_at_date || 'T' || approved_at_time AS approved_at
    FROM club_events
    WHERE id = ?
  `);

  const approveClubEventById = db.prepare(`
    UPDATE club_events
    SET
      approval_status = 'approved',
      rejection_reason = NULL,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  const rejectClubEventById = db.prepare(`
    UPDATE club_events
    SET
      approval_status = 'rejected',
      rejection_reason = ?,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  return {
    approveClubEventById,
    approveCoachingSessionById,
    deleteBookingsByCoachingSessionId,
    deleteBookingsByEventId,
    deleteClubEventById,
    deleteCoachingSessionById,
    deleteCoachingSessionBooking,
    deleteEventBooking,
    deleteTournamentById,
    deleteTournamentRegistration,
    deleteTournamentRegistrationsByTournamentId,
    deleteTournamentScoresByTournamentId,
    findClubEventById,
    findCoachingSessionById,
    findMemberCoachingBookingsByUserId,
    findMemberEventBookingsByUserId,
    findTournamentById,
    insertClubEvent,
    insertCoachingSession,
    insertCoachingSessionBooking,
    insertEventBooking,
    insertTournament,
    insertTournamentRegistration,
    listAllCoachingSessionBookings,
    listAllEventBookings,
    listAllTournamentRegistrations,
    listAllTournamentScores,
    listBookingsByCoachingSessionId,
    listClubEvents,
    listCoachingSessions,
    listEventBookingsByEventId,
    listTournamentRegistrationsByTournamentId,
    listTournamentScoresByTournamentId,
    listTournaments,
    rejectClubEventById,
    rejectCoachingSessionById,
    updateTournamentById,
    upsertTournamentScore,
  };
}
