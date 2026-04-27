function normalizeCountLikeResult(result) {
  return {
    changes: Number(result?.changes ?? result?.rowCount ?? 0),
  };
}

function normalizeInsertId(result) {
  return Number(result?.lastInsertRowid ?? result?.rows?.[0]?.id ?? 0);
}

function createSqliteTournamentGateway({
  deleteTournamentById,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findTournamentById,
  insertTournament,
  insertTournamentRegistration,
  listAllTournamentRegistrations,
  listAllTournamentScores,
  listTournamentRegistrationsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  updateTournamentById,
  upsertTournamentScore,
}) {
  return {
    async createTournament(args) {
      const result = insertTournament.run(
        args.name,
        args.tournamentType,
        args.registrationStartDate,
        args.registrationEndDate,
        args.scoreSubmissionStartDate,
        args.scoreSubmissionEndDate,
        args.createdByUsername,
        ...args.timestampParts,
      );

      return findTournamentById.get(normalizeInsertId(result));
    },
    async deleteTournamentCascade(tournamentId) {
      deleteTournamentScoresByTournamentId.run(tournamentId);
      deleteTournamentRegistrationsByTournamentId.run(tournamentId);
      deleteTournamentById.run(tournamentId);
    },
    async deleteTournamentRegistration(tournamentId, actorUserId) {
      return normalizeCountLikeResult(
        deleteTournamentRegistration.run(tournamentId, actorUserId),
      );
    },
    async findTournamentById(id) {
      return findTournamentById.get(id);
    },
    async listAllTournamentRegistrations() {
      return listAllTournamentRegistrations.all();
    },
    async listAllTournamentScores() {
      return listAllTournamentScores.all();
    },
    async listTournamentRegistrationsByTournamentId(tournamentId) {
      return listTournamentRegistrationsByTournamentId.all(tournamentId);
    },
    async listTournamentScoresByTournamentId(tournamentId) {
      return listTournamentScoresByTournamentId.all(tournamentId);
    },
    async listTournaments() {
      return listTournaments.all();
    },
    async registerForTournament({ tournamentId, username, timestampParts }) {
      insertTournamentRegistration.run(tournamentId, username, ...timestampParts);
    },
    async submitTournamentScore({
      tournamentId,
      roundNumber,
      username,
      score,
      timestampParts,
    }) {
      upsertTournamentScore.run(
        tournamentId,
        roundNumber,
        username,
        score,
        ...timestampParts,
      );
    },
    async updateTournament(args) {
      updateTournamentById.run(
        args.name,
        args.tournamentType,
        args.registrationStartDate,
        args.registrationEndDate,
        args.scoreSubmissionStartDate,
        args.scoreSubmissionEndDate,
        args.id,
      );

      return findTournamentById.get(args.id);
    },
  };
}

