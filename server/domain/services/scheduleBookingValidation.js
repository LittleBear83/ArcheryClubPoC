function normalizeEventTypes(event) {
  if (typeof event?.types === "string" && event.types.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(event.types);

      if (Array.isArray(parsed)) {
        return parsed.filter((value) => typeof value === "string");
      }
    } catch {
      return [event?.type].filter(Boolean);
    }
  }

  return [event?.type].filter(Boolean);
}

function isActiveMember(member) {
  return Boolean(Number(member?.active_member ?? member?.activeMember ?? 0));
}

export function validateEventBookingEligibility({
  event,
  hasScheduleEntryEnded,
  member,
}) {
  if (!event) {
    return {
      code: "event_not_found",
      message: "Event not found.",
      reason: "The event no longer exists.",
      statusCode: 404,
    };
  }

  if (!member || !isActiveMember(member)) {
    return {
      code: "member_not_eligible",
      message: "Only active members can book onto events.",
      reason: "The booking member is no longer eligible.",
      statusCode: 403,
    };
  }

  if (normalizeEventTypes(event).includes("range-closed")) {
    return {
      code: "event_range_closed",
      message: "Range closed entries cannot be booked.",
      reason: "Range closed entries cannot be booked.",
      statusCode: 400,
    };
  }

  if ((event.approval_status ?? "approved") !== "approved") {
    return {
      code: "event_not_bookable",
      message: "This event is still awaiting approval.",
      reason: "The event is not approved for booking.",
      statusCode: 400,
    };
  }

  if (hasScheduleEntryEnded(event.event_date, event.end_time)) {
    return {
      code: "event_ended",
      message: "You cannot book onto an event that has already finished.",
      reason: "The event has already ended.",
      statusCode: 400,
    };
  }

  return null;
}

export function validateCoachingBookingEligibility({
  hasScheduleEntryEnded,
  member,
  session,
}) {
  if (!session) {
    return {
      code: "coaching_session_not_found",
      message: "Coaching session not found.",
      reason: "The coaching session no longer exists.",
      statusCode: 404,
    };
  }

  if (!member || !isActiveMember(member)) {
    return {
      code: "member_not_eligible",
      message: "Only active members can book onto coaching sessions.",
      reason: "The booking member is no longer eligible.",
      statusCode: 403,
    };
  }

  if ((session.approval_status ?? "approved") !== "approved") {
    return {
      code: "coaching_session_not_bookable",
      message: "This coaching session is still awaiting approval.",
      reason: "The coaching session is not approved for booking.",
      statusCode: 400,
    };
  }

  if (hasScheduleEntryEnded(session.session_date, session.end_time)) {
    return {
      code: "coaching_session_ended",
      message: "You cannot book onto a coaching session that has already finished.",
      reason: "The coaching session has already ended.",
      statusCode: 400,
    };
  }

  return null;
}
