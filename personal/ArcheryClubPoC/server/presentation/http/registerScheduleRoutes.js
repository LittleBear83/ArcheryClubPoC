export function registerScheduleRoutes({
  actorHasPermission,
  app,
  approveClubEventById,
  approveCoachingSessionById,
  buildClubEvent,
  buildEventBookingsMap,
  buildCoachingBookingsMap,
  buildCoachingSession,
  canActorViewApprovalEntry,
  db,
  deleteBookingsByCoachingSessionId,
  deleteBookingsByEventId,
  deleteClubEventById,
  deleteCoachingSessionById,
  deleteCoachingSessionBooking,
  deleteEventBooking,
  findClubEventById,
  findScheduleConflict,
  findCoachingSessionById,
  getActorUser,
  getUtcTimestampParts,
  hasScheduleEntryEnded,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  normalizeBookingRow,
  normalizeVenue,
  PERMISSIONS,
  rejectClubEventById,
  rejectCoachingSessionById,
}) {
  app.get("/api/events", (req, res) => {
    const actor = getActorUser(req);
    const bookingsByEventId = buildEventBookingsMap();
    const persistedEvents = listClubEvents
      .all()
      .filter((event) =>
        canActorViewApprovalEntry(
          event,
          actor,
          "submitted_by_username",
          PERMISSIONS.APPROVE_EVENTS,
        ),
      )
      .map((event) =>
        buildClubEvent(
          event,
          bookingsByEventId.get(event.id) ?? [],
          actor,
        ),
      );
    const recurringClosures = [];
    const startYear = new Date().getFullYear() - 1;

    for (let year = startYear; year <= startYear + 3; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        const firstDay = new Date(year, month, 1);
        const firstDayOfWeek = firstDay.getDay();
        const daysUntilMonday = (8 - firstDayOfWeek) % 7;
        const firstMonday = 1 + daysUntilMonday;
        const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(firstMonday).padStart(2, "0")}`;

        recurringClosures.push({
          id: `range-closed-${date}`,
          date,
          startTime: "09:00",
          endTime: "12:00",
          title: "Range closed until 12:00",
          type: "range-closed",
          venue: "both",
          system: true,
          bookingCount: 0,
          isBookedOn: false,
        });
      }
    }

    res.json({
      success: true,
      events: [...recurringClosures, ...persistedEvents].sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        return byDate !== 0
          ? byDate
          : left.startTime.localeCompare(right.startTime);
      }),
    });
  });

  app.post("/api/events", (req, res) => {
    const actor = getActorUser(req);
    const { date, startTime, endTime, title, details, type, venue } = req.body ?? {};
    const trimmedTitle = title?.trim();
    const trimmedDetails =
      typeof details === "string" ? details.trim().slice(0, 2000) : "";
    const normalizedVenue = normalizeVenue(venue);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.ADD_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create events.",
      });
      return;
    }

    if (!date || !startTime || !endTime || !trimmedTitle || !type) {
      res.status(400).json({
        success: false,
        message:
          "Date, start time, end time, title, and event type are required.",
      });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({
        success: false,
        message: "End time must be after the event start time.",
      });
      return;
    }

    const conflict = findScheduleConflict({
      date,
      startTime,
      endTime,
      venue: normalizedVenue,
    });

    if (conflict) {
      res.status(409).json({
        success: false,
        message: `This event overlaps ${conflict.title} from ${conflict.startTime} to ${conflict.endTime}.`,
      });
      return;
    }

    const insertResult = insertClubEvent.run(
      date,
      startTime,
      endTime,
      trimmedTitle,
      trimmedDetails,
      type,
      normalizedVenue,
      actor.username,
      actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS) ? "approved" : "pending",
      null,
      actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS) ? actor.username : null,
      ...(actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? getUtcTimestampParts()
        : ["", ""]),
      ...getUtcTimestampParts(),
    );
    const event = listClubEvents
      .all()
      .find((entry) => entry.id === insertResult.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? "Event approved and published successfully."
        : "Event submitted for approval.",
      event: buildClubEvent(event, [], actor),
    });
  });

  app.post("/api/events/:id/approve", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to approve events.",
      });
      return;
    }

    const event = findClubEventById.get(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    if ((event.approval_status ?? "approved") === "approved") {
      res.status(400).json({
        success: false,
        message: "This event has already been approved.",
      });
      return;
    }

    approveClubEventById.run(actor.username, ...getUtcTimestampParts(), event.id);
    const approvedEvent = findClubEventById.get(event.id);
    const bookings = listEventBookingsByEventId.all(event.id).map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Event approved successfully.",
      event: buildClubEvent(approvedEvent, bookings, actor),
    });
  });

  app.post("/api/events/:id/reject", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to reject events.",
      });
      return;
    }

    const event = findClubEventById.get(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    if ((event.approval_status ?? "approved") !== "pending") {
      res.status(400).json({
        success: false,
        message: "Only pending events can be rejected.",
      });
      return;
    }

    const rejectionReason =
      typeof req.body?.rejectionReason === "string"
        ? req.body.rejectionReason.trim().slice(0, 280)
        : "";

    rejectClubEventById.run(
      rejectionReason || null,
      actor.username,
      ...getUtcTimestampParts(),
      event.id,
    );
    const rejectedEvent = findClubEventById.get(event.id);
    const bookings = listEventBookingsByEventId.all(event.id).map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Event request rejected.",
      event: buildClubEvent(rejectedEvent, bookings, actor),
    });
  });

  app.post("/api/events/:id/book", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const event = findClubEventById.get(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    if (event.type === "range-closed") {
      res.status(400).json({
        success: false,
        message: "Range closed entries cannot be booked.",
      });
      return;
    }

    if ((event.approval_status ?? "approved") !== "approved") {
      res.status(400).json({
        success: false,
        message: "This event is still awaiting approval.",
      });
      return;
    }

    if (hasScheduleEntryEnded(event.event_date, event.end_time)) {
      res.status(400).json({
        success: false,
        message: "You cannot book onto an event that has already finished.",
      });
      return;
    }

    try {
      insertEventBooking.run(event.id, actor.username, ...getUtcTimestampParts());
    } catch (error) {
      if (
        error?.message?.includes(
          "UNIQUE constraint failed: event_bookings.club_event_id, event_bookings.member_username",
        )
      ) {
        res.status(409).json({
          success: false,
          message: "You are already booked onto this event.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to book onto this event.",
      });
      return;
    }

    const bookings = listEventBookingsByEventId.all(event.id).map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

    res.json({
      success: true,
      event: buildClubEvent(event, bookings, actor),
    });
  });

  app.delete("/api/events/:id/booking", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const event = findClubEventById.get(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    const deleteResult = deleteEventBooking.run(event.id, actor.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this event.",
      });
      return;
    }

    const bookings = listEventBookingsByEventId.all(event.id).map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

    res.json({
      success: true,
      event: buildClubEvent(event, bookings, actor),
    });
  });

  app.delete("/api/events/:id", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.CANCEL_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to cancel events.",
      });
      return;
    }

    const event = findClubEventById.get(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    const deleteEventTransaction = db.transaction(() => {
      deleteBookingsByEventId.run(event.id);
      deleteClubEventById.run(event.id);
    });

    deleteEventTransaction();

    res.json({
      success: true,
      message: "Event cancelled successfully.",
    });
  });

  app.get("/api/coaching-sessions", (req, res) => {
    const actor = getActorUser(req);
    const coachingBookingsBySessionId = buildCoachingBookingsMap();
    const sessions = listCoachingSessions
      .all()
      .filter((session) =>
        canActorViewApprovalEntry(
          session,
          actor,
          "coach_username",
          PERMISSIONS.APPROVE_COACHING_SESSIONS,
        ),
      )
      .map((session) =>
        buildCoachingSession(
          session,
          coachingBookingsBySessionId.get(session.id) ?? [],
          actor,
        ),
      );

    res.json({
      success: true,
      sessions,
    });
  });

  app.post("/api/coaching-sessions", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.ADD_COACHING_SESSIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to add coaching sessions.",
      });
      return;
    }

    const { date, startTime, endTime, availableSlots, topic, summary, venue } =
      req.body ?? {};
    const trimmedTopic = topic?.trim();
    const trimmedSummary = summary?.trim();
    const normalizedVenue = normalizeVenue(venue, "");
    const normalizedAvailableSlots = Number.parseInt(availableSlots, 10);

    if (
      !date ||
      !startTime ||
      !endTime ||
      !trimmedTopic ||
      !trimmedSummary ||
      !normalizedVenue
    ) {
      res.status(400).json({
        success: false,
        message:
          "Date, start time, end time, topic, summary, and venue are required.",
      });
      return;
    }

    if (startTime >= endTime) {
      res.status(400).json({
        success: false,
        message: "End time must be after the session start time.",
      });
      return;
    }

    if (
      !Number.isInteger(normalizedAvailableSlots) ||
      normalizedAvailableSlots < 1
    ) {
      res.status(400).json({
        success: false,
        message: "Available slots must be at least 1.",
      });
      return;
    }

    const conflict = findScheduleConflict({
      date,
      startTime,
      endTime,
      venue: normalizedVenue,
    });

    if (conflict) {
      res.status(409).json({
        success: false,
        message: `This coaching session overlaps ${conflict.title} from ${conflict.startTime} to ${conflict.endTime}.`,
      });
      return;
    }

    const insertResult = insertCoachingSession.run(
      actor.username,
      date,
      startTime,
      endTime,
      normalizedAvailableSlots,
      trimmedTopic,
      trimmedSummary,
      normalizedVenue,
      actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "approved"
        : "pending",
      null,
      actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? actor.username
        : null,
      ...(actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? getUtcTimestampParts()
        : ["", ""]),
      ...getUtcTimestampParts(),
    );
    const session = findCoachingSessionById.get(insertResult.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "Coaching session approved and published successfully."
        : "Coaching session submitted for approval.",
      session: buildCoachingSession(session, [], actor),
    });
  });

  app.post("/api/coaching-sessions/:id/approve", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to approve coaching sessions.",
      });
      return;
    }

    const session = findCoachingSessionById.get(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    if ((session.approval_status ?? "approved") === "approved") {
      res.status(400).json({
        success: false,
        message: "This coaching session has already been approved.",
      });
      return;
    }

    approveCoachingSessionById.run(actor.username, ...getUtcTimestampParts(), session.id);
    const approvedSession = findCoachingSessionById.get(session.id);
    const bookings = listBookingsByCoachingSessionId
      .all(session.id)
      .map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Coaching session approved successfully.",
      session: buildCoachingSession(approvedSession, bookings, actor),
    });
  });

  app.post("/api/coaching-sessions/:id/reject", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to reject coaching sessions.",
      });
      return;
    }

    const session = findCoachingSessionById.get(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    if ((session.approval_status ?? "approved") !== "pending") {
      res.status(400).json({
        success: false,
        message: "Only pending coaching sessions can be rejected.",
      });
      return;
    }

    const rejectionReason =
      typeof req.body?.rejectionReason === "string"
        ? req.body.rejectionReason.trim().slice(0, 280)
        : "";

    rejectCoachingSessionById.run(
      rejectionReason || null,
      actor.username,
      ...getUtcTimestampParts(),
      session.id,
    );
    const rejectedSession = findCoachingSessionById.get(session.id);
    const bookings = listBookingsByCoachingSessionId
      .all(session.id)
      .map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Coaching session request rejected.",
      session: buildCoachingSession(rejectedSession, bookings, actor),
    });
  });

  app.post("/api/coaching-sessions/:id/book", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const session = findCoachingSessionById.get(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    if (hasScheduleEntryEnded(session.session_date, session.end_time)) {
      res.status(400).json({
        success: false,
        message: "You cannot book onto a coaching session that has already finished.",
      });
      return;
    }

    if ((session.approval_status ?? "approved") !== "approved") {
      res.status(400).json({
        success: false,
        message: "This coaching session is still awaiting approval.",
      });
      return;
    }

    try {
      const existingBookings = listBookingsByCoachingSessionId.all(session.id);

      if (existingBookings.length >= session.available_slots) {
        res.status(409).json({
          success: false,
          message: "This coaching session is fully booked.",
        });
        return;
      }

      insertCoachingSessionBooking.run(
        session.id,
        actor.username,
        ...getUtcTimestampParts(),
      );
    } catch (error) {
      if (
        error?.message?.includes(
          "UNIQUE constraint failed: coaching_session_bookings.coaching_session_id, coaching_session_bookings.member_username",
        )
      ) {
        res.status(409).json({
          success: false,
          message: "You are already booked onto this coaching session.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to book onto this coaching session.",
      });
      return;
    }

    const bookings = listBookingsByCoachingSessionId
      .all(session.id)
      .map((booking) => ({
        username: booking.member_username,
        fullName: `${booking.first_name} ${booking.surname}`,
        bookedAt: booking.booked_at,
      }));

    res.json({
      success: true,
      session: buildCoachingSession(session, bookings, actor),
    });
  });

  app.delete("/api/coaching-sessions/:id/booking", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const session = findCoachingSessionById.get(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    const deleteResult = deleteCoachingSessionBooking.run(
      session.id,
      actor.id,
    );

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this coaching session.",
      });
      return;
    }

    const bookings = listBookingsByCoachingSessionId
      .all(session.id)
      .map((booking) => ({
        username: booking.member_username,
        fullName: `${booking.first_name} ${booking.surname}`,
        bookedAt: booking.booked_at,
      }));

    res.json({
      success: true,
      session: buildCoachingSession(session, bookings, actor),
    });
  });

  app.delete("/api/coaching-sessions/:id", (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.ADD_COACHING_SESSIONS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to cancel coaching sessions.",
      });
      return;
    }

    const session = findCoachingSessionById.get(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    if (session.coach_username !== actor.username) {
      res.status(403).json({
        success: false,
        message: "You can only cancel coaching sessions that you created.",
      });
      return;
    }

    deleteBookingsByCoachingSessionId.run(session.id);
    deleteCoachingSessionById.run(session.id);

    res.json({
      success: true,
      message: "Coaching session cancelled successfully.",
      sessionId: session.id,
    });
  });
}