function createPostgresTournamentGateway({ pool }) {
  return {
    async createTournament(args) {
      const result = await pool.query(
        `
          INSERT INTO tournaments (
            name,
            tournament_type,
            registration_start_date,
            registration_end_date,
            score_submission_start_date,
            score_submission_end_date,
            created_by,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `,
        [
          args.name,
          args.tournamentType,
          args.registrationStartDate,
          args.registrationEndDate,
          args.scoreSubmissionStartDate,
          args.scoreSubmissionEndDate,
          args.createdByUsername,
          ...args.timestampParts,
        ],
      );

      return this.findTournamentById(normalizeInsertId(result));
    },
    async deleteTournamentCascade(tournamentId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM tournament_scores WHERE tournament_id = $1`,
          [tournamentId],
        );
        await client.query(
          `DELETE FROM tournament_registrations WHERE tournament_id = $1`,
          [tournamentId],
        );
        await client.query(`DELETE FROM tournaments WHERE id = $1`, [tournamentId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteTournamentRegistration(tournamentId, actorUserId) {
      const result = await pool.query(
        `
          DELETE FROM tournament_registrations
          WHERE tournament_id = $1 AND member_user_id = $2
        `,
        [tournamentId, actorUserId],
      );

      return normalizeCountLikeResult(result);
    },
    async findTournamentById(id) {
      const result = await pool.query(
        `
          SELECT
            tournaments.id,
            tournaments.name,
            tournaments.tournament_type,
            tournaments.registration_start_date,
            tournaments.registration_end_date,
            tournaments.score_submission_start_date,
            tournaments.score_submission_end_date,
            tournaments.created_by,
            created_by_user.first_name AS created_by_first_name,
            created_by_user.surname AS created_by_surname
          FROM tournaments
          INNER JOIN users AS created_by_user
            ON created_by_user.username = tournaments.created_by
          WHERE tournaments.id = $1
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    },
    async listAllTournamentRegistrations() {
      const result = await pool.query(
        `
          SELECT
            tournament_registrations.tournament_id,
            tournament_registrations.member_username,
            tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
            users.first_name,
            users.surname,
            user_types.user_type
          FROM tournament_registrations
          INNER JOIN users ON users.id = tournament_registrations.member_user_id
          INNER JOIN user_types ON user_types.user_id = users.id
          ORDER BY tournament_registrations.tournament_id ASC, users.surname ASC, users.first_name ASC
        `,
      );

      return result.rows;
    },
    async listAllTournamentScores() {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            member_username,
            score
          FROM tournament_scores
          ORDER BY tournament_id ASC, round_number ASC, member_username ASC
        `,
      );

      return result.rows;
    },
    async listTournamentRegistrationsByTournamentId(tournamentId) {
      const result = await pool.query(
        `
          SELECT
            tournament_registrations.tournament_id,
            tournament_registrations.member_username,
            tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
            users.first_name,
            users.surname,
            user_types.user_type
          FROM tournament_registrations
          INNER JOIN users ON users.id = tournament_registrations.member_user_id
          INNER JOIN user_types ON user_types.user_id = users.id
          WHERE tournament_registrations.tournament_id = $1
          ORDER BY users.surname ASC, users.first_name ASC
        `,
        [tournamentId],
      );

      return result.rows;
    },
    async listTournamentScoresByTournamentId(tournamentId) {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            member_username,
            score
          FROM tournament_scores
          WHERE tournament_id = $1
          ORDER BY round_number ASC, member_username ASC
        `,
        [tournamentId],
      );

      return result.rows;
    },
    async listTournaments() {
      const result = await pool.query(
        `
          SELECT
            tournaments.id,
            tournaments.name,
            tournaments.tournament_type,
            tournaments.registration_start_date,
            tournaments.registration_end_date,
            tournaments.score_submission_start_date,
            tournaments.score_submission_end_date,
            tournaments.created_by,
            created_by_user.first_name AS created_by_first_name,
            created_by_user.surname AS created_by_surname
          FROM tournaments
          INNER JOIN users AS created_by_user
            ON created_by_user.username = tournaments.created_by
          ORDER BY tournaments.registration_start_date ASC, tournaments.name ASC
        `,
      );

      return result.rows;
    },
    async registerForTournament({ tournamentId, username, timestampParts }) {
      await pool.query(
        `
          INSERT INTO tournament_registrations (
            tournament_id,
            member_username,
            registered_at_date,
            registered_at_time
          )
          VALUES ($1, $2, $3, $4)
        `,
        [tournamentId, username, ...timestampParts],
      );
    },
    async submitTournamentScore({
      tournamentId,
      roundNumber,
      username,
      score,
      timestampParts,
    }) {
      await pool.query(
        `
          INSERT INTO tournament_scores (
            tournament_id,
            round_number,
            member_username,
            score,
            submitted_at_date,
            submitted_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(tournament_id, round_number, member_username) DO UPDATE SET
            score = EXCLUDED.score,
            submitted_at_date = EXCLUDED.submitted_at_date,
            submitted_at_time = EXCLUDED.submitted_at_time
        `,
        [tournamentId, roundNumber, username, score, ...timestampParts],
      );
    },
    async updateTournament(args) {
      await pool.query(
        `
          UPDATE tournaments
          SET
            name = $1,
            tournament_type = $2,
            registration_start_date = $3,
            registration_end_date = $4,
            score_submission_start_date = $5,
            score_submission_end_date = $6
          WHERE id = $7
        `,
        [
          args.name,
          args.tournamentType,
          args.registrationStartDate,
          args.registrationEndDate,
          args.scoreSubmissionStartDate,
          args.scoreSubmissionEndDate,
          args.id,
        ],
      );

      return this.findTournamentById(args.id);
    },
  };
}

export function createTournamentGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresTournamentGateway(options);
  }

  return createSqliteTournamentGateway(options);
}
