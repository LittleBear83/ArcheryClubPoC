import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useVisiblePolling } from "../state/useVisiblePolling";

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

async function parseApiResponse(response, fallbackMessage) {
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

export function CoachingCalendarPage({ currentUserProfile }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedSessions, setHasLoadedSessions] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [error, setError] = useState("");
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isBookingSession, setIsBookingSession] = useState(false);
  const [isLeavingSession, setIsLeavingSession] = useState(false);
  const [isCancellingSession, setIsCancellingSession] = useState(false);
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

  const loadSessions = useCallback(async (signal) => {
    if (!hasLoadedSessions) {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/coaching-sessions", {
        headers: actorUsername
          ? { "x-actor-username": actorUsername }
          : undefined,
        cache: "no-store",
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load coaching sessions.");
      }

      if (signal?.aborted) {
        return;
      }

      setSessions(result.sessions ?? []);
      setHasLoadedSessions(true);
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [actorUsername, hasLoadedSessions]);

  useVisiblePolling(() => {
    loadSessions(new AbortController().signal);
  }, {
    enabled: true,
    intervalMs: 60000,
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadSessions(abortController.signal);

    window.addEventListener("coaching-data-updated", refresh);
    window.addEventListener("member-bookings-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("member-bookings-updated", refresh);
    };
  }, [actorUsername, loadSessions]);

  const sessionsByDate = useMemo(
    () =>
      sessions.reduce((acc, session) => {
        (acc[session.date] = acc[session.date] || []).push(session);
        return acc;
      }, {}),
    [sessions],
  );

  const selectedSessions = useMemo(
    () => (selectedDate ? sessionsByDate[selectedDate] || [] : []),
    [selectedDate, sessionsByDate],
  );
  const selectedSession =
    selectedSessions.find((session) => session.id === selectedSessionId) ??
    selectedSessions[0] ??
    null;

  useEffect(() => {
    if (!selectedSessions.length) {
      setSelectedSessionId(null);
      return;
    }

    if (!selectedSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(selectedSessions[0].id);
    }
  }, [selectedSessionId, selectedSessions]);

  const handleCreateSession = async (event) => {
    event.preventDefault();
    setIsSavingSession(true);
    setError("");
    setFeedbackMessage("");

    try {
      const response = await fetch("/api/coaching-sessions", {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        body: JSON.stringify(form),
      });
      const result = await parseApiResponse(
        response,
        "Unable to create coaching session. If the server was already running, restart it and try again.",
      );

      setSessions((current) =>
        [...current, result.session].sort((left, right) => {
          const byDate = left.date.localeCompare(right.date);
          return byDate !== 0
            ? byDate
            : left.startTime.localeCompare(right.startTime);
        }),
      );
      setSelectedDate(result.session.date);
      setSelectedSessionId(result.session.id);
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
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleBookOn = async () => {
    if (!selectedSession) {
      return;
    }

    setIsBookingSession(true);
    setError("");
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${selectedSession.id}/book`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
        },
      );
      const result = await parseApiResponse(
        response,
        "Unable to book onto this session. If the server was already running, restart it and try again.",
      );

      setSessions((current) =>
        current.map((session) =>
          session.id === result.session.id ? result.session : session,
        ),
      );
      setFeedbackMessage(
        `Booked onto ${result.session.topic} on ${formatDate(result.session.date)}.`,
      );
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (bookingError) {
      setError(bookingError.message);
    } finally {
      setIsBookingSession(false);
    }
  };

  const handleLeaveSession = async () => {
    if (!selectedSession) {
      return;
    }

    setIsLeavingSession(true);
    setError("");
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${selectedSession.id}/booking`,
        {
          method: "DELETE",
          headers: buildHeaders(currentUserProfile),
        },
      );
      const result = await parseApiResponse(
        response,
        "Unable to withdraw from this session. If the server was already running, restart it and try again.",
      );

      setSessions((current) =>
        current.map((session) =>
          session.id === result.session.id ? result.session : session,
        ),
      );
      setFeedbackMessage(
        `Withdrawn from ${result.session.topic} on ${formatDate(result.session.date)}.`,
      );
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (leaveError) {
      setError(leaveError.message);
    } finally {
      setIsLeavingSession(false);
    }
  };

  const handleCancelSession = async () => {
    if (!selectedSession) {
      return;
    }

    setIsCancellingSession(true);
    setError("");
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${selectedSession.id}`,
        {
          method: "DELETE",
          headers: buildHeaders(currentUserProfile),
        },
      );
      await parseApiResponse(
        response,
        "Unable to cancel this session. If the server was already running, restart it and try again.",
      );

      setSessions((current) =>
        current.filter((session) => session.id !== selectedSession.id),
      );
      setFeedbackMessage("Coaching session cancelled successfully.");
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setIsCancellingSession(false);
    }
  };

  const handleApproveSession = async () => {
    if (!selectedSession) {
      return;
    }

    setError("");
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `/api/coaching-sessions/${selectedSession.id}/approve`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
        },
      );
      const result = await parseApiResponse(
        response,
        "Unable to approve this coaching session.",
      );

      setSessions((current) =>
        current.map((session) =>
          session.id === result.session.id ? result.session : session,
        ),
      );
      setFeedbackMessage(
        result.message ?? `${result.session.topic} approved successfully.`,
      );
      window.dispatchEvent(new Event("coaching-data-updated"));
    } catch (approvalError) {
      setError(approvalError.message);
    }
  };

  return (
    <div className="event-calendar-page">
      <p>Coaching sessions created by coaches are listed here for members to book onto.</p>
      {error ? <p className="profile-error">{error}</p> : null}
      {feedbackMessage ? <p className="profile-success">{feedbackMessage}</p> : null}

      {isLoading && !hasLoadedSessions ? <p>Loading coaching sessions...</p> : null}

      {hasLoadedSessions ? (
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
                    value={selectedSession?.id ?? ""}
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
                        onClick={handleApproveSession}
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
                          disabled={isCancellingSession}
                          onClick={handleCancelSession}
                        >
                          {isCancellingSession
                            ? "Cancelling session..."
                            : "Cancel session"}
                        </button>
                      </>
                    ) : (
                      <>
                        {selectedSession.isBookedOn ? (
                          <button
                            type="button"
                            className="event-cancel-button"
                            disabled={isLeavingSession}
                            onClick={handleLeaveSession}
                          >
                            {isLeavingSession
                              ? "Withdrawing..."
                              : "Withdraw from session"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="event-book-button"
                            disabled={
                              isBookingSession ||
                              !selectedSession.isApproved ||
                              selectedSession.remainingSlots <= 0 ||
                              hasSessionEnded(selectedSession)
                            }
                            onClick={handleBookOn}
                          >
                            {selectedSession.isRejected
                              ? "Request rejected"
                              : !selectedSession.isApproved
                              ? "Awaiting approval"
                              : hasSessionEnded(selectedSession)
                              ? "Booking closed"
                              : selectedSession.remainingSlots <= 0
                              ? "Session full"
                              : isBookingSession
                                ? "Booking on..."
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
            <form onSubmit={handleCreateSession} className="left-align-form">
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
                      availableSlots: Number.parseInt(event.target.value, 10) || event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <button type="submit" disabled={isSavingSession}>
                {isSavingSession
                  ? "Adding session..."
                  : canApproveSessions
                    ? "Add session"
                    : "Submit For Approval"}
              </button>
            </form>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
