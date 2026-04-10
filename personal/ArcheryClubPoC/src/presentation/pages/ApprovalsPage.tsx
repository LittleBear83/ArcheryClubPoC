import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { formatClockTime, formatDate, formatDateTime } from "../../utils/dateTime";
import { ApprovalCard } from "../components/ApprovalCard";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";
import type { ApprovalEvent, CoachingSession, UserProfile } from "../../types/app";

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

function buildConflictWarnings(
  events: ApprovalEvent[],
  sessions: CoachingSession[],
) {
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
  const [rejectingEvent, setRejectingEvent] = useState<ApprovalEvent | null>(null);
  const [eventRejectReason, setEventRejectReason] = useState("");
  const [rejectingSession, setRejectingSession] = useState<CoachingSession | null>(null);
  const [sessionRejectReason, setSessionRejectReason] = useState("");

  const currentUser = currentUserProfile as UserProfile | null;
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
          ? fetchApi<{ success: true; events?: ApprovalEvent[] }>("/api/events", {
              headers,
              cache: "no-store",
            })
          : Promise.resolve({ success: true, events: [] }),
        canApproveCoaching
          ? fetchApi<{ success: true; sessions?: CoachingSession[] }>(
              "/api/coaching-sessions",
              {
                headers,
                cache: "no-store",
              },
            )
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
      body,
      url,
      successMessage,
      eventName,
      processingValue,
    }: {
      body?: unknown;
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
        headers: buildHeaders(currentUser),
        cache: "no-store",
        body: body ? JSON.stringify(body) : undefined,
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
      <StatusMessagePanel
        error={error}
        loading={approvalsQuery.isLoading}
        loadingLabel="Loading approval queue..."
        success={message}
      />

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
                  <ApprovalCard
                    key={event.id}
                    title={event.title}
                    conflictWarnings={conflictWarningsByKey.get(`event:${event.id}`) ?? []}
                    actions={[
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `event:approve:${event.id}`
                            ? "Approving..."
                            : "Approve event",
                        onClick: () =>
                          void mutateApproval.mutateAsync({
                            url: `/api/events/${event.id}/approve`,
                            successMessage: `${event.title} approved successfully.`,
                            eventName: "event-data-updated",
                            processingValue: `event:approve:${event.id}`,
                          }),
                      },
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `event:reject:${event.id}`
                            ? "Rejecting..."
                            : "Reject request",
                        onClick: () => {
                          setEventRejectReason("");
                          setRejectingEvent(event);
                        },
                        variant: "danger",
                      },
                    ]}
                  >
                    <p>
                      {formatDate(event.date)} from {formatClockTime(event.startTime)} to{" "}
                      {formatClockTime(event.endTime)}
                    </p>
                    <p>Type: {event.type}</p>
                    <p>Venue: {formatVenueLabel(event.venue)}</p>
                    <p>Submitted by: {event.submittedByUsername ?? "Unknown"}</p>
                  </ApprovalCard>
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
                  <ApprovalCard
                    key={session.id}
                    title={session.topic}
                    conflictWarnings={conflictWarningsByKey.get(`session:${session.id}`) ?? []}
                    actions={[
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `session:approve:${session.id}`
                            ? "Approving..."
                            : "Approve session",
                        onClick: () =>
                          void mutateApproval.mutateAsync({
                            url: `/api/coaching-sessions/${session.id}/approve`,
                            successMessage: `${session.topic} approved successfully.`,
                            eventName: "coaching-data-updated",
                            processingValue: `session:approve:${session.id}`,
                          }),
                      },
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `session:reject:${session.id}`
                            ? "Rejecting..."
                            : "Reject request",
                        onClick: () => {
                          setSessionRejectReason("");
                          setRejectingSession(session);
                        },
                        variant: "danger",
                      },
                    ]}
                  >
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
                  </ApprovalCard>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>

      <Modal
        open={Boolean(rejectingEvent)}
        onClose={() => {
          if (!processingKey) {
            setRejectingEvent(null);
            setEventRejectReason("");
          }
        }}
        title="Reject Event Request"
      >
        {rejectingEvent ? (
          <form
            className="left-align-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutateApproval.mutateAsync({
                url: `/api/events/${rejectingEvent.id}/reject`,
                body: {
                  rejectionReason: eventRejectReason,
                },
                successMessage: `${rejectingEvent.title} rejected.`,
                eventName: "event-data-updated",
                processingValue: `event:reject:${rejectingEvent.id}`,
              }).then(() => {
                setRejectingEvent(null);
                setEventRejectReason("");
              });
            }}
          >
            <p>
              Rejecting <strong>{rejectingEvent.title}</strong>.
            </p>
            <label>
              Reason for rejection (optional)
              <textarea
                value={eventRejectReason}
                onChange={(event) => setEventRejectReason(event.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Add a short note for the member."
                disabled={processingKey === `event:reject:${rejectingEvent.id}`}
              />
            </label>
            <div className="loan-bow-return-actions">
              <Button
                type="submit"
                variant="danger"
                disabled={processingKey === `event:reject:${rejectingEvent.id}`}
              >
                {processingKey === `event:reject:${rejectingEvent.id}`
                  ? "Rejecting..."
                  : "Reject event"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRejectingEvent(null);
                  setEventRejectReason("");
                }}
                disabled={processingKey === `event:reject:${rejectingEvent.id}`}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rejectingSession)}
        onClose={() => {
          if (!processingKey) {
            setRejectingSession(null);
            setSessionRejectReason("");
          }
        }}
        title="Reject Coaching Session"
      >
        {rejectingSession ? (
          <form
            className="left-align-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutateApproval.mutateAsync({
                url: `/api/coaching-sessions/${rejectingSession.id}/reject`,
                body: {
                  rejectionReason: sessionRejectReason,
                },
                successMessage: `${rejectingSession.topic} rejected.`,
                eventName: "coaching-data-updated",
                processingValue: `session:reject:${rejectingSession.id}`,
              }).then(() => {
                setRejectingSession(null);
                setSessionRejectReason("");
              });
            }}
          >
            <p>
              Rejecting <strong>{rejectingSession.topic}</strong>.
            </p>
            <label>
              Reason for rejection (optional)
              <textarea
                value={sessionRejectReason}
                onChange={(event) => setSessionRejectReason(event.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Add a short note for the coach/member."
                disabled={processingKey === `session:reject:${rejectingSession.id}`}
              />
            </label>
            <div className="loan-bow-return-actions">
              <Button
                type="submit"
                variant="danger"
                disabled={processingKey === `session:reject:${rejectingSession.id}`}
              >
                {processingKey === `session:reject:${rejectingSession.id}`
                  ? "Rejecting..."
                  : "Reject session"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRejectingSession(null);
                  setSessionRejectReason("");
                }}
                disabled={processingKey === `session:reject:${rejectingSession.id}`}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
