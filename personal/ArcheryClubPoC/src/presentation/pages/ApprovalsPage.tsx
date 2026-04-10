import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatClockTime, formatDate, formatDateTime } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

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

const approvalsQueryKeys = {
  list: (actorUsername) => ["approvals", actorUsername] as const,
};

export function ApprovalsPage({ currentUserProfile }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processingKey, setProcessingKey] = useState("");

  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const canApproveCoaching = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const canApproveAnything = canApproveEvents || canApproveCoaching;
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const approvalsQuery = useQuery({
    queryKey: approvalsQueryKeys.list(actorUsername),
    queryFn: async () => {
      const headers = buildHeaders(currentUserProfile);
      const [eventResult, coachingResult] = await Promise.all([
        canApproveEvents
          ? fetchApi<{ success: true; events?: any[] }>("/api/events", {
              headers,
              cache: "no-store",
            })
          : Promise.resolve({ success: true, events: [] }),
        canApproveCoaching
          ? fetchApi<{ success: true; sessions?: any[] }>("/api/coaching-sessions", {
              headers,
              cache: "no-store",
            })
          : Promise.resolve({ success: true, sessions: [] }),
      ]);

      return {
        events: eventResult.events ?? [],
        sessions: coachingResult.sessions ?? [],
      };
    },
    enabled: canApproveAnything,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!canApproveAnything) {
      return undefined;
    }

    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: approvalsQueryKeys.list(actorUsername),
      });
    };

    window.addEventListener("event-data-updated", refresh);
    window.addEventListener("coaching-data-updated", refresh);
    window.addEventListener("profile-data-updated", refresh);

    return () => {
      window.removeEventListener("event-data-updated", refresh);
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [actorUsername, canApproveAnything, queryClient]);

  const allEvents = useMemo(
    () => approvalsQuery.data?.events ?? [],
    [approvalsQuery.data?.events],
  );
  const allSessions = useMemo(
    () => approvalsQuery.data?.sessions ?? [],
    [approvalsQuery.data?.sessions],
  );
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
  const pendingCount = events.length + sessions.length;

  const mutateApproval = useMutation({
    mutationFn: async ({
      url,
      successMessage,
      eventName,
      processingValue,
    }: {
      url: string;
      successMessage: string;
      eventName: string;
      processingValue: string;
    }) => {
      setProcessingKey(processingValue);
      setError("");
      setMessage("");
      await fetchApi<{ success: true; message?: string }>(url, {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      });
      return { successMessage, eventName };
    },
    onSuccess: async ({ successMessage, eventName }) => {
      await queryClient.invalidateQueries({
        queryKey: approvalsQueryKeys.list(actorUsername),
      });
      setMessage(successMessage);
      window.dispatchEvent(new Event(eventName));
    },
    onError: (approvalError: Error) => {
      setError(approvalError.message);
    },
    onSettled: () => {
      setProcessingKey("");
    },
  });

  if (!canApproveAnything) {
    return <p>You do not have permission to approve events or coaching sessions.</p>;
  }

  return (
    <div className="approvals-page">
      <p>Review submitted events and coaching sessions before they are published to members.</p>
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}
      {approvalsQuery.isLoading ? <p>Loading approval queue...</p> : null}

      {!approvalsQuery.isLoading && pendingCount === 0 ? (
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
                        onClick={() =>
                          void mutateApproval.mutateAsync({
                            url: `/api/events/${event.id}/approve`,
                            successMessage: `${event.title} approved successfully.`,
                            eventName: "event-data-updated",
                            processingValue: `event:approve:${event.id}`,
                          })
                        }
                      >
                        {processingKey === `event:approve:${event.id}`
                          ? "Approving..."
                          : "Approve event"}
                      </button>
                      <button
                        type="button"
                        className="approvals-reject-button"
                        disabled={Boolean(processingKey)}
                        onClick={() =>
                          void mutateApproval.mutateAsync({
                            url: `/api/events/${event.id}/reject`,
                            successMessage: `${event.title} rejected.`,
                            eventName: "event-data-updated",
                            processingValue: `event:reject:${event.id}`,
                          })
                        }
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
                        onClick={() =>
                          void mutateApproval.mutateAsync({
                            url: `/api/coaching-sessions/${session.id}/approve`,
                            successMessage: `${session.topic} approved successfully.`,
                            eventName: "coaching-data-updated",
                            processingValue: `session:approve:${session.id}`,
                          })
                        }
                      >
                        {processingKey === `session:approve:${session.id}`
                          ? "Approving..."
                          : "Approve session"}
                      </button>
                      <button
                        type="button"
                        className="approvals-reject-button"
                        disabled={Boolean(processingKey)}
                        onClick={() =>
                          void mutateApproval.mutateAsync({
                            url: `/api/coaching-sessions/${session.id}/reject`,
                            successMessage: `${session.topic} rejected.`,
                            eventName: "coaching-data-updated",
                            processingValue: `session:reject:${session.id}`,
                          })
                        }
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
