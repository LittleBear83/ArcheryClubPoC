import { useCallback, useEffect, useMemo, useState } from "react";
import { formatClockTime, formatDate, formatDateTime } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useVisiblePolling } from "../state/useVisiblePolling";

const VENUE_LABELS = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  both: "Indoor and outdoor",
};

function toMinutes(timeValue) {
  if (!timeValue) {
    return null;
  }

  const [hours, minutes] = String(timeValue).split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

function timesOverlap(startA, endA, startB, endB) {
  const normalizedStartA = toMinutes(startA);
  const normalizedEndA = toMinutes(endA);
  const normalizedStartB = toMinutes(startB);
  const normalizedEndB = toMinutes(endB);

  if (
    normalizedStartA === null ||
    normalizedEndA === null ||
    normalizedStartB === null ||
    normalizedEndB === null
  ) {
    return false;
  }

  return normalizedStartA < normalizedEndB && normalizedStartB < normalizedEndA;
}

function isActiveApprovalStatus(item) {
  return ["approved", "pending"].includes(item?.approvalStatus ?? "approved");
}

function normalizeVenue(value) {
  if (value === "indoor" || value === "outdoor" || value === "both") {
    return value;
  }

  return "both";
}

function venuesOverlap(leftVenue, rightVenue) {
  const normalizedLeftVenue = normalizeVenue(leftVenue);
  const normalizedRightVenue = normalizeVenue(rightVenue);

  return (
    normalizedLeftVenue === "both" ||
    normalizedRightVenue === "both" ||
    normalizedLeftVenue === normalizedRightVenue
  );
}

function formatVenueLabel(venue) {
  return VENUE_LABELS[normalizeVenue(venue)] ?? "Indoor and outdoor";
}

function buildConflictWarnings(events, sessions) {
  const activeEvents = events.filter(isActiveApprovalStatus);
  const activeSessions = sessions.filter(isActiveApprovalStatus);
  const warningsByKey = new Map();

  const addWarning = (key, warning) => {
    const currentWarnings = warningsByKey.get(key) ?? [];
    warningsByKey.set(key, [...currentWarnings, warning]);
  };

  for (const event of activeEvents) {
    if (!event.isPendingApproval) {
      continue;
    }

    for (const otherEvent of activeEvents) {
      if (otherEvent.id === event.id || otherEvent.date !== event.date) {
        continue;
      }

      if (
        venuesOverlap(event.venue, otherEvent.venue) &&
        timesOverlap(
          event.startTime,
          event.endTime,
          otherEvent.startTime,
          otherEvent.endTime,
        )
      ) {
        addWarning(`event:${event.id}`, {
          id: `event:${event.id}:event:${otherEvent.id}`,
          text: `Overlaps ${otherEvent.title} (${formatClockTime(otherEvent.startTime)} to ${formatClockTime(otherEvent.endTime)}) on ${formatVenueLabel(otherEvent.venue)} [${otherEvent.approvalStatus}].`,
        });
      }
    }

    for (const session of activeSessions) {
      if (session.date !== event.date) {
        continue;
      }

      if (
        venuesOverlap(event.venue, session.venue) &&
        timesOverlap(
          event.startTime,
          event.endTime,
          session.startTime,
          session.endTime,
        )
      ) {
        addWarning(`event:${event.id}`, {
          id: `event:${event.id}:session:${session.id}`,
          text: `Overlaps coaching session ${session.topic} (${formatClockTime(session.startTime)} to ${formatClockTime(session.endTime)}) on ${formatVenueLabel(session.venue)} [${session.approvalStatus}].`,
        });
      }
    }
  }

  for (const session of activeSessions) {
    if (!session.isPendingApproval) {
      continue;
    }

    for (const event of activeEvents) {
      if (event.date !== session.date) {
        continue;
      }

      if (
        venuesOverlap(session.venue, event.venue) &&
        timesOverlap(
          session.startTime,
          session.endTime,
          event.startTime,
          event.endTime,
        )
      ) {
        addWarning(`session:${session.id}`, {
          id: `session:${session.id}:event:${event.id}`,
          text: `Overlaps ${event.title} (${formatClockTime(event.startTime)} to ${formatClockTime(event.endTime)}) on ${formatVenueLabel(event.venue)} [${event.approvalStatus}].`,
        });
      }
    }

    for (const otherSession of activeSessions) {
      if (
        otherSession.id === session.id ||
        otherSession.date !== session.date ||
        !venuesOverlap(otherSession.venue, session.venue)
      ) {
        continue;
      }

      if (
        timesOverlap(
          session.startTime,
          session.endTime,
          otherSession.startTime,
          otherSession.endTime,
        )
      ) {
        addWarning(`session:${session.id}`, {
          id: `session:${session.id}:session:${otherSession.id}`,
          text: `Overlaps ${otherSession.topic} (${formatClockTime(otherSession.startTime)} to ${formatClockTime(otherSession.endTime)}) on ${formatVenueLabel(otherSession.venue)} [${otherSession.approvalStatus}].`,
        });
      }
    }
  }

  return warningsByKey;
}

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage);
  }

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message ?? fallbackMessage);
  }

  return result;
}

