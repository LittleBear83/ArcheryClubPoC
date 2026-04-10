import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function hasSessionEnded(session) {
  if (!session?.date || !session?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(session.endTime)
    ? `${session.endTime}:00`
    : session.endTime;
  const sessionEnd = new Date(`${session.date}T${normalizedEndTime}`);

  if (Number.isNaN(sessionEnd.getTime())) {
    return false;
  }

  return sessionEnd.getTime() <= Date.now();
}

function TrainingIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 12h10m0 0-3.2-3.2M14 12l-3.2 3.2M14 12h4m0 0 2-2m-2 2 2 2M8.2 5.6A8 8 0 0 1 8.2 18.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

const VENUE_OPTIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "both", label: "Indoor and outdoor" },
];

function getVenueLabel(venue) {
  return (
    VENUE_OPTIONS.find((option) => option.value === venue)?.label ??
    "Indoor and outdoor"
  );
}

const coachingQueryKeys = {
  list: (actorUsername) => ["coaching-sessions", actorUsername] as const,
};

export function CoachingCalendarPage({ currentUserProfile }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    topic: "",
    summary: "",
    venue: "indoor",
    date: today.toISOString().slice(0, 10),
    startTime: "18:00",
    endTime: "19:00",
    availableSlots: 4,
  });

  const canManageCoachingSessions = hasPermission(
    currentUserProfile,
    "add_coaching_sessions",
  );
  const canApproveSessions = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: coachingQueryKeys.list(actorUsername),
    queryFn: async () => {
      const result = await fetchApi<{ success: true; sessions?: any[] }>(
        "/api/coaching-sessions",
        {
          headers: actorUsername
            ? { "x-actor-username": actorUsername }
            : undefined,
          cache: "no-store",
        },
      );

      return result.sessions ?? [];
    },
    enabled: Boolean(actorUsername),
    refetchInterval: 60000,
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: coachingQueryKeys.list(actorUsername),
      });
    };

    window.addEventListener("coaching-data-updated", refresh);
    window.addEventListener("member-bookings-updated", refresh);

    return () => {
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("member-bookings-updated", refresh);
    };
  }, [actorUsername, queryClient]);

  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );
  const sessionsByDate = useMemo(
    () =>
      sessions.reduce<Record<string, any[]>>((acc, session) => {
        (acc[session.date] = acc[session.date] || []).push(session);
        return acc;
      }, {}),
    [sessions],
  );

  const selectedSessions = useMemo(
    () => (selectedDate ? sessionsByDate[selectedDate] || [] : []),
    [selectedDate, sessionsByDate],
  );
  const effectiveSelectedSessionId =
    selectedSessions.some((session) => session.id === selectedSessionId)
      ? selectedSessionId
      : selectedSessions[0]?.id ?? null;
  const selectedSession =
    selectedSessions.find((session) => session.id === effectiveSelectedSessionId) ??
    null;

  const sessionMutation = useMutation({
    mutationFn: async ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body?: Record<string, unknown>;
    }) =>
      fetchApi<{ success: true; session?: any; message?: string }>(url, {
        method,
        headers: buildHeaders(currentUserProfile),
        body: body ? JSON.stringify(body) : undefined,
      }),
    onMutate: () => {
      setError("");
      setFeedbackMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: coachingQueryKeys.list(actorUsername),
      });
      if (result.session?.date) {
        setSelectedDate(result.session.date);
        setSelectedSessionId(result.session.id);
      }
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  return (
    <div className="event-calendar-page">
      <p>Coaching sessions created by coaches are listed here for members to book onto.</p>
      {error ? <p className="profile-error">{error}</p> : null}
      {feedbackMessage ? <p className="profile-success">{feedbackMessage}</p> : null}
      {sessionsQuery.isLoading ? <p>Loading coaching sessions...</p> : null}

      {sessionsQuery.data ? (
        <section className="event-calendar-layout event-calendar-layout-expanded">
          <div className="event-calendar-main">
            <div className="event-calendar-key" aria-label="Coaching type key">
              <span className="event-key-item coaching-key-item">
                <span className="coaching-key-icon-wrap">
                  <TrainingIcon className="coaching-key-icon" />
                </span>
                Archery training
              </span>
            </div>
            <Calendar
              year={year}
              month={month}
              selectedDate={selectedDate}
              onDayClick={(dateString) => {
                setSelectedDate(dateString);
                setFeedbackMessage("");
              }}
              onPrevMonth={() => {
                if (month === 0) {
                  setMonth(11);
                  setYear((current) => current - 1);
                } else {
                  setMonth((current) => current - 1);
                }
              }}
              onNextMonth={() => {
                if (month === 11) {
                  setMonth(0);
                  setYear((current) => current + 1);
                } else {
                  setMonth((current) => current + 1);
                }
              }}
              itemsByDate={sessionsByDate}
              renderDayMeta={() => (
                <span className="calendar-day-key-markers" aria-hidden="true">
                  <span className="coaching-day-key-icon-wrap">
                    <TrainingIcon className="coaching-day-key-icon" />
                  </span>
                </span>
              )}
            />
          </div>

          <aside className="event-summary-panel">
            <h3>Coaching session summary</h3>
            {!selectedDate ? (
              <p>Select a date on the calendar to view coaching sessions.</p>
            ) : selectedSessions.length === 0 ? (
              <>
                <p className="event-summary-date">
                  <strong>{formatDate(selectedDate)}</strong>
                </p>
                <p>No coaching sessions are scheduled for this date.</p>
              </>
            ) : (
              <>
                <p className="event-summary-date">
                  <strong>{formatDate(selectedDate)}</strong>
                </p>
                <label className="profile-member-select">
                  Session
                  <select
                    value={effectiveSelectedSessionId ?? ""}
                    onChange={(event) => setSelectedSessionId(Number(event.target.value))}
                  >
                    {selectedSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {formatClockTime(session.startTime)} - {session.topic}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSession ? (
                  <>
                    <p className="coaching-summary-heading">
                      <span className="coaching-session-badge">
                        <TrainingIcon className="coaching-badge-icon" />
                        Archery training
                      </span>
                    </p>
                    <p>
                      <strong>{selectedSession.topic}</strong>
                    </p>
                    <p>{selectedSession.summary}</p>
                    <p>
                      {formatClockTime(selectedSession.startTime)} to{" "}
                      {formatClockTime(selectedSession.endTime)} -{" "}
                      {getVenueLabel(selectedSession.venue)}
                    </p>
                    <p>Coach: {selectedSession.coach.fullName}</p>
                    <p>
                      {selectedSession.bookingCount} of {selectedSession.availableSlots} slot
                      {selectedSession.availableSlots === 1 ? "" : "s"} booked.
                    </p>
                    {selectedSession.isPendingApproval ? (
                      <p>This coaching session is awaiting approval.</p>
                    ) : null}
                    {selectedSession.isRejected ? (
                      <p>This coaching session request was rejected.</p>
                    ) : null}
                    {selectedSession.canApprove ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          void sessionMutation.mutateAsync({
                            url: `/api/coaching-sessions/${selectedSession.id}/approve`,
                            method: "POST",
                          }).then((result) => {
                            setFeedbackMessage(
                              result.message ?? `${selectedSession.topic} approved successfully.`,
                            );
                            window.dispatchEvent(new Event("coaching-data-updated"));
                          })
                        }
                      >
                        Approve session
                      </button>
                    ) : null}
                    {!selectedSession.isBookedOn && hasSessionEnded(selectedSession) ? (
                      <p>This coaching session has finished.</p>
                    ) : null}

                    {canManageCoachingSessions &&
                    selectedSession.coach.username === actorUsername ? (
                      <>
                        <h4>Booked Members</h4>
                        {selectedSession.bookings.length > 0 ? (
                          <ul className="event-summary-list">
                            {selectedSession.bookings.map((booking) => (
                              <li key={booking.username}>{booking.fullName}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No members have booked onto this session yet.</p>
                        )}
                        <button
                          type="button"
                          className="event-cancel-button"
                          onClick={() =>
                            void sessionMutation.mutateAsync({
                              url: `/api/coaching-sessions/${selectedSession.id}`,
                              method: "DELETE",
                            }).then(() => {
                              setFeedbackMessage("Coaching session cancelled successfully.");
                              window.dispatchEvent(new Event("member-bookings-updated"));
                              window.dispatchEvent(new Event("coaching-data-updated"));
                            })
                          }
                        >
                          Cancel session
                        </button>
                      </>
                    ) : (
                      <>
                        {selectedSession.isBookedOn ? (
                          <button
                            type="button"
                            className="event-cancel-button"
                            onClick={() =>
                              void sessionMutation.mutateAsync({
                                url: `/api/coaching-sessions/${selectedSession.id}/booking`,
                                method: "DELETE",
                              }).then((result) => {
                                setFeedbackMessage(
                                  `Withdrawn from ${result.session.topic} on ${formatDate(result.session.date)}.`,
                                );
                                window.dispatchEvent(new Event("member-bookings-updated"));
                                window.dispatchEvent(new Event("coaching-data-updated"));
                              })
                            }
                          >
                            Withdraw from session
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="event-book-button"
                            disabled={
                              !selectedSession.isApproved ||
                              selectedSession.remainingSlots <= 0 ||
                              hasSessionEnded(selectedSession)
                            }
                            onClick={() =>
                              void sessionMutation.mutateAsync({
                                url: `/api/coaching-sessions/${selectedSession.id}/book`,
                                method: "POST",
                              }).then((result) => {
                                setFeedbackMessage(
                                  `Booked onto ${result.session.topic} on ${formatDate(result.session.date)}.`,
                                );
                                window.dispatchEvent(new Event("member-bookings-updated"));
                                window.dispatchEvent(new Event("coaching-data-updated"));
                              })
                            }
                          >
                            {selectedSession.isRejected
                              ? "Request rejected"
                              : !selectedSession.isApproved
                              ? "Awaiting approval"
                              : hasSessionEnded(selectedSession)
                              ? "Booking closed"
                              : selectedSession.remainingSlots <= 0
                              ? "Session full"
                              : "Book on"}
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : null}
              </>
            )}
          </aside>
        </section>
      ) : null}

      {canManageCoachingSessions ? (
        <>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{ marginBottom: "12px" }}
          >
            Add coaching session
          </button>

          <Modal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Add Coaching Session"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sessionMutation.mutateAsync({
                  url: "/api/coaching-sessions",
                  method: "POST",
                  body: form,
                }).then((result) => {
                  setFeedbackMessage(
                    result.message ?? "Coaching session added successfully.",
                  );
                  setForm({
                    topic: "",
                    summary: "",
                    venue: "indoor",
                    date: today.toISOString().slice(0, 10),
                    startTime: "18:00",
                    endTime: "19:00",
                    availableSlots: 4,
                  });
                  setIsModalOpen(false);
                  window.dispatchEvent(new Event("coaching-data-updated"));
                });
              }}
              className="left-align-form"
            >
              <label>
                Session Topic
                <input
                  value={form.topic}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, topic: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Session Summary
                <textarea
                  value={form.summary}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      summary: event.target.value,
                    }))
                  }
                  rows={4}
                  required
                />
              </label>
              <label>
                Venue
                <select
                  value={form.venue}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, venue: event.target.value }))
                  }
                >
                  {VENUE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Coaching Date
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, date: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Start time
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endTime: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Available slots
                <input
                  type="number"
                  min="1"
                  value={form.availableSlots}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      availableSlots: Math.max(
                        1,
                        Number.parseInt(event.target.value, 10) || 1,
                      ),
                    }))
                  }
                  required
                />
              </label>
              <button type="submit">
                {canApproveSessions ? "Add session" : "Submit For Approval"}
              </button>
            </form>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
