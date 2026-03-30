import { useMemo, useState } from "react";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";

export function CoachingCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [location, setLocation] = useState("");
  const [coachingDate, setCoachingDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [coachingTopic, setCoachingTopic] = useState("");
  const [sessions, setSessions] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const addSession = (e) => {
    e.preventDefault();
    if (!coachingTopic.trim() || !location.trim()) return;
    setSessions((prev) => [
      ...prev,
      {
        id: Date.now(),
        date: coachingDate,
        location: location.trim(),
        topic: coachingTopic.trim(),
      },
    ]);
    setLocation("");
    setCoachingTopic("");
    setIsModalOpen(false);
  };

  const sessionsByDate = useMemo(
    () =>
      sessions.reduce((acc, item) => {
        (acc[item.date] = acc[item.date] || []).push(item);
        return acc;
      }, {}),
    [sessions],
  );

  return (
    <div>
      <p>Coaching Calendar</p>
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
        itemsByDate={sessionsByDate}
        renderItem={(s) => `${s.topic} @ ${s.location}`}
      />
      {selectedDate && (
        <p>
          Selected date: <strong>{selectedDate}</strong>
          {sessionsByDate[selectedDate] &&
            ` (${sessionsByDate[selectedDate].length} session(s))`}
        </p>
      )}
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
        <form onSubmit={addSession} className="left-align-form">
          <label>
            Session Topic
            <input
              value={coachingTopic}
              onChange={(e) => setCoachingTopic(e.target.value)}
              required
            />
          </label>
          <label>
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </label>
          <label>
            Coaching Date
            <input
              type="date"
              value={coachingDate}
              onChange={(e) => setCoachingDate(e.target.value)}
              required
            />
          </label>
          <button type="submit">Add Session</button>
        </form>
      </Modal>
      <h3>Planned sessions</h3>
      {sessions.length === 0 ? (
        <p>No coaching sessions added yet.</p>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li key={s.id}>
              {s.date}: {s.topic} at {s.location}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