export function ApprovalsPage({ currentUserProfile }) {
  const [allEvents, setAllEvents] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedApprovals, setHasLoadedApprovals] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processingKey, setProcessingKey] = useState("");

  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const canApproveCoaching = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const canApproveAnything = canApproveEvents || canApproveCoaching;

  const loadApprovals = useCallback(async (signal) => {
    if (!canApproveAnything) {
      setAllEvents([]);
      setAllSessions([]);
      setIsLoading(false);
      return;
    }

    if (!hasLoadedApprovals) {
      setIsLoading(true);
    }
    setError("");

    try {
      const headers = buildHeaders(currentUserProfile);
      const [eventResponse, coachingResponse] = await Promise.all([
        canApproveEvents
          ? fetch("/api/events", { headers, cache: "no-store", signal })
          : Promise.resolve(null),
        canApproveCoaching
          ? fetch("/api/coaching-sessions", { headers, cache: "no-store", signal })
          : Promise.resolve(null),
      ]);

      const eventResult = eventResponse
        ? await readJsonResponse(eventResponse, "Unable to load pending events.")
        : { events: [] };
      const coachingResult = coachingResponse
        ? await readJsonResponse(
            coachingResponse,
            "Unable to load pending coaching sessions.",
          )
        : { sessions: [] };

      if (signal?.aborted) {
        return;
      }

      setAllEvents(eventResult.events ?? []);
      setAllSessions(coachingResult.sessions ?? []);
      setHasLoadedApprovals(true);
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [
    canApproveAnything,
    canApproveCoaching,
    canApproveEvents,
    currentUserProfile,
    hasLoadedApprovals,
  ]);

  useVisiblePolling(() => {
    loadApprovals(new AbortController().signal);
  }, {
    enabled: canApproveAnything,
    intervalMs: 60000,
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadApprovals(abortController.signal);

    refresh();
    window.addEventListener("event-data-updated", refresh);
    window.addEventListener("coaching-data-updated", refresh);
    window.addEventListener("profile-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("event-data-updated", refresh);
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [loadApprovals]);

  const events = useMemo(
    () => allEvents.filter((event) => event.isPendingApproval),
    [allEvents],
  );
  const sessions = useMemo(
    () => allSessions.filter((session) => session.isPendingApproval),
    [allSessions],
  );
  const conflictWarningsByKey = useMemo(
    () => buildConflictWarnings(allEvents, allSessions),
    [allEvents, allSessions],
  );
  const pendingCount = useMemo(
    () => events.length + sessions.length,
    [events.length, sessions.length],
  );

  const handleApproveEvent = async (event) => {
    setProcessingKey(`event:approve:${event.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/events/${event.id}/approve`, {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      });
      const result = await readJsonResponse(response, "Unable to approve event.");

      setAllEvents((current) =>
        current.map((entry) => (entry.id === event.id ? result.event : entry)),
      );
      setMessage(result.message ?? `${event.title} approved successfully.`);
      window.dispatchEvent(new Event("event-data-updated"));
    } catch (approvalError) {
      setError(approvalError.message);
    } finally {
      setProcessingKey("");
    }
  };

  const handleRejectEvent = async (event) => {
    setProcessingKey(`event:reject:${event.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/events/${event.id}/reject`, {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      });
      const result = await readJsonResponse(response, "Unable to reject event.");

      setAllEvents((current) =>
        current.map((entry) => (entry.id === event.id ? result.event : entry)),
      );
      setMessage(result.message ?? `${event.title} rejected.`);
      window.dispatchEvent(new Event("event-data-updated"));
    } catch (rejectionError) {
      setError(rejectionError.message);
    } finally {
      setProcessingKey("");
    }
  };

  const handleApproveSession = async (session) => {
    setProcessingKey(`session:approve:${session.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${session.id}/approve`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to approve coaching session.",
      );

      setAllSessions((current) =>
        current.map((entry) =>
          entry.id === session.id ? result.session : entry,
        ),
      );
      setMessage(result.message ?? `${session.topic} approved successfully.`);
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (approvalError) {
      setError(approvalError.message);
    } finally {
      setProcessingKey("");
    }
  };

  const handleRejectSession = async (session) => {
    setProcessingKey(`session:reject:${session.id}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${session.id}/reject`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to reject coaching session.",
      );

      setAllSessions((current) =>
        current.map((entry) =>
          entry.id === session.id ? result.session : entry,
        ),
      );
      setMessage(result.message ?? `${session.topic} rejected.`);
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (rejectionError) {
      setError(rejectionError.message);
    } finally {
      setProcessingKey("");
    }
  };

  if (!canApproveAnything) {
    return <p>You do not have permission to approve events or coaching sessions.</p>;
  }

  return (
    <div className="approvals-page">
      <p>Review submitted events and coaching sessions before they are published to members.</p>
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}
      {isLoading && !hasLoadedApprovals ? <p>Loading approval queue...</p> : null}

      {!isLoading && pendingCount === 0 ? (
        <p>No items are currently waiting for approval.</p>
      ) : null}

      <section className="approvals-layout">
        {canApproveEvents ? (
          <section className="approvals-panel">
            <h3>Pending events</h3>
            {events.length === 0 ? (
              <p>No events are waiting for approval.</p>
            ) : (
              <div className="approvals-list">
                {events.map((event) => (
                  <article key={event.id} className="approvals-card">
                    <p className="approvals-card-title">{event.title}</p>
                    <p>
                      {formatDate(event.date)} from {formatClockTime(event.startTime)} to{" "}
                      {formatClockTime(event.endTime)}
                    </p>
                    <p>Type: {event.type}</p>
                    <p>Venue: {formatVenueLabel(event.venue)}</p>
                    <p>Submitted by: {event.submittedByUsername ?? "Unknown"}</p>
                    {(conflictWarningsByKey.get(`event:${event.id}`) ?? []).length > 0 ? (
                      <div className="approvals-conflict-box">
                        <p className="approvals-conflict-title">
                          Scheduling conflicts found
                        </p>
                        <ul className="approvals-conflict-list">
                          {(conflictWarningsByKey.get(`event:${event.id}`) ?? []).map((warning) => (
                            <li key={warning.id}>{warning.text}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="approvals-card-actions">
                      <button
                        type="button"
                        className="tournament-secondary-button"
                        disabled={Boolean(processingKey)}
                        onClick={() => handleApproveEvent(event)}
                      >
                        {processingKey === `event:approve:${event.id}`
                          ? "Approving..."
                          : "Approve event"}
                      </button>
                      <button
                        type="button"
                        className="approvals-reject-button"
                        disabled={Boolean(processingKey)}
                        onClick={() => handleRejectEvent(event)}
                      >
                        {processingKey === `event:reject:${event.id}`
                          ? "Rejecting..."
                          : "Reject request"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {canApproveCoaching ? (
          <section className="approvals-panel">
            <h3>Pending coaching sessions</h3>
            {sessions.length === 0 ? (
              <p>No coaching sessions are waiting for approval.</p>
            ) : (
              <div className="approvals-list">
                {sessions.map((session) => (
                  <article key={session.id} className="approvals-card">
                    <p className="approvals-card-title">{session.topic}</p>
                    <p>{session.summary}</p>
                    <p>
                      {formatDate(session.date)} from{" "}
                      {formatClockTime(session.startTime)} to{" "}
                      {formatClockTime(session.endTime)}
                    </p>
                    <p>
                      Coach: {session.coach.fullName} ({formatVenueLabel(session.venue)})
                    </p>
                    <p>Slots: {session.availableSlots}</p>
                    {session.createdAt ? (
                      <p>Submitted: {formatDateTime(session.createdAt)}</p>
                    ) : null}
                    {(conflictWarningsByKey.get(`session:${session.id}`) ?? []).length > 0 ? (
                      <div className="approvals-conflict-box">
                        <p className="approvals-conflict-title">
                          Scheduling conflicts found
                        </p>
                        <ul className="approvals-conflict-list">
                          {(conflictWarningsByKey.get(`session:${session.id}`) ?? []).map((warning) => (
                            <li key={warning.id}>{warning.text}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="approvals-card-actions">
                      <button
                        type="button"
                        className="tournament-secondary-button"
                        disabled={Boolean(processingKey)}
                        onClick={() => handleApproveSession(session)}
                      >
                        {processingKey === `session:approve:${session.id}`
                          ? "Approving..."
                          : "Approve session"}
                      </button>
                      <button
                        type="button"
                        className="approvals-reject-button"
                        disabled={Boolean(processingKey)}
                        onClick={() => handleRejectSession(session)}
                      >
                        {processingKey === `session:reject:${session.id}`
                          ? "Rejecting..."
                          : "Reject request"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>
    </div>
  );
}
