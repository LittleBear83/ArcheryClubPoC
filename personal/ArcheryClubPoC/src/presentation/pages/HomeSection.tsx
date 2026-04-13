import { formatDate } from "../../utils/dateTime";
import { getUserProfileKey } from "../../utils/userProfile";

function SignedUpEventsList({ events }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Your Club Events List</h3>
      <ul className="home-info-list">
        {events.length > 0 ? (
          events.map((event) => (
            <li key={event.id}>
              <strong>{formatDate(event.date)}</strong>
              {`: ${event.title}`}
            </li>
          ))
        ) : (
          <li>No signed-up events yet.</li>
        )}
      </ul>
    </section>
  );
}

function TournamentRemindersList({ reminders }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Tournament Reminders</h3>
      <ul className="home-info-list">
        {reminders.length > 0 ? (
          reminders.map((reminder) => (
            <li key={reminder.id}>
              <strong>{formatDate(reminder.date)}</strong>
              {`: ${reminder.title}`}
            </li>
          ))
        ) : (
          <li>No tournament reminders right now.</li>
        )}
      </ul>
    </section>
  );
}

function MembersAtRangeList({ members }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Current Members At The Range</h3>
      <ul className="home-info-list">
        {members.length > 0 ? (
          members.map((member) => (
            <li key={getUserProfileKey(member)}>
              {member.personal.fullName}
              {member.membership.disciplines?.length
                ? ` - ${member.membership.disciplines.join(", ")}`
                : member.accountType === "guest"
                  ? " - Guest"
                  : ""}
            </li>
          ))
        ) : (
          <li>No members have logged in within the last 2 hours</li>
        )}
      </ul>
    </section>
  );
}

function BeginnerTodayCard({ dashboard }) {
  if (!dashboard) {
    return null;
  }

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Beginners Course Today</h3>
      {dashboard.lessonToday ? (
        <>
          <p>
            Lesson {dashboard.lessonToday.lessonNumber} on{" "}
            <strong>{formatDate(dashboard.lessonToday.date)}</strong>
          </p>
          <p>
            Coaches:{" "}
            {dashboard.coaches.length > 0
              ? dashboard.coaches.map((coach) => coach.fullName).join(", ")
              : "No coaches assigned yet"}
          </p>
        </>
      ) : (
        <p>No lesson is scheduled for you today.</p>
      )}
      {dashboard.showSafetyMessage ? (
        <p className="equipment-meta-copy">
          Please do not pick up any equipment until after the safety talk or until a
          coach asks you to do so.
        </p>
      ) : null}
      <ul className="home-info-list">
        {dashboard.equipment.length > 0 ? (
          dashboard.equipment.map((item) => (
            <li key={item.id}>
              {item.typeLabel}
              {item.reference ? ` - ${item.reference}` : ""}
            </li>
          ))
        ) : (
          <li>No equipment has been issued to you yet.</li>
        )}
      </ul>
    </section>
  );
}

function BeginnerCoachAssignmentsCard({ assignments }) {
  if (!assignments.length) {
    return null;
  }

  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Beginners Coaching</h3>
      <ul className="home-info-list">
        {assignments.map((assignment) => (
          <li key={assignment.id}>
            <strong>{formatDate(assignment.date)}</strong>
            {`: lesson ${assignment.lessonNumber}, coordinator ${assignment.coordinatorName}, ${assignment.beginnerCount} beginners`}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeSection({
  members,
  signedUpEvents,
  tournamentReminders,
  beginnerDashboard,
  beginnerCoachAssignments,
}) {
  return (
    <div className="home-split-view">
      <MembersAtRangeList members={members} />
      <SignedUpEventsList events={signedUpEvents} />
      <TournamentRemindersList reminders={tournamentReminders} />
      <BeginnerTodayCard dashboard={beginnerDashboard} />
      <BeginnerCoachAssignmentsCard assignments={beginnerCoachAssignments} />
    </div>
  );
}
