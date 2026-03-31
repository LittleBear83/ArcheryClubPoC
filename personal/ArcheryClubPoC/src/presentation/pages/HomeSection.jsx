import { formatDate } from "../../utils/dateTime";

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

function MembersAtRangeList({ members }) {
  return (
    <section className="home-panel">
      <h3 className="home-panel-title">Current Members At The Range</h3>
      <ul className="home-info-list">
        {members.length > 0 ? (
          members.map((member) => (
            <li
              key={
                member.username ??
                `${member.firstName}-${member.surname}-${member.archeryGbMembershipNumber ?? "guest"}`
              }
            >
              {member.firstName} {member.surname}
              {member.disciplines?.length
                ? ` - ${member.disciplines.join(", ")}`
                : member.userType === "guest"
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

export function HomeSection({ members, signedUpEvents }) {
  return (
    <div className="home-split-view">
      <MembersAtRangeList members={members} />
      <SignedUpEventsList events={signedUpEvents} />
    </div>
  );
}
