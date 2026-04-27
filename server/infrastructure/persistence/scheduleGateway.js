function normalizeCountLikeResult(result) {
  return {
    changes: Number(result?.changes ?? result?.rowCount ?? 0),
  };
}

function normalizeInsertId(result) {
  return Number(result?.lastInsertRowid ?? result?.rows?.[0]?.id ?? 0);
}

function createSqliteScheduleGateway({
  approveClubEventById,
  approveCoachingSessionById,
  deleteBookingsByCoachingSessionId,
  deleteBookingsByEventId,
  deleteClubEventById,
  deleteCoachingSessionById,
  deleteCoachingSessionBooking,
  deleteEventBooking,
  findClubEventById,
  findCoachingSessionById,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  listAllCoachingSessionBookings,
  listAllEventBookings,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  rejectClubEventById,
  rejectCoachingSessionById,
}) {
  return {
    async approveClubEvent({ actorUsername, eventId, timestampParts }) {
      approveClubEventById.run(actorUsername, ...timestampParts, eventId);
    },
    async approveCoachingSession({ actorUsername, sessionId, timestampParts }) {
      approveCoachingSessionById.run(actorUsername, ...timestampParts, sessionId);
    },
    async createClubEvent(args) {
      const result = insertClubEvent.run(
        args.date,
        args.startTime,
        args.endTime,
        args.title,
        args.details,
        args.type,
        args.venue,
        args.submittedByUsername,
        args.approvalStatus,
        args.rejectionReason,
        args.approvedByUsername,
        ...args.approvedAtParts,
        ...args.createdAtParts,
      );

      return listClubEvents.all().find((entry) => entry.id === normalizeInsertId(result)) ?? null;
    },
    async createCoachingSession(args) {
      const result = insertCoachingSession.run(
        args.coachUsername,
        args.date,
        args.startTime,
        args.endTime,
        args.availableSlots,
        args.topic,
        args.summary,
        args.venue,
        args.approvalStatus,
        args.rejectionReason,
        args.approvedByUsername,
        ...args.approvedAtParts,
        ...args.createdAtParts,
      );

      return findCoachingSessionById.get(normalizeInsertId(result));
    },
    async createEventBooking({ eventId, timestampParts, username }) {
      insertEventBooking.run(eventId, username, ...timestampParts);
    },
    async createCoachingSessionBooking({ sessionId, timestampParts, username }) {
      insertCoachingSessionBooking.run(sessionId, username, ...timestampParts);
    },
    async deleteClubEventCascade(eventId) {
      deleteBookingsByEventId.run(eventId);
      deleteClubEventById.run(eventId);
    },
    async deleteCoachingSession(sessionId) {
      deleteCoachingSessionById.run(sessionId);
    },
    async deleteCoachingSessionBooking(sessionId, actorUserId) {
      return normalizeCountLikeResult(deleteCoachingSessionBooking.run(sessionId, actorUserId));
    },
    async deleteCoachingSessionCascade(sessionId) {
      deleteBookingsByCoachingSessionId.run(sessionId);
      deleteCoachingSessionById.run(sessionId);
    },
    async deleteEventBooking(eventId, actorUserId) {
      return normalizeCountLikeResult(deleteEventBooking.run(eventId, actorUserId));
    },
    async findClubEventById(id) {
      return findClubEventById.get(id);
    },
    async findCoachingSessionById(id) {
      return findCoachingSessionById.get(id);
    },
    async listAllCoachingSessionBookings() {
      return listAllCoachingSessionBookings.all();
    },
    async listAllEventBookings() {
      return listAllEventBookings.all();
    },
    async listBookingsByCoachingSessionId(sessionId) {
      return listBookingsByCoachingSessionId.all(sessionId);
    },
    async listClubEvents() {
      return listClubEvents.all();
    },
    async listCoachingSessions() {
      return listCoachingSessions.all();
    },
    async listEventBookingsByEventId(eventId) {
      return listEventBookingsByEventId.all(eventId);
    },
    async rejectClubEvent({
      actorUsername,
      eventId,
      rejectionReason,
      timestampParts,
    }) {
      rejectClubEventById.run(rejectionReason || null, actorUsername, ...timestampParts, eventId);
    },
    async rejectCoachingSession({
      actorUsername,
      rejectionReason,
      sessionId,
      timestampParts,
    }) {
      rejectCoachingSessionById.run(
        rejectionReason || null,
        actorUsername,
        ...timestampParts,
        sessionId,
      );
    },
  };
}

