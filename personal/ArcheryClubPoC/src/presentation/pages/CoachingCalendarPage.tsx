import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { Button } from "../components/Button";
import { SummaryDate } from "../components/SummaryDate";
import { SummaryList } from "../components/SummaryList";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";
import type { CoachingSession, UserProfile } from "../../types/app";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, daysToAdd: number) {
  const nextDate = new Date(`${dateString}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate.toISOString().slice(0, 10);
}

function buildRecurringDates(
  startDate: string,
  repeatUntilDate: string,
  repeatPattern: "weekly" | "monthly",
) {
  if (!startDate || !repeatUntilDate || repeatUntilDate < startDate) {
    return [startDate].filter(Boolean);
  }

  const generatedDates = [startDate];

  if (repeatPattern === "weekly") {
    let nextDate = startDate;

    while (true) {
      nextDate = addDays(nextDate, 7);
      if (nextDate > repeatUntilDate) {
        break;
      }
      generatedDates.push(nextDate);
    }

    return generatedDates;
  }

  const start = new Date(`${startDate}T12:00:00`);
  const targetDay = start.getDate();
  let monthOffset = 1;

  while (monthOffset < 60) {
    const candidate = new Date(
      start.getFullYear(),
      start.getMonth() + monthOffset,
      targetDay,
      12,
      0,
      0,
    );
    monthOffset += 1;

    if (candidate.getDate() !== targetDay) {
      continue;
    }

    const candidateDate = candidate.toISOString().slice(0, 10);

    if (candidateDate > repeatUntilDate) {
      break;
    }

    generatedDates.push(candidateDate);
  }

  return generatedDates;
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

type CoachingCreationMode = "single" | "recurring" | "multiple";

export function CoachingCalendarPage({ currentUserProfile }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [selectedSessionId, setSelectedSessionId] = useState<CoachingSession["id"] | null>(
    null,
  );
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [error, setError] = useState("");
  const [creationMode, setCreationMode] = useState<CoachingCreationMode>("single");
  const [repeatPattern, setRepeatPattern] = useState<"weekly" | "monthly">("weekly");
  const [repeatUntilDate, setRepeatUntilDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [multiDateModalOpen, setMultiDateModalOpen] = useState(false);
  const [multiDateYear, setMultiDateYear] = useState(today.getFullYear());
  const [multiDateMonth, setMultiDateMonth] = useState(today.getMonth());
  const [selectedMultiDates, setSelectedMultiDates] = useState<string[]>([]);
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
      const result = await fetchApi<{ success: true; sessions?: CoachingSession[] }>(
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
      sessions.reduce<Record<string, CoachingSession[]>>((acc, session) => {
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
    selectedSessions.find((session) => session.id === selectedSessionId) ?? null;

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
      fetchApi<{ success: true; session?: CoachingSession; message?: string }>(url, {
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

  const performSessionAction = async ({
    body,
    successMessage,
    url,
    method,
    afterSuccess,
  }: {
    body?: Record<string, unknown>;
    successMessage: (session: CoachingSession | undefined, message?: string) => string;
    url: string;
    method: string;
    afterSuccess?: () => void;
  }) => {
    const result = await sessionMutation.mutateAsync({
      url,
      method,
      body,
    });

    setFeedbackMessage(successMessage(result.session, result.message));
    afterSuccess?.();
  };

  const createSessionsMutation = useMutation({
    mutationFn: async (dates: string[]) => {
      const createdSessions: CoachingSession[] = [];
      const failures: string[] = [];

      for (const date of dates) {
        try {
          const result = await fetchApi<{
            success: true;
            session?: CoachingSession;
            message?: string;
          }>("/api/coaching-sessions", {
            method: "POST",
            headers: buildHeaders(currentUserProfile),
            body: JSON.stringify({
              ...form,
              date,
            }),
          });

          if (result.session) {
            createdSessions.push(result.session);
          }
        } catch (mutationError) {
          failures.push(
            `${date}: ${mutationError instanceof Error ? mutationError.message : "Unable to add coaching session."}`,
          );
        }
      }

      if (createdSessions.length === 0) {
        throw new Error(failures[0] ?? "Unable to add coaching session.");
      }

      return { createdSessions, failures };
    },
    onMutate: () => {
      setError("");
      setFeedbackMessage("");
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: coachingQueryKeys.list(actorUsername),
      });
      setSelectedDate(result.createdSessions[0]?.date ?? getTodayDateString());
      setSelectedSessionId(result.createdSessions[0]?.id ?? null);
      setForm({
        topic: "",
        summary: "",
        venue: "indoor",
        date: today.toISOString().slice(0, 10),
        startTime: "18:00",
        endTime: "19:00",
        availableSlots: 4,
      });
      setCreationMode("single");
      setRepeatPattern("weekly");
      setRepeatUntilDate(today.toISOString().slice(0, 10));
      setSelectedMultiDates([]);
      setMultiDateModalOpen(false);
      setIsModalOpen(false);
      setFeedbackMessage(
        result.failures.length > 0
          ? `${result.createdSessions.length} coaching session${result.createdSessions.length === 1 ? "" : "s"} saved. ${result.failures.length} could not be created.`
          : `${result.createdSessions.length} coaching session${result.createdSessions.length === 1 ? "" : "s"} saved successfully.`,
      );
      window.dispatchEvent(new Event("coaching-data-updated"));
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message);
    },
  });

  const toggleMultiDateSelection = (dateKey: string) => {
    setSelectedMultiDates((current) =>
      current.includes(dateKey)
        ? current.filter((date) => date !== dateKey)
        : [...current, dateKey].sort(),
    );
  };

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
                setSelectedSessionId(null);
                setFeedbackMessage("");
              }}
              onToday={() => {
                const todayDate = new Date();
                setYear(todayDate.getFullYear());
                setMonth(todayDate.getMonth());
                setSelectedDate(todayDate.toISOString().slice(0, 10));
                setSelectedSessionId(null);
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
              renderDayMeta={(items) => (
                <span className="calendar-day-key-markers" aria-hidden="true">
                  {items.some((item) => item.isRejected) ? (
                    <span className="calendar-day-rejected-flag" />
                  ) : null}
                  <span className="coaching-day-key-icon-wrap">
                    <TrainingIcon className="coaching-day-key-icon" />
                  </span>
                </span>
              )}
              renderItem={(session: CoachingSession) => (
                <span
                  className={[
                    "calendar-entry-label",
                    "coaching-session-badge",
                    session.isRejected ? "is-rejected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <TrainingIcon className="coaching-badge-icon" />
                  {session.topic}
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
                <SummaryDate date={selectedDate} />
                <p>No coaching sessions are scheduled for this date.</p>
              </>
            ) : (
              <>
                <SummaryDate date={selectedDate} />
                <p className="event-summary-hint">
                  Click on a coaching session for more information and booking options.
                </p>
                <div className="event-summary-card-list">
                  {selectedSessions.map((session) => (
                    <Button
                      key={session.id}
                      type="button"
                      className={[
                        "event-summary-card",
                        session.isRejected ? "is-rejected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelectedSessionId(session.id)}
                      variant="unstyled"
                    >
                      <span className="coaching-session-badge">
                        <TrainingIcon className="coaching-badge-icon" />
                        Archery training
                      </span>
                      <strong className="event-summary-card-title">{session.topic}</strong>
                      <span className="event-summary-card-time">
                        {formatClockTime(session.startTime)} to {formatClockTime(session.endTime)}
                      </span>
                      <span className="event-summary-card-meta">
                        {getVenueLabel(session.venue)}
                        {session.isBookedOn ? " | Booked on" : ""}
                        {session.isPendingApproval ? " | Pending approval" : ""}
                        {session.isRejected ? " | Request rejected" : ""}
                        {!session.isBookedOn && hasSessionEnded(session)
                          ? " | Session finished"
                          : ""}
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </section>
      ) : null}

      {canManageCoachingSessions ? (
        <>
          <div className="event-page-actions">
            <Button onClick={() => setIsModalOpen(true)}>
              Add coaching session
            </Button>
          </div>

          <Modal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Add Coaching Session"
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const dates =
                  creationMode === "multiple"
                    ? [...selectedMultiDates].sort()
                    : creationMode === "recurring"
                      ? buildRecurringDates(form.date, repeatUntilDate, repeatPattern)
                      : [form.date];

                if (dates.length === 0) {
                  setError("Choose at least one date for this coaching session.");
                  return;
                }

                if (
                  creationMode === "recurring" &&
                  (!repeatUntilDate || repeatUntilDate < form.date)
                ) {
                  setError("Repeat until date must be on or after the first coaching date.");
                  return;
                }

                void createSessionsMutation.mutateAsync(dates);
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
              <div className="form-choice-group">
                <span className="form-choice-label">Schedule</span>
                <div className="form-choice-options">
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      creationMode === "single" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCreationMode("single")}
                    variant="ghost"
                  >
                    One time
                  </Button>
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      creationMode === "recurring" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCreationMode("recurring")}
                    variant="ghost"
                  >
                    Recurring
                  </Button>
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      creationMode === "multiple" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCreationMode("multiple")}
                    variant="ghost"
                  >
                    Multiple days
                  </Button>
                </div>
              </div>
              {creationMode === "recurring" ? (
                <>
                  <div className="form-choice-group">
                    <span className="form-choice-label">Repeat pattern</span>
                    <div className="form-choice-options">
                      <Button
                        type="button"
                        className={[
                          "form-choice-option",
                          repeatPattern === "weekly" ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setRepeatPattern("weekly")}
                        variant="ghost"
                      >
                        Weekly
                      </Button>
                      <Button
                        type="button"
                        className={[
                          "form-choice-option",
                          repeatPattern === "monthly" ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setRepeatPattern("monthly")}
                        variant="ghost"
                      >
                        Monthly
                      </Button>
                    </div>
                  </div>
                  <label>
                    Repeat until
                    <input
                      type="date"
                      value={repeatUntilDate}
                      min={form.date}
                      onChange={(event) => setRepeatUntilDate(event.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}
              {creationMode === "multiple" ? (
                <div className="form-choice-group">
                  <span className="form-choice-label">Multiple coaching dates</span>
                  <div className="event-multi-date-toolbar">
                    <Button
                      type="button"
                      className="secondary-button"
                      onClick={() => setMultiDateModalOpen(true)}
                      variant="secondary"
                    >
                      Choose dates
                    </Button>
                    <span className="event-multi-date-copy">
                      {selectedMultiDates.length === 0
                        ? "No dates selected yet."
                        : `${selectedMultiDates.length} date${selectedMultiDates.length === 1 ? "" : "s"} selected.`}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="form-choice-group">
                <span className="form-choice-label">Venue</span>
                <div className="form-choice-options">
                  {VENUE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      className={[
                        "form-choice-option",
                        form.venue === option.value ? "selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        setForm((current) => ({ ...current, venue: option.value }))
                      }
                      variant="ghost"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
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
              <div className="event-modal-actions">
                <Button type="submit">
                  {canApproveSessions ? "Add session" : "Submit For Approval"}
                </Button>
              </div>
            </form>
          </Modal>

          <Modal
            open={multiDateModalOpen}
            onClose={() => setMultiDateModalOpen(false)}
            title="Choose Coaching Dates"
          >
            <div className="event-multi-date-modal">
              <p>
                Select every date this coaching session should be created on. Each chosen day will be submitted as its own session.
              </p>
              <Calendar
                year={multiDateYear}
                month={multiDateMonth}
                selectedDate={null}
                selectedDates={selectedMultiDates}
                onDayClick={toggleMultiDateSelection}
                onToday={() => {
                  const todayDate = new Date();
                  setMultiDateYear(todayDate.getFullYear());
                  setMultiDateMonth(todayDate.getMonth());
                }}
                onPrevMonth={() => {
                  if (multiDateMonth === 0) {
                    setMultiDateMonth(11);
                    setMultiDateYear((current) => current - 1);
                  } else {
                    setMultiDateMonth((current) => current - 1);
                  }
                }}
                onNextMonth={() => {
                  if (multiDateMonth === 11) {
                    setMultiDateMonth(0);
                    setMultiDateYear((current) => current + 1);
                  } else {
                    setMultiDateMonth((current) => current + 1);
                  }
                }}
              />
              <div className="event-multi-date-summary">
                {selectedMultiDates.length === 0
                  ? "No dates selected."
                  : selectedMultiDates.join(", ")}
              </div>
              <div className="event-detail-actions">
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelectedMultiDates([])}
                  variant="secondary"
                >
                  Clear dates
                </Button>
                <Button
                  type="button"
                  onClick={() => setMultiDateModalOpen(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </Modal>
        </>
      ) : null}

      <Modal
        open={Boolean(selectedSession)}
        onClose={() => setSelectedSessionId(null)}
        title={selectedSession?.topic ?? "Coaching session details"}
      >
        {selectedSession ? (
          <div className="event-detail-modal">
            <p className="coaching-summary-heading">
              <span className="coaching-session-badge">
                <TrainingIcon className="coaching-badge-icon" />
                Archery training
              </span>
            </p>
            <p>
              <strong>Date:</strong> {formatDate(selectedSession.date)}
            </p>
            <p>
              <strong>Time:</strong> {formatClockTime(selectedSession.startTime)} to{" "}
              {formatClockTime(selectedSession.endTime)}
            </p>
            <p>
              <strong>Venue:</strong> {getVenueLabel(selectedSession.venue)}
            </p>
            <p>
              <strong>Coach:</strong> {selectedSession.coach.fullName}
            </p>
            <p>
              <strong>Details:</strong> {selectedSession.summary}
            </p>
            <p>
              <strong>Status:</strong>{" "}
              <span className="event-detail-status">
                {selectedSession.isBookedOn
                  ? "Booked on"
                  : selectedSession.isPendingApproval
                    ? "Pending approval"
                    : selectedSession.isRejected
                      ? "Request rejected"
                      : hasSessionEnded(selectedSession)
                        ? "Session finished"
                        : selectedSession.remainingSlots <= 0
                          ? "Session full"
                          : "Open for booking"}
              </span>
            </p>
            <p>
              <strong>Capacity:</strong> {selectedSession.bookingCount} of{" "}
              {selectedSession.availableSlots} slot
              {selectedSession.availableSlots === 1 ? "" : "s"} booked.
            </p>
            {selectedSession.isRejected ? (
              <p className="event-form-error">
                This coaching session request was rejected.
                {selectedSession.rejectionReason
                  ? ` Reason: ${selectedSession.rejectionReason}`
                  : ""}
              </p>
            ) : null}
            {canManageCoachingSessions &&
            selectedSession.coach.username === actorUsername ? (
              <>
                <h4>Booked Members</h4>
                {selectedSession.bookings.length > 0 ? (
                  <SummaryList
                    items={selectedSession.bookings}
                    renderItem={(booking) => booking.fullName}
                  />
                ) : (
                  <p>No members have booked onto this session yet.</p>
                )}
              </>
            ) : null}
            <div className="event-detail-actions">
              {selectedSession.canApprove ? (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void performSessionAction({
                      url: `/api/coaching-sessions/${selectedSession.id}/approve`,
                      method: "POST",
                      successMessage: (session, message) =>
                        message ?? `${session?.topic ?? selectedSession.topic} approved successfully.`,
                      afterSuccess: () => {
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="secondary"
                >
                  Approve session
                </Button>
              ) : null}
              {canManageCoachingSessions &&
              selectedSession.coach.username === actorUsername ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={() =>
                    void performSessionAction({
                      url: `/api/coaching-sessions/${selectedSession.id}`,
                      method: "DELETE",
                      successMessage: () => "Coaching session cancelled successfully.",
                      afterSuccess: () => {
                        setSelectedSessionId(null);
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="danger"
                >
                  Cancel session
                </Button>
              ) : selectedSession.isBookedOn ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={() =>
                    void performSessionAction({
                      url: `/api/coaching-sessions/${selectedSession.id}/booking`,
                      method: "DELETE",
                      successMessage: (session) =>
                        `Withdrawn from ${session?.topic ?? selectedSession.topic} on ${formatDate(session?.date ?? selectedSession.date)}.`,
                      afterSuccess: () => {
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="danger"
                >
                  Withdraw from session
                </Button>
              ) : (
                <Button
                  type="button"
                  className="event-book-button"
                  disabled={
                    !selectedSession.isApproved ||
                    selectedSession.remainingSlots <= 0 ||
                    hasSessionEnded(selectedSession)
                  }
                  onClick={() =>
                    void performSessionAction({
                      url: `/api/coaching-sessions/${selectedSession.id}/book`,
                      method: "POST",
                      successMessage: (session) =>
                        `Booked onto ${session?.topic ?? selectedSession.topic} on ${formatDate(session?.date ?? selectedSession.date)}.`,
                      afterSuccess: () => {
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
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
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
