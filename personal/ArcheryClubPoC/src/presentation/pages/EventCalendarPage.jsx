import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";

export function EventCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [newEvent, setNewEvent] = useState("");
  const [newEventDate, setNewEventDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const addEvent = (e) => {
    e.preventDefault();
    if (!newEvent.trim()) return;
    setEvents((prev) => [
      ...prev,
      { id: Date.now(), date: newEventDate, title: newEvent.trim() },
    ]);
    setNewEvent("");
    setIsModalOpen(false);
  };

  const eventsByDate = useMemo(
    () =>
      events.reduce((acc, evt) => {
        (acc[evt.date] = acc[evt.date] || []).push(evt);
        return acc;
      }, {}),
    [events],
  );

  return (
    <div>
      <p>Event/Competition Calendar</p>
      <Calendar
        year={year}
        month={month}
        selectedDate={selectedDate}
        onDayClick={(dateString) => setSelectedDate(dateString)}
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
        renderItem={(evt) => evt.title}
      />

      {selectedDate && (
        <p>
          Selected date: <strong>{selectedDate}</strong>
          {eventsByDate[selectedDate] &&
            ` (${eventsByDate[selectedDate].length} event(s))`}
        </p>
      )}
      <button
        onClick={() => setIsModalOpen(true)}
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
          <button type="submit">Save Event</button>
        </form>
      </Modal>

      <h3>Upcoming events</h3>
      {events.length === 0 ? (
        <p>No events set yet.</p>
      ) : (
        <ul>
          {events.map((evt) => (
            <li key={evt.id}>
              {evt.date}: {evt.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
