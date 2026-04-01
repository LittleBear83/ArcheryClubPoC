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

export function HomeSection({ members, signedUpEvents, tournamentReminders }) {
  return (
    <div className="home-split-view">
      <MembersAtRangeList members={members} />
      <SignedUpEventsList events={signedUpEvents} />
      <TournamentRemindersList reminders={tournamentReminders} />
    </div>
  );
}