function createPostgresScheduleGateway({ pool }) {
  return {
    async approveClubEvent({ actorUsername, eventId, timestampParts }) {
      await pool.query(
        `
          UPDATE club_events
          SET
            approval_status = 'approved',
            rejection_reason = NULL,
            approved_by_username = $1,
            approved_at_date = $2,
            approved_at_time = $3
          WHERE id = $4
        `,
        [actorUsername, ...timestampParts, eventId],
      );
    },
    async approveCoachingSession({ actorUsername, sessionId, timestampParts }) {
      await pool.query(
        `
          UPDATE coaching_sessions
          SET
            approval_status = 'approved',
            rejection_reason = NULL,
            approved_by_username = $1,
            approved_at_date = $2,
            approved_at_time = $3
          WHERE id = $4
        `,
        [actorUsername, ...timestampParts, sessionId],
      );
    },
    async createClubEvent(args) {
      const result = await pool.query(
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
            rejection_reason,
            approved_by_username,
            approved_at_date,
            approved_at_time,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `,
        [
          args.date,
          args.startTime,
          args.endTime,
          args.title,
          args.details,
          args.type,
          args.venue,
          args.submittedByUsername,
          args.approvalStatus,
          args.rejectionReason,
          args.approvedByUsername,
          ...args.approvedAtParts,
          ...args.createdAtParts,
        ],
      );

      return this.findClubEventById(normalizeInsertId(result));
    },
    async createCoachingSession(args) {
      const result = await pool.query(
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
            rejection_reason,
            approved_by_username,
            approved_at_date,
            approved_at_time,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `,
        [
          args.coachUsername,
          args.date,
          args.startTime,
          args.endTime,
          args.availableSlots,
          args.topic,
          args.summary,
          args.venue,
          args.approvalStatus,
          args.rejectionReason,
          args.approvedByUsername,
          ...args.approvedAtParts,
          ...args.createdAtParts,
        ],
      );

      return this.findCoachingSessionById(normalizeInsertId(result));
    },
    async createEventBooking({ eventId, timestampParts, username }) {
      await pool.query(
        `
          INSERT INTO event_bookings (
            club_event_id,
            member_username,
            booked_at_date,
            booked_at_time
          )
          VALUES ($1, $2, $3, $4)
        `,
        [eventId, username, ...timestampParts],
      );
    },
    async createCoachingSessionBooking({ sessionId, timestampParts, username }) {
      await pool.query(
        `
          INSERT INTO coaching_session_bookings (
            coaching_session_id,
            member_username,
            booked_at_date,
            booked_at_time
          )
          VALUES ($1, $2, $3, $4)
        `,
        [sessionId, username, ...timestampParts],
      );
    },
    async deleteClubEventCascade(eventId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM event_bookings WHERE club_event_id = $1`, [eventId]);
        await client.query(`DELETE FROM club_events WHERE id = $1`, [eventId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteCoachingSession(sessionId) {
      await pool.query(`DELETE FROM coaching_sessions WHERE id = $1`, [sessionId]);
    },
    async deleteCoachingSessionBooking(sessionId, actorUserId) {
      const result = await pool.query(
        `
          DELETE FROM coaching_session_bookings
          WHERE coaching_session_id = $1 AND member_user_id = $2
        `,
        [sessionId, actorUserId],
      );

      return normalizeCountLikeResult(result);
    },
    async deleteCoachingSessionCascade(sessionId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM coaching_session_bookings WHERE coaching_session_id = $1`,
          [sessionId],
        );
        await client.query(`DELETE FROM coaching_sessions WHERE id = $1`, [sessionId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteEventBooking(eventId, actorUserId) {
      const result = await pool.query(
        `
          DELETE FROM event_bookings
          WHERE club_event_id = $1 AND member_user_id = $2
        `,
        [eventId, actorUserId],
      );

      return normalizeCountLikeResult(result);
    },
    async findClubEventById(id) {
      const result = await pool.query(
        `
          SELECT
            id,
            event_date,
            start_time,
            end_time,
            title,
            details,
            type,
            CASE
              WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor'
              WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor'
              ELSE 'both'
            END AS venue,
            submitted_by_username,
            approval_status,
            rejection_reason,
            approved_by_username,
            created_at_date || 'T' || created_at_time AS created_at,
            approved_at_date || 'T' || approved_at_time AS approved_at
          FROM club_events
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    },
    async findCoachingSessionById(id) {
      const result = await pool.query(
        `
          SELECT
            coaching_sessions.id,
            coaching_sessions.coach_username,
            coaching_sessions.session_date,
            coaching_sessions.start_time,
            coaching_sessions.end_time,
            coaching_sessions.available_slots,
            coaching_sessions.topic,
            coaching_sessions.summary,
            CASE
              WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor'
              WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both'
              ELSE 'indoor'
            END AS venue,
            coaching_sessions.approval_status,
            coaching_sessions.rejection_reason,
            coaching_sessions.approved_by_username,
            coaching_sessions.approved_at_date || 'T' || coaching_sessions.approved_at_time AS approved_at,
            coaching_sessions.created_at_date || 'T' || coaching_sessions.created_at_time AS created_at,
            users.first_name AS coach_first_name,
            users.surname AS coach_surname
          FROM coaching_sessions
          INNER JOIN users ON users.id = coaching_sessions.coach_user_id
          WHERE coaching_sessions.id = $1
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    },
    async listAllCoachingSessionBookings() {
      const result = await pool.query(
        `
          SELECT
            coaching_session_bookings.coaching_session_id,
            coaching_session_bookings.member_username,
            coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
            users.first_name,
            users.surname
          FROM coaching_session_bookings
          INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
          ORDER BY coaching_session_bookings.coaching_session_id ASC, users.surname ASC, users.first_name ASC
        `,
      );

      return result.rows;
    },
    async listAllEventBookings() {
      const result = await pool.query(
        `
          SELECT
            event_bookings.club_event_id,
            event_bookings.member_username,
            event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
            users.first_name,
            users.surname
          FROM event_bookings
          INNER JOIN users ON users.id = event_bookings.member_user_id
          ORDER BY event_bookings.club_event_id ASC, users.surname ASC, users.first_name ASC
        `,
      );

      return result.rows;
    },
    async listBookingsByCoachingSessionId(sessionId) {
      const result = await pool.query(
        `
          SELECT
            coaching_session_bookings.coaching_session_id,
            coaching_session_bookings.member_username,
            coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
            users.first_name,
            users.surname
          FROM coaching_session_bookings
          INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
          WHERE coaching_session_bookings.coaching_session_id = $1
          ORDER BY users.surname ASC, users.first_name ASC
        `,
        [sessionId],
      );

      return result.rows;
    },
    async listClubEvents() {
      const result = await pool.query(
        `
          SELECT
            id,
            event_date,
            start_time,
            end_time,
            title,
            details,
            type,
            CASE
              WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor'
              WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor'
              ELSE 'both'
            END AS venue,
            submitted_by_username,
            approval_status,
            rejection_reason,
            approved_by_username,
            created_at_date || 'T' || created_at_time AS created_at,
            approved_at_date || 'T' || approved_at_time AS approved_at
          FROM club_events
          ORDER BY event_date ASC, start_time ASC
        `,
      );

      return result.rows;
    },
    async listCoachingSessions() {
      const result = await pool.query(
        `
          SELECT
            coaching_sessions.id,
            coaching_sessions.coach_username,
            coaching_sessions.session_date,
            coaching_sessions.start_time,
            coaching_sessions.end_time,
            coaching_sessions.available_slots,
            coaching_sessions.topic,
            coaching_sessions.summary,
            CASE
              WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor'
              WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both'
              ELSE 'indoor'
            END AS venue,
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
        `,
      );

      return result.rows;
    },
    async listEventBookingsByEventId(eventId) {
      const result = await pool.query(
        `
          SELECT
            event_bookings.club_event_id,
            event_bookings.member_username,
            event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
            users.first_name,
            users.surname
          FROM event_bookings
          INNER JOIN users ON users.id = event_bookings.member_user_id
          WHERE event_bookings.club_event_id = $1
          ORDER BY users.surname ASC, users.first_name ASC
        `,
        [eventId],
      );

      return result.rows;
    },
    async rejectClubEvent({ actorUsername, eventId, rejectionReason, timestampParts }) {
      await pool.query(
        `
          UPDATE club_events
          SET
            approval_status = 'rejected',
            rejection_reason = $1,
            approved_by_username = $2,
            approved_at_date = $3,
            approved_at_time = $4
          WHERE id = $5
        `,
        [rejectionReason || null, actorUsername, ...timestampParts, eventId],
      );
    },
    async rejectCoachingSession({
      actorUsername,
      rejectionReason,
      sessionId,
      timestampParts,
    }) {
      await pool.query(
        `
          UPDATE coaching_sessions
          SET
            approval_status = 'rejected',
            rejection_reason = $1,
            approved_by_username = $2,
            approved_at_date = $3,
            approved_at_time = $4
          WHERE id = $5
        `,
        [rejectionReason || null, actorUsername, ...timestampParts, sessionId],
      );
    },
  };
}

export function createScheduleGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresScheduleGateway(options);
  }

  return createSqliteScheduleGateway(options);
}
