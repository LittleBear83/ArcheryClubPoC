import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { formatClockTime, formatDate } from "../../utils/dateTime";

const EVENT_TYPE_OPTIONS = [
  { value: "competition", label: "Competition", className: "event-type-competition" },
  { value: "social", label: "Social event", className: "event-type-social" },
  { value: "range-closed", label: "Range closed", className: "event-type-range-closed" },
];

function buildFirstMondayClosure(year, month) {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysUntilMonday = (8 - firstDayOfWeek) % 7;
  const firstMonday = 1 + daysUntilMonday;

  return {
    id: `range-closed-${year}-${String(month + 1).padStart(2, "0")}`,
    date: `${year}-${String(month + 1).padStart(2, "0")}-${String(firstMonday).padStart(2, "0")}`,
    startTime: "09:00",
    title: "Range closed until 12:00",
    type: "range-closed",
    system: true,
  };
}

export function EventCalendarPage() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [newEvent, setNewEvent] = useState("");
  const [newEventDate, setNewEventDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventType, setNewEventType] = useState("competition");
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [eventFormError, setEventFormError] = useState("");

  const getEventTypeDetails = (type) =>
    EVENT_TYPE_OPTIONS.find((option) => option.value === type) ??
    EVENT_TYPE_OPTIONS[0];

  const recurringClosures = useMemo(() => {
    const yearsToBuild = [...new Set([currentYear, year])];

    return yearsToBuild.flatMap((targetYear) =>
      Array.from({ length: 12 }, (_, monthIndex) =>
        buildFirstMondayClosure(targetYear, monthIndex),
      ),
    );
  }, [currentYear, year]);

  const combinedEvents = useMemo(
    () =>
      [...recurringClosures, ...events].sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);

        if (byDate !== 0) {
          return byDate;
        }

        return left.startTime.localeCompare(right.startTime);
      }),
    [events, recurringClosures],
  );

  const addEvent = (e) => {
    e.preventDefault();
    if (!newEvent.trim()) return;

    const hasTimeConflict = combinedEvents.some(
      (event) =>
        event.date === newEventDate && event.startTime === newEventStartTime,
    );

    if (hasTimeConflict) {
      setEventFormError(
        `There is already an event booked on ${formatDate(newEventDate)} at ${formatClockTime(newEventStartTime)}.`,
      );
      return;
    }

    setEvents((prev) => [
      ...prev,
      {
        id: Date.now(),
        date: newEventDate,
        startTime: newEventStartTime,
        title: newEvent.trim(),
        type: newEventType,
      },
    ]);
    setNewEvent("");
    setNewEventStartTime("09:00");
    setNewEventType("competition");
    setEventFormError("");
    setIsModalOpen(false);
  };

  const eventsByDate = useMemo(
    () =>
      [...combinedEvents]
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
        .reduce((acc, evt) => {
          (acc[evt.date] = acc[evt.date] || []).push(evt);
          return acc;
        }, {}),
    [combinedEvents],
  );

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];
  const primarySelectedEvent = selectedEvents[0] || null;

  const handleDateSelect = (dateString) => {
    setSelectedDate(dateString);
    setBookingMessage("");
  };

  const handleOpenModal = () => {
    setEventFormError("");
    setIsModalOpen(true);
  };

  const handleBookOn = () => {
    if (!selectedDate) return;
    const eventTitle = primarySelectedEvent?.title || "this event date";
    setBookingMessage(
      `Booking request started for ${eventTitle} on ${formatDate(selectedDate)} at ${formatClockTime(primarySelectedEvent?.startTime)}.`,
    );
  };

  return (
    <div>
      <p>Event/Competition Calendar</p>
      <section className="event-calendar-layout">
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
                        {formatClockTime(evt.startTime)} - {evt.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                className="event-book-button"
                disabled={selectedEvents.length === 0}
                onClick={handleBookOn}
              >
                Book on
              </button>
              {bookingMessage && (
                <p className="event-booking-message">{bookingMessage}</p>
              )}
            </>
          )}
        </aside>
      </section>

      <button
        onClick={handleOpenModal}
        style={{ marginBottom: "12px" }}
      >
        Add event
      </button>

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
          {eventFormError ? <p className="event-form-error">{eventFormError}</p> : null}
          <button type="submit">Save Event</button>
        </form>
      </Modal>
    </div>
  );
}
