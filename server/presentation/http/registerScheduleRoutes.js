export function registerScheduleRoutes({
  actorHasPermission,
  app,
  buildClubEvent,
  buildEventBookingsMap,
  buildCoachingBookingsMap,
  buildCoachingSession,
  canActorViewApprovalEntry,
  findScheduleConflict,
  getActorUser,
  getUtcTimestampParts,
  hasScheduleEntryEnded,
  normalizeBookingRow,
  normalizeVenue,
  PERMISSIONS,
  scheduleGateway,
}) {
  app.get("/api/events", async (req, res) => {
    const actor = getActorUser(req);
    const bookingsByEventId = await buildEventBookingsMap();
    const persistedEvents = (await scheduleGateway.listClubEvents())
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

  app.post("/api/events", async (req, res) => {
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

    const conflict = await findScheduleConflict({
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

    const event = await scheduleGateway.createClubEvent({
      approvalStatus: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? "approved"
        : "pending",
      approvedAtParts: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? getUtcTimestampParts()
        : ["", ""],
      approvedByUsername: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? actor.username
        : null,
      createdAtParts: getUtcTimestampParts(),
      date,
      details: trimmedDetails,
      endTime,
      rejectionReason: null,
      startTime,
      submittedByUsername: actor.username,
      title: trimmedTitle,
      type,
      venue: normalizedVenue,
    });

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? "Event approved and published successfully."
        : "Event submitted for approval.",
      event: buildClubEvent(event, [], actor),
    });
  });

  app.post("/api/events/:id/approve", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to approve events.",
      });
      return;
    }

    const event = await scheduleGateway.findClubEventById(req.params.id);

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

    await scheduleGateway.approveClubEvent({
      actorUsername: actor.username,
      eventId: event.id,
      timestampParts: getUtcTimestampParts(),
    });
    const approvedEvent = await scheduleGateway.findClubEventById(event.id);
    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Event approved successfully.",
      event: buildClubEvent(approvedEvent, bookings, actor),
    });
  });

  app.post("/api/events/:id/reject", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to reject events.",
      });
      return;
    }

    const event = await scheduleGateway.findClubEventById(req.params.id);

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

    await scheduleGateway.rejectClubEvent({
      actorUsername: actor.username,
      eventId: event.id,
      rejectionReason,
      timestampParts: getUtcTimestampParts(),
    });
    const rejectedEvent = await scheduleGateway.findClubEventById(event.id);
    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Event request rejected.",
      event: buildClubEvent(rejectedEvent, bookings, actor),
    });
  });

  app.post("/api/events/:id/book", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const event = await scheduleGateway.findClubEventById(req.params.id);

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
      await scheduleGateway.createEventBooking({
        eventId: event.id,
        timestampParts: getUtcTimestampParts(),
        username: actor.username,
      });
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

    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

    res.json({
      success: true,
      event: buildClubEvent(event, bookings, actor),
    });
  });

  app.delete("/api/events/:id/booking", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const event = await scheduleGateway.findClubEventById(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    const deleteResult = await scheduleGateway.deleteEventBooking(event.id, actor.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this event.",
      });
      return;
    }

    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

    res.json({
      success: true,
      event: buildClubEvent(event, bookings, actor),
    });
  });

  app.delete("/api/events/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.CANCEL_EVENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to cancel events.",
      });
      return;
    }

    const event = await scheduleGateway.findClubEventById(req.params.id);

    if (!event) {
      res.status(404).json({
        success: false,
        message: "Event not found.",
      });
      return;
    }

    await scheduleGateway.deleteClubEventCascade(event.id);

    res.json({
      success: true,
      message: "Event cancelled successfully.",
    });
  });

  app.get("/api/coaching-sessions", async (req, res) => {
    const actor = getActorUser(req);
    const coachingBookingsBySessionId = await buildCoachingBookingsMap();
    const sessions = (await scheduleGateway.listCoachingSessions())
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

  app.post("/api/coaching-sessions", async (req, res) => {
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

    const conflict = await findScheduleConflict({
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

    const session = await scheduleGateway.createCoachingSession({
      approvalStatus: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "approved"
        : "pending",
      approvedAtParts: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? getUtcTimestampParts()
        : ["", ""],
      approvedByUsername: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? actor.username
        : null,
      availableSlots: normalizedAvailableSlots,
      coachUsername: actor.username,
      createdAtParts: getUtcTimestampParts(),
      date,
      endTime,
      rejectionReason: null,
      startTime,
      summary: trimmedSummary,
      topic: trimmedTopic,
      venue: normalizedVenue,
    });

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "Coaching session approved and published successfully."
        : "Coaching session submitted for approval.",
      session: buildCoachingSession(session, [], actor),
    });
  });

  app.post("/api/coaching-sessions/:id/approve", async (req, res) => {
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

    const session = await scheduleGateway.findCoachingSessionById(req.params.id);

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

    await scheduleGateway.approveCoachingSession({
      actorUsername: actor.username,
      sessionId: session.id,
      timestampParts: getUtcTimestampParts(),
    });
    const approvedSession = await scheduleGateway.findCoachingSessionById(session.id);
    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
      .map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Coaching session approved successfully.",
      session: buildCoachingSession(approvedSession, bookings, actor),
    });
  });

  app.post("/api/coaching-sessions/:id/reject", async (req, res) => {
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

    const session = await scheduleGateway.findCoachingSessionById(req.params.id);

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

    await scheduleGateway.rejectCoachingSession({
      actorUsername: actor.username,
      rejectionReason,
      sessionId: session.id,
      timestampParts: getUtcTimestampParts(),
    });
    const rejectedSession = await scheduleGateway.findCoachingSessionById(session.id);
    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
      .map(normalizeBookingRow);

    res.json({
      success: true,
      message: "Coaching session request rejected.",
      session: buildCoachingSession(rejectedSession, bookings, actor),
    });
  });

  app.post("/api/coaching-sessions/:id/book", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const session = await scheduleGateway.findCoachingSessionById(req.params.id);

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
      const existingBookings = await scheduleGateway.listBookingsByCoachingSessionId(session.id);

      if (existingBookings.length >= session.available_slots) {
        res.status(409).json({
          success: false,
          message: "This coaching session is fully booked.",
        });
        return;
      }

      await scheduleGateway.createCoachingSessionBooking({
        sessionId: session.id,
        timestampParts: getUtcTimestampParts(),
        username: actor.username,
      });
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

    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
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

  app.delete("/api/coaching-sessions/:id/booking", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const session = await scheduleGateway.findCoachingSessionById(req.params.id);

    if (!session) {
      res.status(404).json({
        success: false,
        message: "Coaching session not found.",
      });
      return;
    }

    const deleteResult = await scheduleGateway.deleteCoachingSessionBooking(session.id, actor.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this coaching session.",
      });
      return;
    }

    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
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

  app.delete("/api/coaching-sessions/:id", async (req, res) => {
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

    const session = await scheduleGateway.findCoachingSessionById(req.params.id);

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

    await scheduleGateway.deleteCoachingSessionCascade(session.id);

    res.json({
      success: true,
      message: "Coaching session cancelled successfully.",
      sessionId: session.id,
    });
  });
}
