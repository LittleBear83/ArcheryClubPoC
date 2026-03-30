export function HomeSection({ members }) {
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <p>On site today</p>
      <ul>
        {sortedMembers.length > 0 ? (
          sortedMembers.map((member) => (
            <li key={member.id}>
              {member.name} — {member.role}
            </li>
          ))
        ) : (
          <li>No members on site today</li>
        )}
      </ul>
    </>
  );
}
