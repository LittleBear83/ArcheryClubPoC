function normalizeCountLikeResult(result) {
  return {
    changes: Number(result?.changes ?? result?.rowCount ?? 0),
  };
}

function normalizeInsertId(result) {
  return Number(result?.lastInsertRowid ?? result?.rows?.[0]?.id ?? 0);
}

function areSameMatchParticipants(existingMatch, nextMatch) {
  return (
    (existingMatch?.left_member_username ?? null) ===
      (nextMatch?.leftMemberUsername ?? null) &&
    (existingMatch?.right_member_username ?? null) ===
      (nextMatch?.rightMemberUsername ?? null)
  );
}

function normalizePersistedWorkflowValues(existingMatch, nextMatch) {
  if (!existingMatch || !areSameMatchParticipants(existingMatch, nextMatch)) {
    return {
      submittedByUsername: null,
      submittedAtDate: null,
      submittedAtTime: null,
      confirmedByUsername: null,
      confirmedAtDate: null,
      confirmedAtTime: null,
      disputedByUsername: null,
      disputedAtDate: null,
      disputedAtTime: null,
      disputeReason: null,
    };
  }

  return {
    submittedByUsername: existingMatch.submitted_by_username ?? null,
    submittedAtDate: existingMatch.submitted_at_date ?? null,
    submittedAtTime: existingMatch.submitted_at_time ?? null,
    confirmedByUsername: existingMatch.confirmed_by_username ?? null,
    confirmedAtDate: existingMatch.confirmed_at_date ?? null,
    confirmedAtTime: existingMatch.confirmed_at_time ?? null,
    disputedByUsername: existingMatch.disputed_by_username ?? null,
    disputedAtDate: existingMatch.disputed_at_date ?? null,
    disputedAtTime: existingMatch.disputed_at_time ?? null,
    disputeReason: existingMatch.dispute_reason ?? null,
  };
}

