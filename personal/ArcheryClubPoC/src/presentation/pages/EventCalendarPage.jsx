import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { useVisiblePolling } from "../state/useVisiblePolling";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function hasEventEnded(event) {
  if (!event?.date || !event?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(event.endTime)
    ? `${event.endTime}:00`
    : event.endTime;
  const eventEnd = new Date(`${event.date}T${normalizedEndTime}`);

  if (Number.isNaN(eventEnd.getTime())) {
    return false;
  }

  return eventEnd.getTime() <= Date.now();
}

const EVENT_TYPE_OPTIONS = [
  { value: "competition", label: "Competition", className: "event-type-competition" },
  { value: "social", label: "Social event", className: "event-type-social" },
  { value: "range-closed", label: "Range closed", className: "event-type-range-closed" },
];
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
export function EventCalendarPage({ currentUserProfile, onBookingsChanged }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [newEvent, setNewEvent] = useState("");
  const [newEventDate, setNewEventDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] = useState("10:00");
  const [newEventType, setNewEventType] = useState("competition");
  const [newEventVenue, setNewEventVenue] = useState("indoor");
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingModalMode, setBookingModalMode] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [bookingMessage, setBookingMessage] = useState("");
  const [eventFormError, setEventFormError] = useState("");
  const canCreateEvents = hasPermission(
    currentUserProfile,
    "add_events",
  );
  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canManageBookings = Boolean(actorUsername);

  const getEventTypeDetails = (type) =>
    EVENT_TYPE_OPTIONS.find((option) => option.value === type) ??
    EVENT_TYPE_OPTIONS[0];

  const loadEvents = useCallback(async (signal) => {
    try {
      const response = await fetch("/api/events", {
        headers: actorUsername
          ? { "x-actor-username": actorUsername }
          : undefined,
        cache: "no-store",
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success || signal?.aborted) {
        return;
      }

      setEvents(result.events ?? []);
    } catch {
      if (!signal?.aborted) {
        setEvents([]);
      }
    }
  }, [actorUsername]);

  useVisiblePolling(() => {
    loadEvents(new AbortController().signal);
  }, {
    enabled: true,
    intervalMs: 60000,
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadEvents(abortController.signal);

    window.addEventListener("event-data-updated", refresh);
    window.addEventListener("member-bookings-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("event-data-updated", refresh);
      window.removeEventListener("member-bookings-updated", refresh);
    };
  }, [actorUsername, loadEvents]);

  const addEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.trim()) return;

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-username": currentUserProfile?.auth?.username ?? "",
        },
        cache: "no-store",
        body: JSON.stringify({
          date: newEventDate,
          startTime: newEventStartTime,
          endTime: newEventEndTime,
          title: newEvent.trim(),
          type: newEventType,
          venue: newEventVenue,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setEventFormError(result.message ?? "Unable to save event.");
        return;
      }

      setEvents((prev) =>
        [...prev, result.event].sort((left, right) => {
          const byDate = left.date.localeCompare(right.date);

          if (byDate !== 0) {
            return byDate;
          }

          return left.startTime.localeCompare(right.startTime);
        }),
      );
      setNewEvent("");
      setNewEventStartTime("09:00");
      setNewEventEndTime("10:00");
      setNewEventType("competition");
      setNewEventVenue("indoor");
      setEventFormError("");
      setIsModalOpen(false);
      setBookingMessage(result.message ?? "Event saved successfully.");
      window.dispatchEvent(new Event("event-data-updated"));
    } catch {
      setEventFormError("Unable to save event.");
    }
  };

  const eventsByDate = useMemo(
    () =>
      [...events]
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
        .reduce((acc, evt) => {
          (acc[evt.date] = acc[evt.date] || []).push(evt);
          return acc;
        }, {}),
    [events],
  );

  const selectedEvents = useMemo(
    () => (selectedDate ? eventsByDate[selectedDate] || [] : []),
    [eventsByDate, selectedDate],
  );
  const bookableSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.type !== "range-closed"),
    [selectedEvents],
  );
  const bookedSelectedEvents = useMemo(
    () => bookableSelectedEvents.filter((event) => event.isBookedOn),
    [bookableSelectedEvents],
  );
  const availableToBookSelectedEvents = useMemo(
    () =>
      bookableSelectedEvents.filter(
        (event) =>
          event.isApproved &&
          !event.isBookedOn &&
          !hasEventEnded(event),
      ),
    [bookableSelectedEvents],
  );
  const pendingSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isPendingApproval),
    [selectedEvents],
  );
  const rejectedSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isRejected),
    [selectedEvents],
  );

  const handleDateSelect = (dateString) => {
    setSelectedDate(dateString);
    setBookingMessage("");
    setBookingModalMode("");
  };

  const handleOpenModal = () => {
    setEventFormError("");
    setIsModalOpen(true);
  };

  const updateEventInState = (updatedEvent) => {
    setEvents((current) =>
      current.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)),
    );
  };

  const approveEvent = async (event) => {
    try {
      const response = await fetch(`/api/events/${event.id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-username": actorUsername,
        },
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to approve this event.");
      }

      updateEventInState(result.event);
      setBookingMessage(result.message ?? `${event.title} approved successfully.`);
      window.dispatchEvent(new Event("event-data-updated"));
    } catch (approvalError) {
      setBookingMessage(approvalError.message);
    }
  };

  const startBookingForEvent = async (event) => {
    if (!selectedDate || !event) {
      return;
    }

    try {
      const response = await fetch(`/api/events/${event.id}/book`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-username": actorUsername,
        },
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to book onto this event.");
      }

      updateEventInState(result.event);
      setBookingMessage(
        `Booked onto ${event.title} on ${formatDate(selectedDate)} at ${formatClockTime(event.startTime)}.`,
      );
      onBookingsChanged?.();
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("event-data-updated"));
      setBookingModalMode("");
    } catch (bookingError) {
      setBookingMessage(bookingError.message);
      setBookingModalMode("");
    }
  };

  const leaveEvent = async (event) => {
    if (!selectedDate || !event) {
      return;
    }

    try {
      const response = await fetch(`/api/events/${event.id}/booking`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-actor-username": actorUsername,
        },
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to leave this event.");
      }

      updateEventInState(result.event);
      setBookingMessage(
        `You have left ${event.title} on ${formatDate(selectedDate)}.`,
      );
      onBookingsChanged?.();
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("event-data-updated"));
      setBookingModalMode("");
    } catch (leaveError) {
      setBookingMessage(leaveError.message);
      setBookingModalMode("");
    }
  };

  const handleBookOn = () => {
    if (!selectedDate || availableToBookSelectedEvents.length === 0) {
      return;
    }

    if (availableToBookSelectedEvents.length === 1) {
      startBookingForEvent(availableToBookSelectedEvents[0]);
      return;
    }

    setBookingModalMode("book");
  };

  const handleLeaveEvent = () => {
    if (!selectedDate || bookedSelectedEvents.length === 0) {
      return;
    }

    if (bookedSelectedEvents.length === 1) {
      leaveEvent(bookedSelectedEvents[0]);
      return;
    }

    setBookingModalMode("leave");
  };

  return (
    <div className="event-calendar-page">
      <p>Event/Competition Calendar</p>
      <section className="event-calendar-layout event-calendar-layout-expanded">
        <div className="event-calendar-main">
          <div className="event-calendar-key" aria-label="Event type key">
            {EVENT_TYPE_OPTIONS.map((option) => (
              <span key={option.value} className="event-key-item">
                <span className={`event-key-swatch ${option.className}`} />
                {option.label}
              </span>
            ))}
          </div>
          <Calendar
            year={year}
            month={month}
            selectedDate={selectedDate}
            onDayClick={handleDateSelect}
            onPrevMonth={() => {
              if (month === 0) {
                setMonth(11);
                setYear((y) => y - 1);
              } else {
                setMonth((m) => m - 1);
              }
            }}
            onNextMonth={() => {
              if (month === 11) {
                setMonth(0);
                setYear((y) => y + 1);
              } else {
                setMonth((m) => m + 1);
              }
            }}
            itemsByDate={eventsByDate}
            renderDayMeta={(items) => {
              const typeClasses = [
                ...new Set(
                  items.map(
                    (item) => getEventTypeDetails(item.type).className,
                  ),
                ),
              ];

              return (
                <span className="calendar-day-key-markers" aria-hidden="true">
                  {typeClasses.map((typeClass) => (
                    <span
                      key={typeClass}
                      className={`calendar-day-key-dot ${typeClass}`}
                    />
                  ))}
                </span>
              );
            }}
          />
        </div>

        <aside className="event-summary-panel">
          <h3>Event summary</h3>
          {!selectedDate ? (
            <p>Select a date on the calendar to view event details.</p>
          ) : (
            <>
              <p className="event-summary-date">
                <strong>{formatDate(selectedDate)}</strong>
              </p>
              {selectedEvents.length === 0 ? (
                <p>No events are scheduled for this date yet.</p>
              ) : (
                <>
                  <p>
                    {selectedEvents.length} event
                    {selectedEvents.length === 1 ? "" : "s"} available.
                  </p>
                  <ul className="event-summary-list">
                    {selectedEvents.map((evt) => (
                      <li key={evt.id}>
                        <span
                          className={`event-type-badge ${getEventTypeDetails(evt.type).className}`}
                        >
                          {getEventTypeDetails(evt.type).label}
                        </span>{" "}
                        {formatClockTime(evt.startTime)} to {formatClockTime(evt.endTime)} - {evt.title}
                        {` (${getVenueLabel(evt.venue)})`}
                        {evt.type === "range-closed" ? " (not bookable)" : ""}
                        {evt.isBookedOn ? " (booked on)" : ""}
                        {evt.isPendingApproval ? " (pending approval)" : ""}
                        {evt.isRejected ? " (request rejected)" : ""}
                        {!evt.isBookedOn && hasEventEnded(evt)
                          ? " (event has finished)"
                          : ""}
                        {evt.canApprove ? " " : ""}
                        {evt.canApprove ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => approveEvent(evt)}
                          >
                            Approve
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {pendingSelectedEvents.length > 0 && !canApproveEvents ? (
                <p>Pending events cannot be booked until approved.</p>
              ) : null}
              <button
                type="button"
                className="event-book-button"
                disabled={
                  !canManageBookings || availableToBookSelectedEvents.length === 0
                }
                onClick={handleBookOn}
              >
                {selectedEvents.some((event) => !event.isBookedOn && hasEventEnded(event))
                  && availableToBookSelectedEvents.length === 0
                  ? "Booking closed"
                  : rejectedSelectedEvents.length > 0 &&
                    availableToBookSelectedEvents.length === 0
                    ? "Request rejected"
                  : pendingSelectedEvents.length > 0 &&
                    availableToBookSelectedEvents.length === 0
                    ? "Awaiting approval"
                  : "Book on"}
              </button>
              {canManageBookings && bookedSelectedEvents.length > 0 ? (
                <button
                  type="button"
                  className="event-cancel-button"
                  onClick={handleLeaveEvent}
                >
                  Leave event
                </button>
              ) : null}
              {bookingMessage && (
                <p className="event-booking-message">{bookingMessage}</p>
              )}
            </>
          )}
        </aside>
      </section>

      {canCreateEvents ? (
        <button
          onClick={handleOpenModal}
          style={{ marginBottom: "12px" }}
        >
          Add event
        </button>
      ) : null}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Event"
      >
        <form
          onSubmit={addEvent}
          className="left-align-form"
          style={{ marginBottom: "0" }}
        >
          <label>
            Event title
            <input
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value)}
              required
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              required
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={newEventStartTime}
              onChange={(e) => setNewEventStartTime(e.target.value)}
              required
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={newEventEndTime}
              onChange={(e) => setNewEventEndTime(e.target.value)}
              required
            />
          </label>
          <label>
            Event type
            <select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value)}
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Venue
            <select
              value={newEventVenue}
              onChange={(e) => setNewEventVenue(e.target.value)}
            >
              {VENUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {eventFormError ? <p className="event-form-error">{eventFormError}</p> : null}
          <button type="submit">
            {canApproveEvents ? "Save Event" : "Submit For Approval"}
          </button>
        </form>
      </Modal>

      <Modal
        open={bookingModalMode === "book" || bookingModalMode === "leave"}
        onClose={() => setBookingModalMode("")}
        title={
          bookingModalMode === "leave"
            ? "Choose Event To Leave"
            : "Choose Event To Book"
        }
      >
        <div className="event-booking-picker">
          <p>
            {bookingModalMode === "leave"
              ? `Select the event you want to leave for ${formatDate(selectedDate)}.`
              : `Select the event you want to book onto for ${formatDate(selectedDate)}.`}
          </p>
          <div className="event-booking-option-list">
            {(bookingModalMode === "leave"
              ? bookedSelectedEvents
              : availableToBookSelectedEvents
            ).map((event) => (
              <button
                key={event.id}
                type="button"
                className="event-booking-option"
                onClick={() =>
                  bookingModalMode === "leave"
                    ? leaveEvent(event)
                    : startBookingForEvent(event)
                }
              >
                <span
                  className={`event-type-badge ${getEventTypeDetails(event.type).className}`}
                >
                  {getEventTypeDetails(event.type).label}
                </span>
                <strong>{event.title}</strong>
                <span>
                  {formatClockTime(event.startTime)} to {formatClockTime(event.endTime)}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setBookingModalMode("")}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
