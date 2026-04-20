export function createMemberDistanceSignOffRepository(
  db,
  { allowedDisciplines, distanceYards },
) {
  const listDistanceSignOffsByUsername = db.prepare(`
    SELECT
      member_distance_sign_offs.username,
      member_distance_sign_offs.discipline,
      member_distance_sign_offs.distance_yards,
      member_distance_sign_offs.signed_off_by_username,
      member_distance_sign_offs.signed_off_at_date,
      member_distance_sign_offs.signed_off_at_time,
      users.first_name AS signed_off_by_first_name,
      users.surname AS signed_off_by_surname
    FROM member_distance_sign_offs
    LEFT JOIN users ON users.username = member_distance_sign_offs.signed_off_by_username
    WHERE member_distance_sign_offs.username = ?
    ORDER BY
      member_distance_sign_offs.discipline ASC,
      member_distance_sign_offs.distance_yards ASC
  `);
  const upsertDistanceSignOff = db.prepare(`
    INSERT INTO member_distance_sign_offs (
      username,
      discipline,
      distance_yards,
      signed_off_by_username,
      signed_off_at_date,
      signed_off_at_time
    )
    VALUES (
      @username,
      @discipline,
      @distanceYards,
      @signedOffByUsername,
      @signedOffAtDate,
      @signedOffAtTime
    )
    ON CONFLICT(username, discipline, distance_yards) DO UPDATE SET
      signed_off_by_username = excluded.signed_off_by_username,
      signed_off_at_date = excluded.signed_off_at_date,
      signed_off_at_time = excluded.signed_off_at_time
  `);

  function buildDistanceSignOff(row) {
    return {
      username: row.username,
      discipline: row.discipline,
      distanceYards: row.distance_yards,
      signedOffByUsername: row.signed_off_by_username,
      signedOffByName:
        `${row.signed_off_by_first_name ?? ""} ${row.signed_off_by_surname ?? ""}`.trim() ||
        row.signed_off_by_username,
      signedOffAt: row.signed_off_at_date,
    };
  }

  function listByUsername(username) {
    return listDistanceSignOffsByUsername.all(username).map(buildDistanceSignOff);
  }

  return {
    listByUsername,
    listByDiscipline(username, disciplines) {
      const rows = listByUsername(username);
      const orderedDisciplines = allowedDisciplines.filter((discipline) =>
        disciplines.includes(discipline),
      );

      return orderedDisciplines.map((discipline) => ({
        discipline,
        distances: distanceYards.map((signOffDistanceYards) => ({
          distanceYards: signOffDistanceYards,
          signOff:
            rows.find(
              (row) =>
                row.discipline === discipline &&
                row.distanceYards === signOffDistanceYards,
            ) ?? null,
        })),
      }));
    },
    upsert(signOff) {
      upsertDistanceSignOff.run(signOff);
    },
  };
}
