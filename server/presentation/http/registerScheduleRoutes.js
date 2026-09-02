import {
  validateCoachingBookingEligibility,
  validateEventBookingEligibility,
} from "../../domain/services/scheduleBookingValidation.js";

export function registerScheduleRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  buildClubEvent,
  buildEventBookingsMap,
  buildCoachingBookingsMap,
  buildCoachingSession,
  canActorViewApprovalEntry,
  findScheduleConflict,
  getActorUser,
  getUtcTimestampParts,
  hasScheduleEntryEnded,
  isLocalPiNode = false,
  normalizeBookingRow,
  normalizeVenue,
  PERMISSIONS,
  scheduleGateway,
  serverEventBus,
}) {
  const ALLOWED_EVENT_TYPES = ["competition", "social", "range-closed"];
  const APPROVAL_PERMISSION_KEYS = [
    PERMISSIONS.APPROVE_EVENTS,
    PERMISSIONS.APPROVE_COACHING_SESSIONS,
    PERMISSIONS.APPROVE_BEGINNERS_COURSES,
    PERMISSIONS.APPROVE_HAVE_A_GO_SESSIONS,
  ];

  const broadcastScheduleUpdates = ({
    includeApprovals = false,
    scope = "schedule",
  } = {}) => {
    const changedAt = new Date().toISOString();

    serverEventBus.broadcastToAll("calendar.updated", {
      changedAt,
      scope,
    });

    if (includeApprovals) {
      serverEventBus.broadcastToAnyPermission(APPROVAL_PERMISSION_KEYS, "approvals.updated", {
        changedAt,
        scope,
      });
    }
  };

  const normalizeEventTypes = (value) => {
    const requestedValues = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? [value]
        : [];

    return [...new Set(
      requestedValues
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => ALLOWED_EVENT_TYPES.includes(entry)),
    )];
  };

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
          types: ["range-closed"],
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
    const {
      date,
      startTime,
      endTime,
      title,
      details,
      type,
      types,
      venue,
    } = req.body ?? {};
    const trimmedTitle = title?.trim();
    const trimmedDetails =
      typeof details === "string" ? details.trim().slice(0, 2000) : "";
    const normalizedVenue = normalizeVenue(venue);
    const normalizedTypes = normalizeEventTypes(types ?? type);

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

    if (!date || !startTime || !endTime || !trimmedTitle || normalizedTypes.length === 0) {
      res.status(400).json({
        success: false,
        message:
          "Date, start time, end time, title, and at least one event type are required.",
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

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const [approvedAtDate, approvedAtTime] = actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
      ? getUtcTimestampParts()
      : ["", ""];
    const event = await scheduleGateway.createClubEvent({
      approvalStatus: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? "approved"
        : "pending",
      approvedAtParts: [approvedAtDate, approvedAtTime],
      approvedByUsername: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? actor.username
        : null,
      createdAtParts: [createdAtDate, createdAtTime],
      date,
      details: trimmedDetails,
      endTime,
      rejectionReason: null,
      startTime,
      submittedByUsername: actor.username,
      title: trimmedTitle,
      type: normalizedTypes[0],
      types: JSON.stringify(normalizedTypes),
      venue: normalizedVenue,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: event,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: event.id,
        entityLabel: event.title,
        entityType: "club_event",
        req,
        statusCode: 201,
        target: `/api/events/${event.id}`,
      }).catch((auditError) => {
        console.error("Failed to record event audit event", auditError);
      });
    }

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
        ? "Event approved and published successfully."
        : "Event submitted for approval.",
      event: buildClubEvent(event, [], actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "events",
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

    const [approvedAtDate, approvedAtTime] = getUtcTimestampParts();
    await scheduleGateway.approveClubEvent({
      actorUsername: actor.username,
      eventId: event.id,
      timestampParts: [approvedAtDate, approvedAtTime],
    });
    const approvedEvent = await scheduleGateway.findClubEventById(event.id);
    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map(normalizeBookingRow);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "approved",
        actorUsername: actor.username,
        after: approvedEvent,
        before: event,
        changedAtDate: approvedAtDate,
        changedAtTime: approvedAtTime,
        entityId: event.id,
        entityLabel: event.title,
        entityType: "club_event",
        req,
        target: `/api/events/${event.id}/approve`,
      }).catch((auditError) => {
        console.error("Failed to record event audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Event approved successfully.",
      event: buildClubEvent(approvedEvent, bookings, actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "events",
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

    const [rejectedAtDate, rejectedAtTime] = getUtcTimestampParts();
    await scheduleGateway.rejectClubEvent({
      actorUsername: actor.username,
      eventId: event.id,
      rejectionReason,
      timestampParts: [rejectedAtDate, rejectedAtTime],
    });
    const rejectedEvent = await scheduleGateway.findClubEventById(event.id);
    const bookings = (await scheduleGateway.listEventBookingsByEventId(event.id)).map(normalizeBookingRow);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "rejected",
        actorUsername: actor.username,
        after: rejectedEvent,
        before: event,
        changedAtDate: rejectedAtDate,
        changedAtTime: rejectedAtTime,
        entityId: event.id,
        entityLabel: event.title,
        entityType: "club_event",
        req,
        target: `/api/events/${event.id}/reject`,
      }).catch((auditError) => {
        console.error("Failed to record event audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Event request rejected.",
      event: buildClubEvent(rejectedEvent, bookings, actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "events",
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
    const eligibilityError = validateEventBookingEligibility({
      event,
      hasScheduleEntryEnded,
      member: actor,
    });

    if (eligibilityError) {
      res.status(eligibilityError.statusCode).json({
        success: false,
        message: eligibilityError.message,
      });
      return;
    }

    try {
      const [bookedAtDate, bookedAtTime] = getUtcTimestampParts();
      if (isLocalPiNode) {
        await scheduleGateway.createEventBookingWithOutbox({
          eventId: event.id,
          eventSyncId: event.sync_id,
          timestampParts: [bookedAtDate, bookedAtTime],
          username: actor.username,
        });
      } else {
        await scheduleGateway.createEventBooking({ eventId: event.id, timestampParts: [bookedAtDate, bookedAtTime], username: actor.username });
      }

      if (auditChangeLogger) {
        void auditChangeLogger.recordEntityChange({
          action: "booked",
          actorUsername: actor.username,
          after: { eventId: event.id, username: actor.username },
          before: null,
          changedAtDate: bookedAtDate,
          changedAtTime: bookedAtTime,
          entityId: `${event.id}:${actor.username}`,
          entityLabel: event.title,
          entityType: "event_booking",
          req,
          target: `/api/events/${event.id}/book`,
        }).catch((auditError) => {
          console.error("Failed to record event booking audit event", auditError);
        });
      }
    } catch (error) {
      if (error?.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
        });
        return;
      }

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

      const statusCode = error?.code === "23505" ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        message:
          statusCode === 409
            ? "You are already booked onto this event."
            : "Unable to book onto this event.",
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

    broadcastScheduleUpdates({
      scope: "event-bookings",
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

    const deleteResult = isLocalPiNode
      ? await scheduleGateway.deleteEventBookingWithOutbox({ eventId: event.id, eventSyncId: event.sync_id, username: actor.username })
      : await scheduleGateway.deleteEventBooking(event.id, actor.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this event.",
      });
      return;
    }

    if (auditChangeLogger) {
      const [withdrawnAtDate, withdrawnAtTime] = getUtcTimestampParts();
      void auditChangeLogger.recordEntityChange({
        action: "withdrawn",
        actorUsername: actor.username,
        after: null,
        before: { eventId: event.id, username: actor.username },
        changedAtDate: withdrawnAtDate,
        changedAtTime: withdrawnAtTime,
        entityId: `${event.id}:${actor.username}`,
        entityLabel: event.title,
        entityType: "event_booking",
        req,
        target: `/api/events/${event.id}/booking`,
      }).catch((auditError) => {
        console.error("Failed to record event booking audit event", auditError);
      });
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

    broadcastScheduleUpdates({
      scope: "event-bookings",
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

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    await scheduleGateway.deleteClubEventCascade(event.id);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: null,
        before: event,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: event.id,
        entityLabel: event.title,
        entityType: "club_event",
        req,
        target: `/api/events/${event.id}`,
      }).catch((auditError) => {
        console.error("Failed to record event audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Event cancelled successfully.",
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "events",
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

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const [approvedAtDate, approvedAtTime] = actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
      ? getUtcTimestampParts()
      : ["", ""];
    const session = await scheduleGateway.createCoachingSession({
      approvalStatus: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "approved"
        : "pending",
      approvedAtParts: [approvedAtDate, approvedAtTime],
      approvedByUsername: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? actor.username
        : null,
      availableSlots: normalizedAvailableSlots,
      coachUsername: actor.username,
      createdAtParts: [createdAtDate, createdAtTime],
      date,
      endTime,
      rejectionReason: null,
      startTime,
      summary: trimmedSummary,
      topic: trimmedTopic,
      venue: normalizedVenue,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: session,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: session.id,
        entityLabel: session.topic,
        entityType: "coaching_session",
        req,
        statusCode: 201,
        target: `/api/coaching-sessions/${session.id}`,
      }).catch((auditError) => {
        console.error("Failed to record coaching session audit event", auditError);
      });
    }

    res.status(201).json({
      success: true,
      message: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
        ? "Coaching session approved and published successfully."
        : "Coaching session submitted for approval.",
      session: buildCoachingSession(session, [], actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "coaching",
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

    const [approvedAtDate, approvedAtTime] = getUtcTimestampParts();
    await scheduleGateway.approveCoachingSession({
      actorUsername: actor.username,
      sessionId: session.id,
      timestampParts: [approvedAtDate, approvedAtTime],
    });
    const approvedSession = await scheduleGateway.findCoachingSessionById(session.id);
    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
      .map(normalizeBookingRow);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "approved",
        actorUsername: actor.username,
        after: approvedSession,
        before: session,
        changedAtDate: approvedAtDate,
        changedAtTime: approvedAtTime,
        entityId: session.id,
        entityLabel: session.topic,
        entityType: "coaching_session",
        req,
        target: `/api/coaching-sessions/${session.id}/approve`,
      }).catch((auditError) => {
        console.error("Failed to record coaching session audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Coaching session approved successfully.",
      session: buildCoachingSession(approvedSession, bookings, actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "coaching",
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

    const [rejectedAtDate, rejectedAtTime] = getUtcTimestampParts();
    await scheduleGateway.rejectCoachingSession({
      actorUsername: actor.username,
      rejectionReason,
      sessionId: session.id,
      timestampParts: [rejectedAtDate, rejectedAtTime],
    });
    const rejectedSession = await scheduleGateway.findCoachingSessionById(session.id);
    const bookings = (await scheduleGateway.listBookingsByCoachingSessionId(session.id))
      .map(normalizeBookingRow);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "rejected",
        actorUsername: actor.username,
        after: rejectedSession,
        before: session,
        changedAtDate: rejectedAtDate,
        changedAtTime: rejectedAtTime,
        entityId: session.id,
        entityLabel: session.topic,
        entityType: "coaching_session",
        req,
        target: `/api/coaching-sessions/${session.id}/reject`,
      }).catch((auditError) => {
        console.error("Failed to record coaching session audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Coaching session request rejected.",
      session: buildCoachingSession(rejectedSession, bookings, actor),
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "coaching",
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
    const eligibilityError = validateCoachingBookingEligibility({
      hasScheduleEntryEnded,
      member: actor,
      session,
    });

    if (eligibilityError) {
      res.status(eligibilityError.statusCode).json({
        success: false,
        message: eligibilityError.message,
      });
      return;
    }

    try {
      const [bookedAtDate, bookedAtTime] = getUtcTimestampParts();
      if (isLocalPiNode) {
        await scheduleGateway.createCoachingSessionBookingWithOutbox({
          sessionId: session.id,
          sessionSyncId: session.sync_id,
          timestampParts: [bookedAtDate, bookedAtTime],
          username: actor.username,
        });
      } else {
        await scheduleGateway.createCoachingSessionBooking({ sessionId: session.id, timestampParts: [bookedAtDate, bookedAtTime], username: actor.username });
      }

      if (auditChangeLogger) {
        void auditChangeLogger.recordEntityChange({
          action: "booked",
          actorUsername: actor.username,
          after: { sessionId: session.id, username: actor.username },
          before: null,
          changedAtDate: bookedAtDate,
          changedAtTime: bookedAtTime,
          entityId: `${session.id}:${actor.username}`,
          entityLabel: session.topic,
          entityType: "coaching_booking",
          req,
          target: `/api/coaching-sessions/${session.id}/book`,
        }).catch((auditError) => {
          console.error("Failed to record coaching booking audit event", auditError);
        });
      }
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

      if (error?.code === "COACHING_SESSION_FULL") {
        res.status(409).json({
          success: false,
          message: "This coaching session is fully booked.",
        });
        return;
      }

      const statusCode = error?.code === "23505" ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        message:
          statusCode === 409
            ? "You are already booked onto this coaching session."
            : "Unable to book onto this coaching session.",
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

    broadcastScheduleUpdates({
      scope: "coaching-bookings",
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

    const deleteResult = isLocalPiNode
      ? await scheduleGateway.deleteCoachingSessionBookingWithOutbox({ sessionId: session.id, sessionSyncId: session.sync_id, username: actor.username })
      : await scheduleGateway.deleteCoachingSessionBooking(session.id, actor.id);

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not booked onto this coaching session.",
      });
      return;
    }

    if (auditChangeLogger) {
      const [withdrawnAtDate, withdrawnAtTime] = getUtcTimestampParts();
      void auditChangeLogger.recordEntityChange({
        action: "withdrawn",
        actorUsername: actor.username,
        after: null,
        before: { sessionId: session.id, username: actor.username },
        changedAtDate: withdrawnAtDate,
        changedAtTime: withdrawnAtTime,
        entityId: `${session.id}:${actor.username}`,
        entityLabel: session.topic,
        entityType: "coaching_booking",
        req,
        target: `/api/coaching-sessions/${session.id}/booking`,
      }).catch((auditError) => {
        console.error("Failed to record coaching booking audit event", auditError);
      });
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

    broadcastScheduleUpdates({
      scope: "coaching-bookings",
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

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    await scheduleGateway.deleteCoachingSessionCascade(session.id);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: null,
        before: session,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: session.id,
        entityLabel: session.topic,
        entityType: "coaching_session",
        req,
        target: `/api/coaching-sessions/${session.id}`,
      }).catch((auditError) => {
        console.error("Failed to record coaching session audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Coaching session cancelled successfully.",
      sessionId: session.id,
    });

    broadcastScheduleUpdates({
      includeApprovals: true,
      scope: "coaching",
    });
  });
}
