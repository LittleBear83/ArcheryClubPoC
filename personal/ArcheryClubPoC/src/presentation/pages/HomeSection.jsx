export function HomeSection({ members }) {
  return (
    <>
      <p>Members at the range</p>
      <ul className="range-members-list">
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
    </>
  );
}
