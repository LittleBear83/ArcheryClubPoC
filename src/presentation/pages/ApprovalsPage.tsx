import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { formatClockTime, formatDate, formatDateTime } from "../../utils/dateTime";
import { ApprovalCard } from "../components/ApprovalCard";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import {
  approveCoachingSession,
  approveEvent,
  listCoachingSessions,
  listEvents,
  rejectCoachingSession,
  rejectEvent,
} from "../../api/scheduleApi";
import {
  approveBeginnersCourse,
  getBeginnersCoursesDashboard,
  getHaveAGoSessionsDashboard,
  rejectBeginnersCourse,
} from "../../api/beginnersCoursesApi";
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

const approvalsQueryKeys = {
  list: (actorUsername) => ["approvals", actorUsername] as const,
};

type CourseApprovalType = "beginners" | "have-a-go";

type PendingCourseApproval = {
  id: number;
  approvalStatus: string;
  beginnerCapacity: number;
  coordinatorName: string;
  firstLessonDate: string;
  lessonCount: number;
  submittedByName: string;
};

type RejectingCourseApproval = {
  course: PendingCourseApproval;
  courseType: CourseApprovalType;
  itemLabel: string;
};

export function ApprovalsPage({ currentUserProfile }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processingKey, setProcessingKey] = useState("");
  const [rejectingEvent, setRejectingEvent] = useState<ApprovalEvent | null>(null);
  const [eventRejectReason, setEventRejectReason] = useState("");
  const [rejectingSession, setRejectingSession] = useState<CoachingSession | null>(null);
  const [sessionRejectReason, setSessionRejectReason] = useState("");
  const [rejectingCourse, setRejectingCourse] = useState<RejectingCourseApproval | null>(null);
  const [courseRejectReason, setCourseRejectReason] = useState("");

  const currentUser = currentUserProfile as UserProfile | null;
  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const canApproveCoaching = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const canApproveBeginnersCourses = hasPermission(
    currentUserProfile,
    "approve_beginners_courses",
  );
  const canApproveHaveAGoSessions = hasPermission(
    currentUserProfile,
    "approve_have_a_go_sessions",
  );
  const canApproveAnything =
    canApproveEvents ||
    canApproveCoaching ||
    canApproveBeginnersCourses ||
    canApproveHaveAGoSessions;
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const approvalsQuery = useQuery({
    queryKey: approvalsQueryKeys.list(actorUsername),
    queryFn: async () => {
      const [eventResult, coachingResult, beginnersResult, haveAGoResult] = await Promise.all([
        canApproveEvents
          ? listEvents<ApprovalEvent>(currentUserProfile)
          : Promise.resolve({ success: true, events: [] }),
        canApproveCoaching
          ? listCoachingSessions(currentUserProfile)
          : Promise.resolve({ success: true, sessions: [] }),
        canApproveBeginnersCourses
          ? getBeginnersCoursesDashboard(currentUserProfile)
          : Promise.resolve({ success: true, courses: [] }),
        canApproveHaveAGoSessions
          ? getHaveAGoSessionsDashboard(currentUserProfile)
          : Promise.resolve({ success: true, courses: [] }),
      ]);

      return {
        events: eventResult.events ?? [],
        sessions: coachingResult.sessions ?? [],
        beginnersCourses: (beginnersResult.courses ?? []) as PendingCourseApproval[],
        haveAGoSessions: (haveAGoResult.courses ?? []) as PendingCourseApproval[],
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
    window.addEventListener("beginners-course-data-updated", refresh);
    window.addEventListener("have-a-go-session-data-updated", refresh);
    window.addEventListener("profile-data-updated", refresh);

    return () => {
      window.removeEventListener("event-data-updated", refresh);
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("beginners-course-data-updated", refresh);
      window.removeEventListener("have-a-go-session-data-updated", refresh);
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
  const beginnersCourses = useMemo(
    () =>
      (approvalsQuery.data?.beginnersCourses ?? []).filter(
        (course) => course.approvalStatus === "pending",
      ),
    [approvalsQuery.data?.beginnersCourses],
  );
  const haveAGoSessions = useMemo(
    () =>
      (approvalsQuery.data?.haveAGoSessions ?? []).filter(
        (course) => course.approvalStatus === "pending",
      ),
    [approvalsQuery.data?.haveAGoSessions],
  );
  const conflictWarningsByKey = useMemo(
    () => buildConflictWarnings(allEvents, allSessions),
    [allEvents, allSessions],
  );
  const pendingCount =
    events.length + sessions.length + beginnersCourses.length + haveAGoSessions.length;

  const mutateApproval = useMutation({
    mutationFn: async ({
      body,
      action,
      id,
      courseType,
      successMessage,
      eventName,
      processingValue,
    }: {
      body?: { rejectionReason?: string };
      action:
        | "approve-event"
        | "reject-event"
        | "approve-session"
        | "reject-session"
        | "approve-course"
        | "reject-course";
      courseType?: CourseApprovalType;
      id: string | number;
      successMessage: string;
      eventName: string;
      processingValue: string;
    }) => {
      setProcessingKey(processingValue);
      setError("");
      setMessage("");
      if (action === "approve-event") {
        await approveEvent(currentUser, id);
      } else if (action === "reject-event") {
        await rejectEvent(currentUser, id, body?.rejectionReason ?? "");
      } else if (action === "approve-session") {
        await approveCoachingSession(currentUser, id);
      } else if (action === "reject-session") {
        await rejectCoachingSession(currentUser, id, body?.rejectionReason ?? "");
      } else if (action === "approve-course") {
        await approveBeginnersCourse(currentUser, id, courseType);
      } else {
        await rejectBeginnersCourse(currentUser, id, body?.rejectionReason ?? "", courseType);
      }
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
    return <p>You do not have permission to approve submitted items.</p>;
  }

  return (
    <div className="approvals-page">
      <p>Review submitted events, coaching sessions, beginners courses, and Have a Go sessions before they are published to members.</p>
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
                            action: "approve-event",
                            id: event.id,
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
                            action: "approve-session",
                            id: session.id,
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

        {canApproveBeginnersCourses ? (
          <section className="approvals-panel">
            <h3>Pending beginners courses</h3>
            {beginnersCourses.length === 0 ? (
              <p>No beginners courses are waiting for approval.</p>
            ) : (
              <div className="approvals-list">
                {beginnersCourses.map((course) => (
                  <ApprovalCard
                    key={course.id}
                    title={`Beginners course from ${formatDate(course.firstLessonDate)}`}
                    actions={[
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `beginners:approve:${course.id}`
                            ? "Approving..."
                            : "Approve course",
                        onClick: () =>
                          void mutateApproval.mutateAsync({
                            action: "approve-course",
                            courseType: "beginners",
                            id: course.id,
                            successMessage: "Beginners course approved.",
                            eventName: "beginners-course-data-updated",
                            processingValue: `beginners:approve:${course.id}`,
                          }),
                      },
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `beginners:reject:${course.id}`
                            ? "Rejecting..."
                            : "Reject request",
                        onClick: () => {
                          setCourseRejectReason("");
                          setRejectingCourse({
                            course,
                            courseType: "beginners",
                            itemLabel: "beginners course",
                          });
                        },
                        variant: "danger",
                      },
                    ]}
                  >
                    <p>
                      Coordinator: {course.coordinatorName} | Lessons: {course.lessonCount}
                    </p>
                    <p>
                      Places: {course.beginnerCapacity} | Submitted by: {course.submittedByName}
                    </p>
                  </ApprovalCard>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {canApproveHaveAGoSessions ? (
          <section className="approvals-panel">
            <h3>Pending Have a Go sessions</h3>
            {haveAGoSessions.length === 0 ? (
              <p>No Have a Go sessions are waiting for approval.</p>
            ) : (
              <div className="approvals-list">
                {haveAGoSessions.map((session) => (
                  <ApprovalCard
                    key={session.id}
                    title={`Have a Go session from ${formatDate(session.firstLessonDate)}`}
                    actions={[
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `have-a-go:approve:${session.id}`
                            ? "Approving..."
                            : "Approve session",
                        onClick: () =>
                          void mutateApproval.mutateAsync({
                            action: "approve-course",
                            courseType: "have-a-go",
                            id: session.id,
                            successMessage: "Have a Go session approved.",
                            eventName: "have-a-go-session-data-updated",
                            processingValue: `have-a-go:approve:${session.id}`,
                          }),
                      },
                      {
                        disabled: Boolean(processingKey),
                        label:
                          processingKey === `have-a-go:reject:${session.id}`
                            ? "Rejecting..."
                            : "Reject request",
                        onClick: () => {
                          setCourseRejectReason("");
                          setRejectingCourse({
                            course: session,
                            courseType: "have-a-go",
                            itemLabel: "Have a Go session",
                          });
                        },
                        variant: "danger",
                      },
                    ]}
                  >
                    <p>
                      Coordinator: {session.coordinatorName} | Sessions: {session.lessonCount}
                    </p>
                    <p>
                      Places: {session.beginnerCapacity} | Submitted by: {session.submittedByName}
                    </p>
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
                action: "reject-event",
                id: rejectingEvent.id,
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
                action: "reject-session",
                id: rejectingSession.id,
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

      <Modal
        open={Boolean(rejectingCourse)}
        onClose={() => {
          if (!processingKey) {
            setRejectingCourse(null);
            setCourseRejectReason("");
          }
        }}
        title={
          rejectingCourse?.courseType === "have-a-go"
            ? "Reject Have a Go Session"
            : "Reject Beginners Course"
        }
      >
        {rejectingCourse ? (
          <form
            className="left-align-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutateApproval.mutateAsync({
                action: "reject-course",
                courseType: rejectingCourse.courseType,
                id: rejectingCourse.course.id,
                body: {
                  rejectionReason: courseRejectReason,
                },
                successMessage:
                  rejectingCourse.courseType === "have-a-go"
                    ? "Have a Go session rejected."
                    : "Beginners course rejected.",
                eventName:
                  rejectingCourse.courseType === "have-a-go"
                    ? "have-a-go-session-data-updated"
                    : "beginners-course-data-updated",
                processingValue: `${rejectingCourse.courseType}:reject:${rejectingCourse.course.id}`,
              }).then(() => {
                setRejectingCourse(null);
                setCourseRejectReason("");
              });
            }}
          >
            <p>
              Rejecting{" "}
              <strong>
                {rejectingCourse.itemLabel} from{" "}
                {formatDate(rejectingCourse.course.firstLessonDate)}
              </strong>
              .
            </p>
            <label>
              Reason for rejection
              <textarea
                value={courseRejectReason}
                onChange={(event) => setCourseRejectReason(event.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Add a short note for the coordinator."
                disabled={
                  processingKey ===
                  `${rejectingCourse.courseType}:reject:${rejectingCourse.course.id}`
                }
              />
            </label>
            <div className="loan-bow-return-actions">
              <Button
                type="submit"
                variant="danger"
                disabled={
                  processingKey ===
                  `${rejectingCourse.courseType}:reject:${rejectingCourse.course.id}`
                }
              >
                {processingKey ===
                `${rejectingCourse.courseType}:reject:${rejectingCourse.course.id}`
                  ? "Rejecting..."
                  : "Reject request"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRejectingCourse(null);
                  setCourseRejectReason("");
                }}
                disabled={
                  processingKey ===
                  `${rejectingCourse.courseType}:reject:${rejectingCourse.course.id}`
                }
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
