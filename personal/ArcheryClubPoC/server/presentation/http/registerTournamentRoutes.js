export function registerTournamentRoutes({
  actorHasPermission,
  app,
  buildTournament,
  buildTournamentDataMaps,
  db,
  deleteTournamentById,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentScoresByTournamentId,
  deleteTournamentRegistration,
  exportsDirectory,
  findTournamentById,
  getActorUser,
  getUtcTimestampParts,
  insertTournament,
  insertTournamentRegistration,
  listTournamentRegistrationsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  path,
  PERMISSIONS,
  sanitizeFileNameSegment,
  toUtcDateString,
  TOURNAMENT_TYPE_OPTIONS,
  updateTournamentById,
  upsertTournamentScore,
  writeFileSync,
}) {
  app.get("/api/tournaments", (req, res) => {
    const actor = getActorUser(req);
    const { registrationsByTournamentId, scoresByTournamentId } =
      buildTournamentDataMaps();
    const tournaments = listTournaments.all().map((tournament) =>
      buildTournament(
        tournament,
        registrationsByTournamentId.get(tournament.id) ?? [],
        scoresByTournamentId.get(tournament.id) ?? [],
        actor?.username ?? null,
      ),
    );

    res.json({
      success: true,
      tournaments,
      tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
    });
  });

  app.post("/api/tournaments", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create tournaments.",
      });
      return;
    }

    const {
      name,
      tournamentType,
      registrationStartDate,
      registrationEndDate,
      scoreSubmissionStartDate,
      scoreSubmissionEndDate,
    } = req.body ?? {};

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (
      !trimmedName ||
      !TOURNAMENT_TYPE_OPTIONS.some(
        (option) => option.value === tournamentType,
      ) ||
      !registrationStartDate ||
      !registrationEndDate ||
      !scoreSubmissionStartDate ||
      !scoreSubmissionEndDate
    ) {
      res.status(400).json({
        success: false,
        message:
          "Name, tournament type, registration window, and score window are required.",
      });
      return;
    }

    if (
      registrationStartDate > registrationEndDate ||
      scoreSubmissionStartDate > scoreSubmissionEndDate
    ) {
      res.status(400).json({
        success: false,
        message: "End dates must be on or after the related start dates.",
      });
      return;
    }

    if (registrationEndDate > scoreSubmissionEndDate) {
      res.status(400).json({
        success: false,
        message:
          "The registration window must finish on or before the score window end date.",
      });
      return;
    }

    const insertResult = insertTournament.run(
      trimmedName,
      tournamentType,
      registrationStartDate,
      registrationEndDate,
      scoreSubmissionStartDate,
      scoreSubmissionEndDate,
      actor.username,
      ...getUtcTimestampParts(),
    );
    const tournament = findTournamentById.get(insertResult.lastInsertRowid);

    res.status(201).json({
      success: true,
      tournament: buildTournament(tournament, [], [], actor.username),
    });
  });

  app.put("/api/tournaments/:id", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to amend tournaments.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const {
      name,
      tournamentType,
      registrationStartDate,
      registrationEndDate,
      scoreSubmissionStartDate,
      scoreSubmissionEndDate,
    } = req.body ?? {};

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (
      !trimmedName ||
      !TOURNAMENT_TYPE_OPTIONS.some(
        (option) => option.value === tournamentType,
      ) ||
      !registrationStartDate ||
      !registrationEndDate ||
      !scoreSubmissionStartDate ||
      !scoreSubmissionEndDate
    ) {
      res.status(400).json({
        success: false,
        message:
          "Name, tournament type, registration window, and score window are required.",
      });
      return;
    }

    if (
      registrationStartDate > registrationEndDate ||
      scoreSubmissionStartDate > scoreSubmissionEndDate
    ) {
      res.status(400).json({
        success: false,
        message: "End dates must be on or after the related start dates.",
      });
      return;
    }

    if (registrationEndDate > scoreSubmissionEndDate) {
      res.status(400).json({
        success: false,
        message:
          "The registration window must finish on or before the score window end date.",
      });
      return;
    }

    updateTournamentById.run(
      trimmedName,
      tournamentType,
      registrationStartDate,
      registrationEndDate,
      scoreSubmissionStartDate,
      scoreSubmissionEndDate,
      tournament.id,
    );

    const updatedTournament = findTournamentById.get(tournament.id);

    res.json({
      success: true,
      tournament: buildTournament(
        updatedTournament,
        listTournamentRegistrationsByTournamentId.all(tournament.id),
        listTournamentScoresByTournamentId.all(tournament.id),
        actor.username,
      ),
    });
  });

  const deleteTournamentCascade = db.transaction((tournamentId) => {
    deleteTournamentScoresByTournamentId.run(tournamentId);
    deleteTournamentRegistrationsByTournamentId.run(tournamentId);
    deleteTournamentById.run(tournamentId);
  });

  app.delete("/api/tournaments/:id", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete tournaments.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    deleteTournamentCascade(tournament.id);

    res.json({
      success: true,
      deletedTournamentId: tournament.id,
      message: `${tournament.name} deleted successfully.`,
    });
  });

  app.post("/api/tournaments/:id/register", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const today = toUtcDateString(new Date());

    if (
      today < tournament.registration_start_date ||
      today > tournament.registration_end_date
    ) {
      res.status(400).json({
        success: false,
        message: "The registration window is not currently open.",
      });
      return;
    }

    try {
      insertTournamentRegistration.run(
        tournament.id,
        actor.username,
        ...getUtcTimestampParts(),
      );
    } catch (error) {
      if (
        error?.message?.includes(
          "UNIQUE constraint failed: tournament_registrations.tournament_id, tournament_registrations.member_username",
        )
      ) {
        res.status(409).json({
          success: false,
          message: "You are already registered for this tournament.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to register for this tournament.",
      });
      return;
    }

    res.json({
      success: true,
      tournament: buildTournament(
        tournament,
        listTournamentRegistrationsByTournamentId.all(tournament.id),
        listTournamentScoresByTournamentId.all(tournament.id),
        actor.username,
      ),
    });
  });

  app.delete("/api/tournaments/:id/register", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const today = toUtcDateString(new Date());

    if (
      today < tournament.registration_start_date ||
      today > tournament.registration_end_date
    ) {
      res.status(400).json({
        success: false,
        message: "The registration window is not currently open.",
      });
      return;
    }

    const deleteResult = deleteTournamentRegistration.run(
      tournament.id,
      actor.id,
    );

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: "You are not registered for this tournament.",
      });
      return;
    }

    res.json({
      success: true,
      tournament: buildTournament(
        tournament,
        listTournamentRegistrationsByTournamentId.all(tournament.id),
        listTournamentScoresByTournamentId.all(tournament.id),
        actor.username,
      ),
    });
  });

  app.post("/api/tournaments/:id/score", (req, res) => {
    const actor = getActorUser(req);
    const normalizedScore = Number.parseInt(req.body?.score, 10);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!Number.isInteger(normalizedScore) || normalizedScore < 0) {
      res.status(400).json({
        success: false,
        message: "Please enter a valid whole-number score.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const today = toUtcDateString(new Date());

    if (
      today < tournament.score_submission_start_date ||
      today > tournament.score_submission_end_date
    ) {
      res.status(400).json({
        success: false,
        message: "The score submission window is not currently open.",
      });
      return;
    }

    const builtTournament = buildTournament(
      tournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    );

    if (!builtTournament.canSubmitScore || !builtTournament.currentRoundNumber) {
      res.status(400).json({
        success: false,
        message: "You do not have a score to submit for the current round.",
      });
      return;
    }

    upsertTournamentScore.run(
      tournament.id,
      builtTournament.currentRoundNumber,
      actor.username,
      normalizedScore,
      ...getUtcTimestampParts(),
    );

    res.json({
      success: true,
      tournament: buildTournament(
        tournament,
        listTournamentRegistrationsByTournamentId.all(tournament.id),
        listTournamentScoresByTournamentId.all(tournament.id),
        actor.username,
      ),
    });
  });

  app.post("/api/tournaments/:id/competitors-export", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to export tournament competitors.",
      });
      return;
    }

    const tournament = findTournamentById.get(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const registrations = listTournamentRegistrationsByTournamentId.all(
      tournament.id,
    );
    const builtTournament = buildTournament(
      tournament,
      registrations,
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    );

    const lines = [
      `Tournament: ${builtTournament.name}`,
      `Type: ${builtTournament.typeLabel}`,
      `Registration window: ${builtTournament.registrationWindow.startDate} to ${builtTournament.registrationWindow.endDate}`,
      `Score window: ${builtTournament.scoreWindow.startDate} to ${builtTournament.scoreWindow.endDate}`,
      `Registered competitors: ${builtTournament.registrationCount}`,
      "",
      "Competing members:",
      ...(builtTournament.registrations.length > 0
        ? builtTournament.registrations.map(
            (registration, index) => `${index + 1}. ${registration.fullName}`,
          )
        : ["No registered competitors."]),
      "",
      `Exported at: ${new Date().toISOString()}`,
      `Exported by: ${actor.first_name} ${actor.surname} (${actor.username})`,
    ];

    const fileName = [
      sanitizeFileNameSegment(builtTournament.name, "tournament"),
      "competitors",
      toUtcDateString(new Date()),
    ].join("-");
    const filePath = path.join(exportsDirectory, `${fileName}.txt`);

    writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");

    res.json({
      success: true,
      filePath,
      fileName: `${fileName}.txt`,
      tournament: {
        id: builtTournament.id,
        name: builtTournament.name,
        registrationCount: builtTournament.registrationCount,
      },
    });
  });
}
