function buildDistanceSignOff(row) {
  return {
    username: row.username,
    discipline: row.discipline,
    distanceYards: Number(row.distance_yards),
    source: row.source ?? "manual",
    signedOffByUsername: row.signed_off_by_username,
    signedOffByName:
      `${row.signed_off_by_first_name ?? ""} ${row.signed_off_by_surname ?? ""}`.trim() ||
      row.signed_off_by_username,
    signedOffAt: row.signed_off_at_date,
  };
}

function mapDistanceSignOffsByDiscipline(rows, allowedDisciplines, disciplines, distanceYards) {
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
}

function createSqliteMemberDistanceSignOffRepository(
  db,
  { allowedDisciplines, distanceYards },
) {
  const listDistanceSignOffsByUsername = db.prepare(`
    SELECT
      member_distance_sign_offs.username,
      member_distance_sign_offs.discipline,
      member_distance_sign_offs.distance_yards,
      member_distance_sign_offs.signed_off_by_username,
      member_distance_sign_offs.source,
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
      source,
      signed_off_at_date,
      signed_off_at_time
    )
    VALUES (
      @username,
      @discipline,
      @distanceYards,
      @signedOffByUsername,
      @source,
      @signedOffAtDate,
      @signedOffAtTime
    )
    ON CONFLICT(username, discipline, distance_yards) DO UPDATE SET
      signed_off_by_username = excluded.signed_off_by_username,
      source = excluded.source,
      signed_off_at_date = excluded.signed_off_at_date,
      signed_off_at_time = excluded.signed_off_at_time
  `);
  const deleteDistanceSignOffsByUsernameAndDiscipline = db.prepare(`
    DELETE FROM member_distance_sign_offs
    WHERE username = ? AND discipline = ?
  `);
  const replaceDistanceSignOffsTransaction = db.transaction(({ discipline, signOffs, username }) => {
    deleteDistanceSignOffsByUsernameAndDiscipline.run(username, discipline);

    for (const signOff of signOffs) {
      upsertDistanceSignOff.run(signOff);
    }
  });

  function listByUsername(username) {
    return listDistanceSignOffsByUsername.all(username).map(buildDistanceSignOff);
  }

  return {
    async listByUsername(username) {
      return listByUsername(username);
    },
    async listByDiscipline(username, disciplines) {
      const rows = listByUsername(username);
      return mapDistanceSignOffsByDiscipline(
        rows,
        allowedDisciplines,
        disciplines,
        distanceYards,
      );
    },
    async upsert(signOff) {
      upsertDistanceSignOff.run(signOff);
    },
    async replaceForDiscipline(username, discipline, signOffs) {
      replaceDistanceSignOffsTransaction({
        username,
        discipline,
        signOffs,
      });
    },
  };
}

function createPostgresMemberDistanceSignOffRepository(
  db,
  { allowedDisciplines, distanceYards },
) {
  async function listByUsername(username) {
    const result = await db.pool.query(
      `
        SELECT
          member_distance_sign_offs.username,
          member_distance_sign_offs.discipline,
          member_distance_sign_offs.distance_yards,
          member_distance_sign_offs.signed_off_by_username,
          member_distance_sign_offs.source,
          member_distance_sign_offs.signed_off_at_date,
          member_distance_sign_offs.signed_off_at_time,
          users.first_name AS signed_off_by_first_name,
          users.surname AS signed_off_by_surname
        FROM member_distance_sign_offs
        LEFT JOIN users ON users.username = member_distance_sign_offs.signed_off_by_username
        WHERE LOWER(member_distance_sign_offs.username) = LOWER($1)
        ORDER BY
          member_distance_sign_offs.discipline ASC,
          member_distance_sign_offs.distance_yards ASC
      `,
      [username],
    );

    return result.rows.map(buildDistanceSignOff);
  }

  return {
    async listByUsername(username) {
      return listByUsername(username);
    },
    async listByDiscipline(username, disciplines) {
      const rows = await listByUsername(username);
      return mapDistanceSignOffsByDiscipline(
        rows,
        allowedDisciplines,
        disciplines,
        distanceYards,
      );
    },
    async upsert(signOff) {
      await db.pool.query(
        `
          INSERT INTO member_distance_sign_offs (
            username,
            discipline,
            distance_yards,
            signed_off_by_username,
            source,
            signed_off_at_date,
            signed_off_at_time,
            user_id,
            signed_off_by_user_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
            (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1)
          )
          ON CONFLICT(username, discipline, distance_yards) DO UPDATE SET
            signed_off_by_username = EXCLUDED.signed_off_by_username,
            source = EXCLUDED.source,
            signed_off_at_date = EXCLUDED.signed_off_at_date,
            signed_off_at_time = EXCLUDED.signed_off_at_time,
            user_id = EXCLUDED.user_id,
            signed_off_by_user_id = EXCLUDED.signed_off_by_user_id
        `,
        [
          signOff.username,
          signOff.discipline,
          signOff.distanceYards,
          signOff.signedOffByUsername,
          signOff.source ?? "manual",
          signOff.signedOffAtDate,
          signOff.signedOffAtTime,
        ],
      );
    },
    async replaceForDiscipline(username, discipline, signOffs) {
      const client = await db.pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            DELETE FROM member_distance_sign_offs
            WHERE LOWER(username) = LOWER($1) AND discipline = $2
          `,
          [username, discipline],
        );

        for (const signOff of signOffs) {
          await client.query(
            `
              INSERT INTO member_distance_sign_offs (
                username,
                discipline,
                distance_yards,
                signed_off_by_username,
                source,
                signed_off_at_date,
                signed_off_at_time,
                user_id,
                signed_off_by_user_id
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
                (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1)
              )
            `,
            [
              signOff.username,
              signOff.discipline,
              signOff.distanceYards,
              signOff.signedOffByUsername,
              signOff.source ?? "manual",
              signOff.signedOffAtDate,
              signOff.signedOffAtTime,
            ],
          );
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createMemberDistanceSignOffRepository(db, options) {
  if (db.engine === "postgres") {
    return createPostgresMemberDistanceSignOffRepository(db, options);
  }

  return createSqliteMemberDistanceSignOffRepository(db, options);
}