function createSqliteTournamentGateway({
  deleteTournamentById,
  deleteTournamentMatchesByTournamentId,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentRoundsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findTournamentMatchByKey,
  findTournamentById,
  insertTournament,
  insertTournamentMatch,
  insertTournamentRegistration,
  insertTournamentRound,
  listAllTournamentMatches,
  listAllTournamentRegistrations,
  listAllTournamentRounds,
  listAllTournamentScores,
  listTournamentMatchesByTournamentId,
  listTournamentRegistrationsByTournamentId,
  listTournamentRoundsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  updateTournamentMatchWorkflow,
  updateTournamentById,
  upsertTournamentScore,
}) {
  return {
    async createTournament(args) {
      const result = insertTournament.run(
        args.name,
        args.tournamentType,
        args.templateKey ?? null,
        args.drawDate ?? null,
        args.roundScheduleJson ?? "[]",
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
      deleteTournamentMatchesByTournamentId.run(tournamentId);
      deleteTournamentRoundsByTournamentId.run(tournamentId);
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
    async findTournamentMatchByKey({ matchNumber, roundNumber, tournamentId }) {
      return findTournamentMatchByKey.get(tournamentId, roundNumber, matchNumber);
    },
    async listAllTournamentMatches() {
      return listAllTournamentMatches.all();
    },
    async listAllTournamentRegistrations() {
      return listAllTournamentRegistrations.all();
    },
    async listAllTournamentRounds() {
      return listAllTournamentRounds.all();
    },
    async listAllTournamentScores() {
      return listAllTournamentScores.all();
    },
    async listTournamentMatchesByTournamentId(tournamentId) {
      return listTournamentMatchesByTournamentId.all(tournamentId);
    },
    async listTournamentRegistrationsByTournamentId(tournamentId) {
      return listTournamentRegistrationsByTournamentId.all(tournamentId);
    },
    async listTournamentRoundsByTournamentId(tournamentId) {
      return listTournamentRoundsByTournamentId.all(tournamentId);
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
    async replaceTournamentRounds({ tournamentId, rounds }) {
      deleteTournamentRoundsByTournamentId.run(tournamentId);

      for (const round of rounds) {
        insertTournamentRound.run(
          tournamentId,
          round.roundNumber,
          round.title,
          round.publishDate ?? null,
          round.submissionDeadline ?? null,
          round.status ?? "scheduled",
        );
      }
    },
    async replaceTournamentMatches({ tournamentId, matches }) {
      const existingMatches = listTournamentMatchesByTournamentId.all(tournamentId);
      const existingMatchesByKey = new Map(
        existingMatches.map((match) => [
          `${match.round_number}:${match.match_number}`,
          match,
        ]),
      );
      deleteTournamentMatchesByTournamentId.run(tournamentId);

      for (const match of matches) {
        const existingMatch = existingMatchesByKey.get(
          `${match.roundNumber}:${match.matchNumber}`,
        );
        const workflowValues = normalizePersistedWorkflowValues(existingMatch, match);
        insertTournamentMatch.run(
          tournamentId,
          match.roundNumber,
          match.matchNumber,
          match.leftMemberUsername ?? null,
          match.rightMemberUsername ?? null,
          match.leftScore ?? null,
          match.rightScore ?? null,
          match.winnerUsername ?? null,
          workflowValues.submittedByUsername,
          workflowValues.submittedAtDate,
          workflowValues.submittedAtTime,
          workflowValues.confirmedByUsername,
          workflowValues.confirmedAtDate,
          workflowValues.confirmedAtTime,
          workflowValues.disputedByUsername,
          workflowValues.disputedAtDate,
          workflowValues.disputedAtTime,
          workflowValues.disputeReason,
          match.status ?? "scheduled",
        );
      }
    },
    async updateTournamentMatchWorkflow({
      confirmedByUsername = null,
      confirmedTimestampParts = [null, null],
      disputedByUsername = null,
      disputedTimestampParts = [null, null],
      disputeReason = null,
      leftScore = null,
      matchNumber,
      rightScore = null,
      roundNumber,
      status,
      submittedByUsername = null,
      submittedTimestampParts = [null, null],
      tournamentId,
      winnerUsername = null,
    }) {
      updateTournamentMatchWorkflow.run(
        leftScore,
        rightScore,
        winnerUsername,
        submittedByUsername,
        ...submittedTimestampParts,
        confirmedByUsername,
        ...confirmedTimestampParts,
        disputedByUsername,
        ...disputedTimestampParts,
        disputeReason,
        status,
        tournamentId,
        roundNumber,
        matchNumber,
      );

      return findTournamentMatchByKey.get(tournamentId, roundNumber, matchNumber);
    },
    async updateTournament(args) {
      updateTournamentById.run(
        args.name,
        args.tournamentType,
        args.templateKey ?? null,
        args.drawDate ?? null,
        args.roundScheduleJson ?? "[]",
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
            template_key,
            draw_date,
            round_schedule_json,
            registration_start_date,
            registration_end_date,
            score_submission_start_date,
            score_submission_end_date,
            created_by,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `,
        [
          args.name,
          args.tournamentType,
          args.templateKey ?? null,
          args.drawDate ?? null,
          args.roundScheduleJson ?? "[]",
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
          `DELETE FROM tournament_matches WHERE tournament_id = $1`,
          [tournamentId],
        );
        await client.query(
          `DELETE FROM tournament_rounds WHERE tournament_id = $1`,
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
            tournaments.template_key,
            tournaments.draw_date,
            tournaments.round_schedule_json,
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
    async findTournamentMatchByKey({ matchNumber, roundNumber, tournamentId }) {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            match_number,
            left_member_username,
            right_member_username,
            left_score,
            right_score,
            winner_username,
            submitted_by_username,
            submitted_at_date,
            submitted_at_time,
            confirmed_by_username,
            confirmed_at_date,
            confirmed_at_time,
            disputed_by_username,
            disputed_at_date,
            disputed_at_time,
            dispute_reason,
            status
          FROM tournament_matches
          WHERE tournament_id = $1 AND round_number = $2 AND match_number = $3
          LIMIT 1
        `,
        [tournamentId, roundNumber, matchNumber],
      );

      return result.rows[0] ?? null;
    },
    async listAllTournamentMatches() {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            match_number,
            left_member_username,
            right_member_username,
            left_score,
            right_score,
            winner_username,
            submitted_by_username,
            submitted_at_date,
            submitted_at_time,
            confirmed_by_username,
            confirmed_at_date,
            confirmed_at_time,
            disputed_by_username,
            disputed_at_date,
            disputed_at_time,
            dispute_reason,
            status
          FROM tournament_matches
          ORDER BY tournament_id ASC, round_number ASC, match_number ASC
        `,
      );

      return result.rows;
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
    async listAllTournamentRounds() {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            title,
            publish_date,
            submission_deadline,
            status
          FROM tournament_rounds
          ORDER BY tournament_id ASC, round_number ASC
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
    async listTournamentMatchesByTournamentId(tournamentId) {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            match_number,
            left_member_username,
            right_member_username,
            left_score,
            right_score,
            winner_username,
            submitted_by_username,
            submitted_at_date,
            submitted_at_time,
            confirmed_by_username,
            confirmed_at_date,
            confirmed_at_time,
            disputed_by_username,
            disputed_at_date,
            disputed_at_time,
            dispute_reason,
            status
          FROM tournament_matches
          WHERE tournament_id = $1
          ORDER BY round_number ASC, match_number ASC
        `,
        [tournamentId],
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
    async listTournamentRoundsByTournamentId(tournamentId) {
      const result = await pool.query(
        `
          SELECT
            tournament_id,
            round_number,
            title,
            publish_date,
            submission_deadline,
            status
          FROM tournament_rounds
          WHERE tournament_id = $1
          ORDER BY round_number ASC
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
            tournaments.template_key,
            tournaments.draw_date,
            tournaments.round_schedule_json,
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
    async replaceTournamentRounds({ tournamentId, rounds }) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM tournament_rounds WHERE tournament_id = $1`,
          [tournamentId],
        );

        for (const round of rounds) {
          await client.query(
            `
              INSERT INTO tournament_rounds (
                tournament_id,
                round_number,
                title,
                publish_date,
                submission_deadline,
                status
              )
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              tournamentId,
              round.roundNumber,
              round.title,
              round.publishDate ?? null,
              round.submissionDeadline ?? null,
              round.status ?? "scheduled",
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
    async replaceTournamentMatches({ tournamentId, matches }) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const existingMatchesResult = await client.query(
          `
            SELECT
              tournament_id,
              round_number,
              match_number,
              left_member_username,
              right_member_username,
              submitted_by_username,
              submitted_at_date,
              submitted_at_time,
              confirmed_by_username,
              confirmed_at_date,
              confirmed_at_time,
              disputed_by_username,
              disputed_at_date,
              disputed_at_time,
              dispute_reason
            FROM tournament_matches
            WHERE tournament_id = $1
          `,
          [tournamentId],
        );
        const existingMatchesByKey = new Map(
          existingMatchesResult.rows.map((match) => [
            `${match.round_number}:${match.match_number}`,
            match,
          ]),
        );
        await client.query(
          `DELETE FROM tournament_matches WHERE tournament_id = $1`,
          [tournamentId],
        );

        for (const match of matches) {
          const existingMatch = existingMatchesByKey.get(
            `${match.roundNumber}:${match.matchNumber}`,
          );
          const workflowValues = normalizePersistedWorkflowValues(existingMatch, match);
          await client.query(
            `
              INSERT INTO tournament_matches (
                tournament_id,
                round_number,
                match_number,
                left_member_username,
                right_member_username,
                left_score,
                right_score,
                winner_username,
                submitted_by_username,
                submitted_at_date,
                submitted_at_time,
                confirmed_by_username,
                confirmed_at_date,
                confirmed_at_time,
                disputed_by_username,
                disputed_at_date,
                disputed_at_time,
                dispute_reason,
                status
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `,
            [
              tournamentId,
              match.roundNumber,
              match.matchNumber,
              match.leftMemberUsername ?? null,
              match.rightMemberUsername ?? null,
              match.leftScore ?? null,
              match.rightScore ?? null,
              match.winnerUsername ?? null,
              workflowValues.submittedByUsername,
              workflowValues.submittedAtDate,
              workflowValues.submittedAtTime,
              workflowValues.confirmedByUsername,
              workflowValues.confirmedAtDate,
              workflowValues.confirmedAtTime,
              workflowValues.disputedByUsername,
              workflowValues.disputedAtDate,
              workflowValues.disputedAtTime,
              workflowValues.disputeReason,
              match.status ?? "scheduled",
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
    async updateTournamentMatchWorkflow({
      confirmedByUsername = null,
      confirmedTimestampParts = [null, null],
      disputedByUsername = null,
      disputedTimestampParts = [null, null],
      disputeReason = null,
      leftScore = null,
      matchNumber,
      rightScore = null,
      roundNumber,
      status,
      submittedByUsername = null,
      submittedTimestampParts = [null, null],
      tournamentId,
      winnerUsername = null,
    }) {
      await pool.query(
        `
          UPDATE tournament_matches
          SET
            left_score = $1,
            right_score = $2,
            winner_username = $3,
            submitted_by_username = $4,
            submitted_at_date = $5,
            submitted_at_time = $6,
            confirmed_by_username = $7,
            confirmed_at_date = $8,
            confirmed_at_time = $9,
            disputed_by_username = $10,
            disputed_at_date = $11,
            disputed_at_time = $12,
            dispute_reason = $13,
            status = $14
          WHERE tournament_id = $15 AND round_number = $16 AND match_number = $17
        `,
        [
          leftScore,
          rightScore,
          winnerUsername,
          submittedByUsername,
          ...submittedTimestampParts,
          confirmedByUsername,
          ...confirmedTimestampParts,
          disputedByUsername,
          ...disputedTimestampParts,
          disputeReason,
          status,
          tournamentId,
          roundNumber,
          matchNumber,
        ],
      );

      return this.findTournamentMatchByKey({
        tournamentId,
        roundNumber,
        matchNumber,
      });
    },
    async updateTournament(args) {
      await pool.query(
        `
          UPDATE tournaments
          SET
            name = $1,
            tournament_type = $2,
            template_key = $3,
            draw_date = $4,
            round_schedule_json = $5,
            registration_start_date = $6,
            registration_end_date = $7,
            score_submission_start_date = $8,
            score_submission_end_date = $9
          WHERE id = $10
        `,
        [
          args.name,
          args.tournamentType,
          args.templateKey ?? null,
          args.drawDate ?? null,
          args.roundScheduleJson ?? "[]",
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
