import {
  buildMatchHandicapSnapshot,
  buildParticipantHandicapSnapshot,
  calculateAdjustedMatchScores,
  isCaptainsSwordTournament,
} from "../../domain/services/tournamentHandicapService.js";

export function registerTournamentRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  buildTournament,
  buildTournamentDataMaps,
  exportsDirectory,
  goldenRecordsCurrentHandicapService,
  getActorUser,
  getUtcTimestampParts,
  handicapTableGateway,
  memberDirectoryGateway,
  path,
  PERMISSIONS,
  sanitizeFileNameSegment,
  serverEventBus,
  toUtcDateString,
  tournamentGateway,
  TOURNAMENT_TEMPLATE_OPTIONS,
  TOURNAMENT_TYPE_OPTIONS,
  writeFileSync,
}) {
  const broadcastTournamentsUpdated = (scope = "tournaments") => {
    serverEventBus?.broadcastToAll("tournaments.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  };

  const findTemplateByKey = (templateKey) =>
    TOURNAMENT_TEMPLATE_OPTIONS.find((template) => template.key === templateKey) ??
    null;

  const normalizeAutomaticRoundPlan = ({
    roundOneStartDate,
    roundRestDays,
    roundWindowDays,
  }) => {
    const normalizedRoundWindowDays = Number.parseInt(roundWindowDays, 10);
    const normalizedRoundRestDays = Number.parseInt(roundRestDays, 10);

    if (
      typeof roundOneStartDate !== "string" ||
      !roundOneStartDate.trim() ||
      !Number.isInteger(normalizedRoundWindowDays) ||
      normalizedRoundWindowDays < 1 ||
      !Number.isInteger(normalizedRoundRestDays) ||
      normalizedRoundRestDays < 0
    ) {
      return null;
    }

    return {
      mode: "automatic",
      firstRoundStartDate: roundOneStartDate.trim(),
      roundWindowDays: normalizedRoundWindowDays,
      roundRestDays: normalizedRoundRestDays,
    };
  };

  const parseTournamentMatchId = (value) => {
    const normalizedValue = String(value ?? "").trim();
    const match = normalizedValue.match(/^tournament-(\d+)-round-(\d+)-match-(\d+)$/u);

    if (!match) {
      return null;
    }

    return {
      tournamentId: Number.parseInt(match[1], 10),
      roundNumber: Number.parseInt(match[2], 10),
      matchNumber: Number.parseInt(match[3], 10),
    };
  };

  const loadTournamentSnapshot = async (tournament, actorUsername = null) => {
    const [rawRegistrations, rounds, scores, matches] = await Promise.all([
      tournamentGateway.listTournamentRegistrationsByTournamentId(tournament.id),
      tournamentGateway.listTournamentRoundsByTournamentId(tournament.id),
      tournamentGateway.listTournamentScoresByTournamentId(tournament.id),
      tournamentGateway.listTournamentMatchesByTournamentId(tournament.id),
    ]);
    const registrations = await enrichTournamentRegistrations(
      tournament,
      rawRegistrations,
    );

    return {
      registrations,
      rounds,
      scores,
      matches,
      builtTournament: buildTournament(
        tournament,
        registrations,
        scores,
        actorUsername,
        rounds,
        matches,
      ),
    };
  };

  const parseIsoTimestampParts = (value) => {
    const normalizedValue = String(value ?? "").trim();

    if (!normalizedValue || !normalizedValue.includes("T")) {
      return [null, null];
    }

    const [datePart, timePart] = normalizedValue.split("T");
    return [datePart || null, timePart || null];
  };

  const TOURNAMENT_BOW_OPTIONS = [
    { code: "BB", discipline: "Bare Bow" },
    { code: "CB", discipline: "Compound Bow" },
    { code: "LB", discipline: "Long Bow" },
    { code: "RC", discipline: "Recurve Bow" },
  ];
  const bowOptionByCode = new Map(
    TOURNAMENT_BOW_OPTIONS.map((option) => [option.code, option]),
  );
  const normalizeBowCode = (value) => String(value ?? "").trim().toUpperCase();
  const resolveBowOptionsForDisciplines = (disciplines = []) =>
    TOURNAMENT_BOW_OPTIONS.filter((option) => disciplines.includes(option.discipline));
  const mapGoldenRecordsBowClassToBowCode = (bowClass) => {
    switch (String(bowClass ?? "").trim().toLowerCase()) {
      case "barebow":
        return "BB";
      case "compound":
        return "CB";
      case "longbow":
        return "LB";
      case "recurve":
        return "RC";
      default:
        return "";
    }
  };
  const getMostRecentIndoorHandicapEntry = (handicaps = []) => {
    const indoorEntries = handicaps.filter(
      (entry) =>
        String(entry?.type ?? "").trim().toLowerCase() === "indoor" &&
        Number.isInteger(entry?.handicap),
    );

    if (indoorEntries.length === 0) {
      return null;
    }

    return [...indoorEntries].sort((left, right) => {
      const leftTimestamp = Date.parse(
        String(left?.updated ?? left?.achieved ?? "").trim(),
      );
      const rightTimestamp = Date.parse(
        String(right?.updated ?? right?.achieved ?? "").trim(),
      );

      return (
        (Number.isFinite(rightTimestamp) ? rightTimestamp : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(leftTimestamp) ? leftTimestamp : Number.NEGATIVE_INFINITY)
      );
    })[0];
  };
  const inferBowCodeFromDisciplines = (disciplineRows = []) => {
    const eligibleBowOptions = resolveBowOptionsForDisciplines(
      disciplineRows.map((row) => row.discipline),
    );

    return eligibleBowOptions.length === 1 ? eligibleBowOptions[0].code : "";
  };
  const buildRegistrationContext = async (tournament, username) => {
    const user = await memberDirectoryGateway.findUserByUsername(username);

    if (!user) {
      return null;
    }

    const disciplines = memberDirectoryGateway?.findDisciplinesByUsername
      ? await memberDirectoryGateway.findDisciplinesByUsername(username)
      : [];
    const eligibleBowOptions = resolveBowOptionsForDisciplines(disciplines);

    let suggestedBowCode =
      eligibleBowOptions.length === 1 ? eligibleBowOptions[0].code : "";

    if (
      !suggestedBowCode &&
      isCaptainsSwordTournament(tournament) &&
      goldenRecordsCurrentHandicapService?.isEnabled
    ) {
      const goldenRecordsSnapshot =
        await goldenRecordsCurrentHandicapService.getSnapshotForMember({
          archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
          firstName: user.first_name ?? "",
          goldenRecordsId: user.gr_id ?? "",
          surname: user.surname ?? "",
          username: user.username,
        });
      const recentIndoorHandicap = getMostRecentIndoorHandicapEntry(
        goldenRecordsSnapshot?.handicaps ?? [],
      );

      suggestedBowCode = mapGoldenRecordsBowClassToBowCode(
        recentIndoorHandicap?.bowClass,
      );
    }

    return {
      eligibleBowOptions,
      suggestedBowCode,
      user,
    };
  };
  const enrichTournamentRegistrations = async (tournament, registrations = []) =>
    Promise.all(
      registrations.map(async (registration) => {
        const existingBowCode = normalizeBowCode(
          registration.bow_code ?? registration.bowCode ?? null,
        );

        if (existingBowCode) {
          return {
            ...registration,
            bow_code: existingBowCode,
            bowCode: existingBowCode,
          };
        }

        const username = registration.member_username ?? registration.username ?? "";

        if (!username || !memberDirectoryGateway?.findDisciplinesByUsername) {
          return {
            ...registration,
            bow_code: null,
            bowCode: null,
          };
        }

        const disciplines = await memberDirectoryGateway.findDisciplinesByUsername(username);
        let resolvedBowCode = inferBowCodeFromDisciplines(disciplines);

        if (
          !resolvedBowCode &&
          isCaptainsSwordTournament(tournament) &&
          goldenRecordsCurrentHandicapService?.isEnabled &&
          memberDirectoryGateway?.findUserByUsername
        ) {
          const user = await memberDirectoryGateway.findUserByUsername(username);

          if (user) {
            const goldenRecordsSnapshot =
              await goldenRecordsCurrentHandicapService.getSnapshotForMember({
                archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
                firstName: user.first_name ?? "",
                goldenRecordsId: user.gr_id ?? "",
                surname: user.surname ?? "",
                username: user.username,
              });
            const recentIndoorHandicap = getMostRecentIndoorHandicapEntry(
              goldenRecordsSnapshot?.handicaps ?? [],
            );

            resolvedBowCode = mapGoldenRecordsBowClassToBowCode(
              recentIndoorHandicap?.bowClass,
            );
          }
        }

        return {
          ...registration,
          bow_code: resolvedBowCode || null,
          bowCode: resolvedBowCode || null,
        };
      }),
    );
  const tournamentNeedsCaptainsSwordMatchBackfill = (tournament, matches = []) =>
    isCaptainsSwordTournament(tournament) &&
    matches.some((match) => {
      const hasParticipants =
        Boolean(match.left_member_username ?? match.leftMemberUsername) &&
        Boolean(match.right_member_username ?? match.rightMemberUsername);

      if (!hasParticipants) {
        return false;
      }

      return (
        !Number.isInteger(match.left_handicap_value ?? match.leftHandicapValue) &&
        !Number.isInteger(match.right_handicap_value ?? match.rightHandicapValue) &&
        !Number.isInteger(match.left_adjusted_score ?? match.leftAdjustedScore) &&
        !Number.isInteger(match.right_adjusted_score ?? match.rightAdjustedScore)
      );
    });

  const buildPersistedHandicapPayload = (match, leftScore = null, rightScore = null) => {
    const handicap = match?.handicap ?? null;
    const adjusted = calculateAdjustedMatchScores({
      leftAllowancePoints: handicap?.competitorA?.allowancePoints ?? null,
      leftScore,
      rightAllowancePoints: handicap?.competitorB?.allowancePoints ?? null,
      rightScore,
    });

    return {
      handicapAllowancePercent: handicap?.allowancePercent ?? null,
      leftAdjustedScore: adjusted.leftAdjustedScore,
      leftAllowancePoints: handicap?.competitorA?.allowancePoints ?? null,
      leftHandicapBowClass: handicap?.competitorA?.bowClass ?? null,
      leftHandicapDiscipline: handicap?.competitorA?.discipline ?? null,
      leftHandicapTableKey: handicap?.competitorA?.tableKey ?? null,
      leftHandicapTableTitle: handicap?.competitorA?.tableTitle ?? null,
      leftHandicapType: handicap?.competitorA?.handicapType ?? null,
      leftHandicapValue: handicap?.competitorA?.handicapValue ?? null,
      leftReferenceScore: handicap?.competitorA?.referenceScore ?? null,
      rightAdjustedScore: adjusted.rightAdjustedScore,
      rightAllowancePoints: handicap?.competitorB?.allowancePoints ?? null,
      rightHandicapBowClass: handicap?.competitorB?.bowClass ?? null,
      rightHandicapDiscipline: handicap?.competitorB?.discipline ?? null,
      rightHandicapTableKey: handicap?.competitorB?.tableKey ?? null,
      rightHandicapTableTitle: handicap?.competitorB?.tableTitle ?? null,
      rightHandicapType: handicap?.competitorB?.handicapType ?? null,
      rightHandicapValue: handicap?.competitorB?.handicapValue ?? null,
      rightReferenceScore: handicap?.competitorB?.referenceScore ?? null,
    };
  };

  const resolveMatchWinner = ({ leftScore, match, rightScore, tournament }) => {
    const handicapPayload = buildPersistedHandicapPayload(match, leftScore, rightScore);
    const useAdjustedScores =
      isCaptainsSwordTournament(tournament) &&
      Number.isInteger(handicapPayload.leftAdjustedScore) &&
      Number.isInteger(handicapPayload.rightAdjustedScore);
    const leftComparable = useAdjustedScores
      ? handicapPayload.leftAdjustedScore
      : leftScore;
    const rightComparable = useAdjustedScores
      ? handicapPayload.rightAdjustedScore
      : rightScore;
    let winnerUsername = null;

    if (leftComparable > rightComparable) {
      winnerUsername = match.competitorA?.username ?? null;
    } else if (rightComparable > leftComparable) {
      winnerUsername = match.competitorB?.username ?? null;
    }

    return {
      ...handicapPayload,
      comparisonMode: useAdjustedScores ? "adjusted" : "raw",
      isTie: leftComparable === rightComparable,
      winnerUsername,
    };
  };

  const buildCaptainsSwordParticipantSnapshots = async (registrations) => {
    if (
      !goldenRecordsCurrentHandicapService?.isEnabled ||
      !handicapTableGateway ||
      !memberDirectoryGateway
    ) {
      return new Map();
    }

    const handicapTablesSnapshot = await handicapTableGateway.listHandicapTables();
    const snapshots = await Promise.all(
      registrations.map(async (registration) => {
        const username = registration.member_username ?? registration.username ?? null;

        if (!username) {
          return [username, null];
        }

        const user = await memberDirectoryGateway.findUserByUsername(username);

        if (!user) {
          return [username, null];
        }

        const goldenRecordsSnapshot =
          await goldenRecordsCurrentHandicapService.getSnapshotForMember({
            archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
            firstName: user.first_name ?? "",
            goldenRecordsId: user.gr_id ?? "",
            surname: user.surname ?? "",
            username: user.username,
          });

        return [
          username,
          buildParticipantHandicapSnapshot({
            handicapTablesSnapshot,
            handicaps: goldenRecordsSnapshot?.handicaps ?? [],
            preferredBowCode: registration.bow_code ?? registration.bowCode ?? null,
          }),
        ];
      }),
    );

    return new Map(snapshots.filter(([username]) => Boolean(username)));
  };

  const buildPersistedMatchesForTournament = async ({
    builtTournament,
    registrations,
    tournament,
  }) => {
    const participantSnapshotsByUsername = isCaptainsSwordTournament(tournament)
      ? await buildCaptainsSwordParticipantSnapshots(registrations)
      : new Map();

    return (builtTournament.engine?.rounds ?? []).flatMap((round) =>
      (round.matches ?? []).map((match, index) => {
        const handicapSnapshot = isCaptainsSwordTournament(tournament)
          ? buildMatchHandicapSnapshot({
              leftParticipantUsername: match.competitorA?.username ?? null,
              participantSnapshotsByUsername,
              rightParticipantUsername: match.competitorB?.username ?? null,
            })
          : {};
        const adjustedScores = calculateAdjustedMatchScores({
          leftAllowancePoints: handicapSnapshot.leftAllowancePoints ?? null,
          leftScore: match.score?.competitorA ?? null,
          rightAllowancePoints: handicapSnapshot.rightAllowancePoints ?? null,
          rightScore: match.score?.competitorB ?? null,
        });

        return {
          roundNumber: round.roundNumber,
          matchNumber: index + 1,
          leftMemberUsername: match.competitorA?.username ?? null,
          rightMemberUsername: match.competitorB?.username ?? null,
          leftScore: match.score?.competitorA ?? null,
          rightScore: match.score?.competitorB ?? null,
          winnerUsername: match.winner?.username ?? null,
          submittedByUsername: match.workflow?.submittedByUsername ?? null,
          submittedAt: match.workflow?.submittedAt ?? null,
          confirmedByUsername: match.workflow?.confirmedByUsername ?? null,
          confirmedAt: match.workflow?.confirmedAt ?? null,
          disputedByUsername: match.workflow?.disputedByUsername ?? null,
          disputedAt: match.workflow?.disputedAt ?? null,
          disputeReason: match.workflow?.disputeReason ?? null,
          handicapAllowancePercent: handicapSnapshot.allowancePercent ?? null,
          leftHandicapValue: handicapSnapshot.leftHandicapValue ?? null,
          leftHandicapType: handicapSnapshot.leftHandicapType ?? null,
          leftHandicapBowClass: handicapSnapshot.leftBowClass ?? null,
          leftHandicapDiscipline: handicapSnapshot.leftDiscipline ?? null,
          leftReferenceScore: handicapSnapshot.leftReferenceScore ?? null,
          leftAllowancePoints: handicapSnapshot.leftAllowancePoints ?? null,
          leftAdjustedScore: adjustedScores.leftAdjustedScore,
          leftHandicapTableKey: handicapSnapshot.leftTableKey ?? null,
          leftHandicapTableTitle: handicapSnapshot.leftTableTitle ?? null,
          rightHandicapValue: handicapSnapshot.rightHandicapValue ?? null,
          rightHandicapType: handicapSnapshot.rightHandicapType ?? null,
          rightHandicapBowClass: handicapSnapshot.rightBowClass ?? null,
          rightHandicapDiscipline: handicapSnapshot.rightDiscipline ?? null,
          rightReferenceScore: handicapSnapshot.rightReferenceScore ?? null,
          rightAllowancePoints: handicapSnapshot.rightAllowancePoints ?? null,
          rightAdjustedScore: adjustedScores.rightAdjustedScore,
          rightHandicapTableKey: handicapSnapshot.rightTableKey ?? null,
          rightHandicapTableTitle: handicapSnapshot.rightTableTitle ?? null,
          status: match.status ?? "scheduled",
        };
      }),
    );
  };

  const syncTournamentMatches = async (tournament, actorUsername = null) => {
    const { registrations, rounds, scores, matches, builtTournament } =
      await loadTournamentSnapshot(tournament, actorUsername);
    await tournamentGateway.replaceTournamentRounds({
      tournamentId: tournament.id,
      rounds: (builtTournament.roundSchedule ?? []).map((round) => ({
        roundNumber: round.roundNumber,
        title: round.title,
        publishDate: round.publishDate ?? null,
        submissionDeadline: round.submissionDeadline ?? null,
        status: round.status ?? "scheduled",
      })),
    });
    const persistedMatches = await buildPersistedMatchesForTournament({
      builtTournament,
      registrations,
      tournament,
    });
    await tournamentGateway.replaceTournamentMatches({
      tournamentId: tournament.id,
      matches: persistedMatches,
    });

    return loadTournamentSnapshot(tournament, actorUsername);
  };

  app.get("/api/tournament-templates", async (_req, res) => {
    res.json({
      success: true,
      tournamentTemplates: TOURNAMENT_TEMPLATE_OPTIONS,
    });
  });

  app.get("/api/tournaments", async (req, res) => {
    const actor = getActorUser(req);
    const {
      matchesByTournamentId,
      registrationsByTournamentId,
      roundsByTournamentId,
      scoresByTournamentId,
    } =
      await buildTournamentDataMaps();
    const tournaments = await Promise.all(
      (await tournamentGateway.listTournaments()).map(async (tournament) => {
        const registrations = await enrichTournamentRegistrations(
          tournament,
          registrationsByTournamentId.get(tournament.id) ?? [],
        );
        const matches = matchesByTournamentId.get(tournament.id) ?? [];

        if (tournamentNeedsCaptainsSwordMatchBackfill(tournament, matches)) {
          const { builtTournament } = await syncTournamentMatches(
            tournament,
            actor?.username ?? null,
          );

          return builtTournament;
        }

        return buildTournament(
          tournament,
          registrations,
          scoresByTournamentId.get(tournament.id) ?? [],
          actor?.username ?? null,
          roundsByTournamentId.get(tournament.id) ?? [],
          matches,
        );
      }),
    );

    res.json({
      success: true,
      tournaments,
      tournamentTemplates: TOURNAMENT_TEMPLATE_OPTIONS,
      tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
    });
  });

  app.get("/api/tournaments/:id/registration-candidates", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage tournament registrations.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const registrations =
      await tournamentGateway.listTournamentRegistrationsByTournamentId(tournament.id);
    const registeredUsernames = new Set(
      registrations.map((registration) =>
        String(registration.member_username ?? registration.username ?? "").trim().toLowerCase()),
    );
    const users = await memberDirectoryGateway.listAllUsers();
    const candidates = await Promise.all(
      users.map(async (user) => {
        if (registeredUsernames.has(String(user.username ?? "").trim().toLowerCase())) {
          return null;
        }

        const registrationContext = await buildRegistrationContext(
          tournament,
          user.username,
        );

        if (!registrationContext) {
          return null;
        }

        return {
          bowOptions: registrationContext.eligibleBowOptions,
          fullName: `${user.first_name} ${user.surname}`.trim(),
          suggestedBowCode: registrationContext.suggestedBowCode || null,
          username: user.username,
        };
      }),
    );

    res.json({
      success: true,
      members: candidates
        .filter(Boolean)
        .sort((left, right) => left.fullName.localeCompare(right.fullName)),
    });
  });

  app.post("/api/tournaments", async (req, res) => {
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
      templateKey,
      tournamentType,
      roundOneStartDate,
      roundWindowDays,
      roundRestDays,
      registrationStartDate,
      registrationEndDate,
    } = req.body ?? {};
    const selectedTemplate =
      typeof templateKey === "string" && templateKey.trim()
        ? findTemplateByKey(templateKey.trim())
        : null;
    const normalizedTournamentType =
      selectedTemplate?.tournamentType ?? tournamentType;
    const automaticRoundPlan = normalizeAutomaticRoundPlan({
      roundOneStartDate,
      roundWindowDays,
      roundRestDays,
    });
    const requiresRoundDeadlines =
      selectedTemplate?.capabilities?.supportsRoundDeadlines ?? false;

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (
      !trimmedName ||
      (typeof templateKey === "string" &&
        templateKey.trim() &&
        !selectedTemplate) ||
      !TOURNAMENT_TYPE_OPTIONS.some(
        (option) => option.value === normalizedTournamentType,
      ) ||
      !registrationStartDate ||
      !registrationEndDate ||
      (requiresRoundDeadlines && !automaticRoundPlan)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Name, tournament type, registration window, and automatic round settings are required.",
      });
      return;
    }

    if (registrationStartDate > registrationEndDate) {
      res.status(400).json({
        success: false,
        message: "End dates must be on or after the related start dates.",
      });
      return;
    }

    if (
      requiresRoundDeadlines &&
      automaticRoundPlan.firstRoundStartDate < registrationEndDate
    ) {
      res.status(400).json({
        success: false,
        message:
          "Round 1 must start on or after the registration close date.",
      });
      return;
    }

    const tournament = await tournamentGateway.createTournament({
      createdByUsername: actor.username,
      drawDate: automaticRoundPlan?.firstRoundStartDate || null,
      name: trimmedName,
      registrationEndDate,
      registrationStartDate,
      roundScheduleJson: JSON.stringify(automaticRoundPlan ?? []),
      scoreSubmissionEndDate: automaticRoundPlan?.firstRoundStartDate ?? registrationEndDate,
      scoreSubmissionStartDate: automaticRoundPlan?.firstRoundStartDate ?? registrationEndDate,
      templateKey: selectedTemplate?.key ?? null,
      timestampParts: getUtcTimestampParts(),
      tournamentType: normalizedTournamentType,
    });
    const { builtTournament } = await syncTournamentMatches(
      tournament,
      actor.username,
    );

    if (auditChangeLogger) {
      const [createdAtDate, createdAtTime] = tournament.created_at_date
        ? [tournament.created_at_date, tournament.created_at_time]
        : getUtcTimestampParts();
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: tournament,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: tournament.id,
        entityLabel: tournament.name,
        entityType: "tournament",
        req,
        statusCode: 201,
        target: `/api/tournaments/${tournament.id}`,
      }).catch((auditError) => {
        console.error("Failed to record tournament audit event", auditError);
      });
    }
    broadcastTournamentsUpdated("tournaments.create");

    res.status(201).json({
      success: true,
      tournament: builtTournament,
    });
  });

  app.put("/api/tournaments/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to amend tournaments.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const {
      name,
      templateKey,
      tournamentType,
      roundOneStartDate,
      roundWindowDays,
      roundRestDays,
      registrationStartDate,
      registrationEndDate,
    } = req.body ?? {};
    const selectedTemplate =
      typeof templateKey === "string" && templateKey.trim()
        ? findTemplateByKey(templateKey.trim())
        : null;
    const normalizedTournamentType =
      selectedTemplate?.tournamentType ?? tournamentType;
    const automaticRoundPlan = normalizeAutomaticRoundPlan({
      roundOneStartDate,
      roundWindowDays,
      roundRestDays,
    });
    const requiresRoundDeadlines =
      selectedTemplate?.capabilities?.supportsRoundDeadlines ?? false;

    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (
      !trimmedName ||
      (typeof templateKey === "string" &&
        templateKey.trim() &&
        !selectedTemplate) ||
      !TOURNAMENT_TYPE_OPTIONS.some(
        (option) => option.value === normalizedTournamentType,
      ) ||
      !registrationStartDate ||
      !registrationEndDate ||
      (requiresRoundDeadlines && !automaticRoundPlan)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Name, tournament type, registration window, and automatic round settings are required.",
      });
      return;
    }

    if (registrationStartDate > registrationEndDate) {
      res.status(400).json({
        success: false,
        message: "End dates must be on or after the related start dates.",
      });
      return;
    }

    if (
      requiresRoundDeadlines &&
      automaticRoundPlan.firstRoundStartDate < registrationEndDate
    ) {
      res.status(400).json({
        success: false,
        message:
          "Round 1 must start on or after the registration close date.",
      });
      return;
    }

    const updatedTournament = await tournamentGateway.updateTournament({
      drawDate: automaticRoundPlan?.firstRoundStartDate || null,
      id: tournament.id,
      name: trimmedName,
      registrationEndDate,
      registrationStartDate,
      roundScheduleJson: JSON.stringify(automaticRoundPlan ?? []),
      scoreSubmissionEndDate: automaticRoundPlan?.firstRoundStartDate ?? registrationEndDate,
      scoreSubmissionStartDate: automaticRoundPlan?.firstRoundStartDate ?? registrationEndDate,
      templateKey: selectedTemplate?.key ?? null,
      tournamentType: normalizedTournamentType,
    });
    const { builtTournament } = await syncTournamentMatches(
      updatedTournament,
      actor.username,
    );

    if (auditChangeLogger) {
      const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedTournament,
        before: tournament,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: tournament.id,
        entityLabel: updatedTournament.name,
        entityType: "tournament",
        req,
        target: `/api/tournaments/${tournament.id}`,
      }).catch((auditError) => {
        console.error("Failed to record tournament audit event", auditError);
      });
    }
    broadcastTournamentsUpdated("tournaments.update");

    res.json({
      success: true,
      tournament: builtTournament,
    });
  });

  app.delete("/api/tournaments/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete tournaments.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    await tournamentGateway.deleteTournamentCascade(tournament.id);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: null,
        before: tournament,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: tournament.id,
        entityLabel: tournament.name,
        entityType: "tournament",
        req,
        target: `/api/tournaments/${tournament.id}`,
      }).catch((auditError) => {
        console.error("Failed to record tournament audit event", auditError);
      });
    }
    broadcastTournamentsUpdated("tournaments.delete");

    res.json({
      success: true,
      deletedTournamentId: tournament.id,
      message: `${tournament.name} deleted successfully.`,
    });
  });

  app.post("/api/tournaments/:id/register", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

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

    const requestedUsername = String(req.body?.memberUsername ?? "").trim();
    const isManagerRegistration =
      Boolean(requestedUsername) && requestedUsername !== actor.username;

    if (
      isManagerRegistration &&
      !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to register another member.",
      });
      return;
    }

    const registrationUsername = requestedUsername || actor.username;
    const registrationContext = await buildRegistrationContext(
      tournament,
      registrationUsername,
    );

    if (!registrationContext) {
      res.status(404).json({
        success: false,
        message: "Member not found.",
      });
      return;
    }

    const { eligibleBowOptions, suggestedBowCode } = registrationContext;
    const requestedBowCode = normalizeBowCode(req.body?.bowCode);
    const resolvedBowCode =
      eligibleBowOptions.length === 1
        ? eligibleBowOptions[0].code
        : requestedBowCode || suggestedBowCode;

    if (eligibleBowOptions.length > 1 && !resolvedBowCode) {
      res.status(400).json({
        success: false,
        message: isManagerRegistration
          ? "Choose which bow this member will be shooting with for this tournament."
          : "Choose which bow you will be shooting with for this tournament.",
      });
      return;
    }

    if (resolvedBowCode && !bowOptionByCode.has(resolvedBowCode)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid bow discipline for this tournament.",
      });
      return;
    }

    if (
      resolvedBowCode &&
      eligibleBowOptions.length > 0 &&
      !eligibleBowOptions.some((option) => option.code === resolvedBowCode)
    ) {
      res.status(400).json({
        success: false,
        message: "That bow discipline is not available on your member profile.",
      });
      return;
    }

    try {
      const [registeredAtDate, registeredAtTime] = getUtcTimestampParts();
      await tournamentGateway.registerForTournament({
        bowCode: resolvedBowCode || null,
        timestampParts: [registeredAtDate, registeredAtTime],
        tournamentId: tournament.id,
        username: registrationUsername,
      });

      if (auditChangeLogger) {
        void auditChangeLogger.recordEntityChange({
          action: "registered",
          actorUsername: actor.username,
          after: {
            bowCode: resolvedBowCode || null,
            tournamentId: tournament.id,
            username: registrationUsername,
          },
          before: null,
          changedAtDate: registeredAtDate,
          changedAtTime: registeredAtTime,
          entityId: `${tournament.id}:${registrationUsername}`,
          entityLabel: tournament.name,
          entityType: "tournament_registration",
          req,
          target: `/api/tournaments/${tournament.id}/register`,
        }).catch((auditError) => {
          console.error("Failed to record tournament registration audit event", auditError);
        });
      }
    } catch (error) {
      if (
        error?.message?.includes(
          "UNIQUE constraint failed: tournament_registrations.tournament_id, tournament_registrations.member_username",
        )
      ) {
        res.status(409).json({
          success: false,
          message: isManagerRegistration
            ? "That member is already registered for this tournament."
            : "You are already registered for this tournament.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Unable to register for this tournament.",
      });
      return;
    }

    const { builtTournament } = await syncTournamentMatches(
      tournament,
      actor.username,
    );
    broadcastTournamentsUpdated("tournaments.register");

    res.json({
      success: true,
      tournament: builtTournament,
    });
  });

  app.delete("/api/tournaments/:id/register", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

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

    const requestedUsername = String(req.body?.memberUsername ?? "").trim();
    const isManagerWithdrawal =
      Boolean(requestedUsername) && requestedUsername !== actor.username;

    if (
      isManagerWithdrawal &&
      !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to remove another member.",
      });
      return;
    }

    const withdrawalUsername = requestedUsername || actor.username;
    const withdrawalUser = await memberDirectoryGateway.findUserByUsername(
      withdrawalUsername,
    );

    if (!withdrawalUser) {
      res.status(404).json({
        success: false,
        message: "Member not found.",
      });
      return;
    }

    const deleteResult = await tournamentGateway.deleteTournamentRegistration(
      tournament.id,
      withdrawalUser.id,
    );

    if (deleteResult.changes === 0) {
      res.status(404).json({
        success: false,
        message: isManagerWithdrawal
          ? "That member is not registered for this tournament."
          : "You are not registered for this tournament.",
      });
      return;
    }

    if (auditChangeLogger) {
      const [withdrawnAtDate, withdrawnAtTime] = getUtcTimestampParts();
      void auditChangeLogger.recordEntityChange({
        action: "withdrawn",
        actorUsername: actor.username,
        after: null,
        before: {
          tournamentId: tournament.id,
          username: withdrawalUsername,
        },
        changedAtDate: withdrawnAtDate,
        changedAtTime: withdrawnAtTime,
        entityId: `${tournament.id}:${withdrawalUsername}`,
        entityLabel: tournament.name,
        entityType: "tournament_registration",
        req,
        target: `/api/tournaments/${tournament.id}/register`,
      }).catch((auditError) => {
        console.error("Failed to record tournament withdrawal audit event", auditError);
      });
    }

    const { builtTournament } = await syncTournamentMatches(
      tournament,
      actor.username,
    );
    broadcastTournamentsUpdated("tournaments.withdraw");

    res.json({
      success: true,
      tournament: builtTournament,
    });
  });

  app.post("/api/tournaments/:id/score", async (req, res) => {
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

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const { builtTournament, scores } = await loadTournamentSnapshot(
      tournament,
      actor.username,
    );

    if (!builtTournament.canSubmitScore || !builtTournament.currentRoundNumber) {
      res.status(400).json({
        success: false,
        message: "You do not have a score to submit for the current round.",
      });
      return;
    }

    const [submittedAtDate, submittedAtTime] = getUtcTimestampParts();
    await tournamentGateway.submitTournamentScore({
      roundNumber: builtTournament.currentRoundNumber,
      score: normalizedScore,
      timestampParts: [submittedAtDate, submittedAtTime],
      tournamentId: tournament.id,
      username: actor.username,
    });
    const updatedScores = await tournamentGateway.listTournamentScoresByTournamentId(
      tournament.id,
    );

    if (auditChangeLogger) {
      const previousScore = scores.find(
        (entry) =>
          entry.member_username === actor.username &&
          Number(entry.round_number) === Number(builtTournament.currentRoundNumber),
      );
      const nextScore = updatedScores.find(
        (entry) =>
          entry.member_username === actor.username &&
          Number(entry.round_number) === Number(builtTournament.currentRoundNumber),
      );
      void auditChangeLogger.recordEntityChange({
        action: "score_submitted",
        actorUsername: actor.username,
        after: nextScore ?? {
          tournamentId: tournament.id,
          username: actor.username,
          roundNumber: builtTournament.currentRoundNumber,
          score: normalizedScore,
        },
        before: previousScore ?? null,
        changedAtDate: submittedAtDate,
        changedAtTime: submittedAtTime,
        entityId: `${tournament.id}:${actor.username}:${builtTournament.currentRoundNumber}`,
        entityLabel: tournament.name,
        entityType: "tournament_score",
        req,
        target: `/api/tournaments/${tournament.id}/score`,
      }).catch((auditError) => {
        console.error("Failed to record tournament score audit event", auditError);
      });
    }
    broadcastTournamentsUpdated("tournaments.score");
    const updatedTournamentSnapshot = await syncTournamentMatches(
      tournament,
      actor.username,
    );

    res.json({
      success: true,
      tournament: updatedTournamentSnapshot.builtTournament,
    });
  });

  app.get("/api/tournament-matches/:id", async (req, res) => {
    const actor = getActorUser(req);
    const parsedMatchId = parseTournamentMatchId(req.params.id);

    if (!parsedMatchId) {
      res.status(400).json({
        success: false,
        message: "Tournament match id is invalid.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(parsedMatchId.tournamentId);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const { builtTournament } = await loadTournamentSnapshot(
      tournament,
      actor?.username ?? null,
    );
    const match =
      builtTournament.engine?.matches?.find(
        (entry) => String(entry.id) === req.params.id,
      ) ?? null;

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Tournament match not found.",
      });
      return;
    }

    res.json({
      success: true,
      match,
      tournament: builtTournament,
    });
  });

  app.post("/api/tournament-matches/:id/result", async (req, res) => {
    const actor = getActorUser(req);
    const parsedMatchId = parseTournamentMatchId(req.params.id);
    const leftScore = Number.parseInt(req.body?.leftScore, 10);
    const rightScore = Number.parseInt(req.body?.rightScore, 10);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!parsedMatchId) {
      res.status(400).json({
        success: false,
        message: "Tournament match id is invalid.",
      });
      return;
    }

    if (
      !Number.isInteger(leftScore) ||
      !Number.isInteger(rightScore) ||
      leftScore < 0 ||
      rightScore < 0
    ) {
      res.status(400).json({
        success: false,
        message: "Enter valid whole-number scores for both archers.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(parsedMatchId.tournamentId);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const snapshot = await loadTournamentSnapshot(tournament, actor.username);
    const match =
      snapshot.builtTournament.engine?.matches?.find(
        (entry) => String(entry.id) === req.params.id,
      ) ?? null;

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Tournament match not found.",
      });
      return;
    }

    const actorCanSubmit = match.workflow?.canSubmitResult;

    if (!actorCanSubmit) {
      res.status(400).json({
        success: false,
        message: "You cannot submit a result for this match right now.",
      });
      return;
    }

    const resolvedResult = resolveMatchWinner({
      leftScore,
      match,
      rightScore,
      tournament,
    });

    if (resolvedResult.isTie) {
      res.status(400).json({
        success: false,
        message:
          resolvedResult.comparisonMode === "adjusted"
            ? "Adjusted scores are tied. Ask a captain to resolve the match."
            : "Tied scores cannot be submitted in this flow.",
      });
      return;
    }

    const [submittedAtDate, submittedAtTime] = getUtcTimestampParts();
    const requiresOpponentConfirmation =
      match.workflow?.requiresOpponentConfirmation ?? false;
    const nextStatus = requiresOpponentConfirmation
      ? "awaiting_opponent_confirmation"
      : "finalised";

    await tournamentGateway.updateTournamentMatchWorkflow({
      leftScore,
      matchNumber: parsedMatchId.matchNumber,
      rightScore,
      roundNumber: parsedMatchId.roundNumber,
      status: nextStatus,
      submittedByUsername: actor.username,
      submittedTimestampParts: [submittedAtDate, submittedAtTime],
      tournamentId: tournament.id,
      winnerUsername: resolvedResult.winnerUsername,
      ...resolvedResult,
    });

    if (!requiresOpponentConfirmation) {
      await Promise.all([
        tournamentGateway.submitTournamentScore({
          roundNumber: parsedMatchId.roundNumber,
          score: leftScore,
          timestampParts: [submittedAtDate, submittedAtTime],
          tournamentId: tournament.id,
          username: match.competitorA?.username,
        }),
        tournamentGateway.submitTournamentScore({
          roundNumber: parsedMatchId.roundNumber,
          score: rightScore,
          timestampParts: [submittedAtDate, submittedAtTime],
          tournamentId: tournament.id,
          username: match.competitorB?.username,
        }),
      ]);
    }

    const updatedTournamentSnapshot = await syncTournamentMatches(
      tournament,
      actor.username,
    );
    broadcastTournamentsUpdated("tournament-match.result");

    res.json({
      success: true,
      match:
        updatedTournamentSnapshot.builtTournament.engine?.matches?.find(
          (entry) => String(entry.id) === req.params.id,
        ) ?? null,
      tournament: updatedTournamentSnapshot.builtTournament,
    });
  });

  app.post("/api/tournament-matches/:id/confirm", async (req, res) => {
    const actor = getActorUser(req);
    const parsedMatchId = parseTournamentMatchId(req.params.id);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!parsedMatchId) {
      res.status(400).json({
        success: false,
        message: "Tournament match id is invalid.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(parsedMatchId.tournamentId);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const snapshot = await loadTournamentSnapshot(tournament, actor.username);
    const match =
      snapshot.builtTournament.engine?.matches?.find(
        (entry) => String(entry.id) === req.params.id,
      ) ?? null;

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Tournament match not found.",
      });
      return;
    }

    if (!match.workflow?.canConfirmResult) {
      res.status(400).json({
        success: false,
        message: "You cannot confirm this result right now.",
      });
      return;
    }

    const [confirmedAtDate, confirmedAtTime] = getUtcTimestampParts();
    await tournamentGateway.updateTournamentMatchWorkflow({
      confirmedByUsername: actor.username,
      confirmedTimestampParts: [confirmedAtDate, confirmedAtTime],
      leftScore: match.score?.competitorA ?? null,
      matchNumber: parsedMatchId.matchNumber,
      rightScore: match.score?.competitorB ?? null,
      roundNumber: parsedMatchId.roundNumber,
      status: "finalised",
      submittedByUsername: match.workflow?.submittedByUsername ?? null,
      submittedTimestampParts: match.workflow?.submittedAt
        ? String(match.workflow.submittedAt).split("T")
        : [null, null],
      tournamentId: tournament.id,
      winnerUsername: match.winner?.username ?? null,
      ...buildPersistedHandicapPayload(
        match,
        match.score?.competitorA ?? null,
        match.score?.competitorB ?? null,
      ),
    });

    await Promise.all([
      tournamentGateway.submitTournamentScore({
        roundNumber: parsedMatchId.roundNumber,
        score: match.score?.competitorA ?? null,
        timestampParts: [confirmedAtDate, confirmedAtTime],
        tournamentId: tournament.id,
        username: match.competitorA?.username,
      }),
      tournamentGateway.submitTournamentScore({
        roundNumber: parsedMatchId.roundNumber,
        score: match.score?.competitorB ?? null,
        timestampParts: [confirmedAtDate, confirmedAtTime],
        tournamentId: tournament.id,
        username: match.competitorB?.username,
      }),
    ]);

    const updatedTournamentSnapshot = await syncTournamentMatches(
      tournament,
      actor.username,
    );
    broadcastTournamentsUpdated("tournament-match.confirm");

    res.json({
      success: true,
      match:
        updatedTournamentSnapshot.builtTournament.engine?.matches?.find(
          (entry) => String(entry.id) === req.params.id,
        ) ?? null,
      tournament: updatedTournamentSnapshot.builtTournament,
    });
  });

  app.post("/api/tournament-matches/:id/dispute", async (req, res) => {
    const actor = getActorUser(req);
    const parsedMatchId = parseTournamentMatchId(req.params.id);
    const disputeReason = String(req.body?.reason ?? "").trim();

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!parsedMatchId) {
      res.status(400).json({
        success: false,
        message: "Tournament match id is invalid.",
      });
      return;
    }

    if (!disputeReason) {
      res.status(400).json({
        success: false,
        message: "Enter a reason for the dispute.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(parsedMatchId.tournamentId);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const snapshot = await loadTournamentSnapshot(tournament, actor.username);
    const match =
      snapshot.builtTournament.engine?.matches?.find(
        (entry) => String(entry.id) === req.params.id,
      ) ?? null;

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Tournament match not found.",
      });
      return;
    }

    if (!match.workflow?.canDisputeResult) {
      res.status(400).json({
        success: false,
        message: "You cannot dispute this result right now.",
      });
      return;
    }

    const [disputedAtDate, disputedAtTime] = getUtcTimestampParts();
    await tournamentGateway.updateTournamentMatchWorkflow({
      disputedByUsername: actor.username,
      disputedTimestampParts: [disputedAtDate, disputedAtTime],
      disputeReason,
      leftScore: match.score?.competitorA ?? null,
      matchNumber: parsedMatchId.matchNumber,
      rightScore: match.score?.competitorB ?? null,
      roundNumber: parsedMatchId.roundNumber,
      status: "disputed",
      submittedByUsername: match.workflow?.submittedByUsername ?? null,
      submittedTimestampParts: match.workflow?.submittedAt
        ? String(match.workflow.submittedAt).split("T")
        : [null, null],
      tournamentId: tournament.id,
      winnerUsername: match.winner?.username ?? null,
      ...buildPersistedHandicapPayload(
        match,
        match.score?.competitorA ?? null,
        match.score?.competitorB ?? null,
      ),
    });

    const updatedTournamentSnapshot = await syncTournamentMatches(
      tournament,
      actor.username,
    );
    broadcastTournamentsUpdated("tournament-match.dispute");

    res.json({
      success: true,
      match:
        updatedTournamentSnapshot.builtTournament.engine?.matches?.find(
          (entry) => String(entry.id) === req.params.id,
        ) ?? null,
      tournament: updatedTournamentSnapshot.builtTournament,
    });
  });

  app.post("/api/tournament-matches/:id/override", async (req, res) => {
    const actor = getActorUser(req);
    const parsedMatchId = parseTournamentMatchId(req.params.id);
    const action = String(req.body?.action ?? "").trim().toLowerCase();
    const winnerUsername = String(req.body?.winnerUsername ?? "").trim();
    const reason = String(req.body?.reason ?? "").trim();
    const leftScoreRaw = req.body?.leftScore;
    const rightScoreRaw = req.body?.rightScore;
    const hasOverrideScoreValues =
      String(leftScoreRaw ?? "").trim() !== "" || String(rightScoreRaw ?? "").trim() !== "";
    const leftScore = hasOverrideScoreValues
      ? Number.parseInt(String(leftScoreRaw ?? ""), 10)
      : null;
    const rightScore = hasOverrideScoreValues
      ? Number.parseInt(String(rightScoreRaw ?? ""), 10)
      : null;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to make captain decisions on matches.",
      });
      return;
    }

    if (!parsedMatchId) {
      res.status(400).json({
        success: false,
        message: "Tournament match id is invalid.",
      });
      return;
    }

    if (!["override", "walkover", "disqualify"].includes(action)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid captain decision.",
      });
      return;
    }

    if (!winnerUsername || !reason) {
      res.status(400).json({
        success: false,
        message: "Winner and decision reason are required.",
      });
      return;
    }

    if (action === "override" && hasOverrideScoreValues) {
      if (
        !Number.isInteger(leftScore) ||
        !Number.isInteger(rightScore) ||
        leftScore < 0 ||
        rightScore < 0
      ) {
        res.status(400).json({
          success: false,
          message: "Override scores must be valid whole numbers for both archers.",
        });
        return;
      }

    }

    const tournament = await tournamentGateway.findTournamentById(parsedMatchId.tournamentId);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const snapshot = await loadTournamentSnapshot(tournament, actor.username);
    const match =
      snapshot.builtTournament.engine?.matches?.find(
        (entry) => String(entry.id) === req.params.id,
      ) ?? null;

    if (!match) {
      res.status(404).json({
        success: false,
        message: "Tournament match not found.",
      });
      return;
    }

    const validCompetitorUsernames = [
      match.competitorA?.username ?? null,
      match.competitorB?.username ?? null,
    ].filter(Boolean);

    if (!validCompetitorUsernames.includes(winnerUsername)) {
      res.status(400).json({
        success: false,
        message: "Winner must be one of the paired competitors.",
      });
      return;
    }

    if (action === "override" && hasOverrideScoreValues) {
      const resolvedOverride = resolveMatchWinner({
        leftScore,
        match,
        rightScore,
        tournament,
      });

      if (resolvedOverride.isTie) {
        res.status(400).json({
          success: false,
          message:
            resolvedOverride.comparisonMode === "adjusted"
              ? "Adjusted scores are tied. Choose walkover or disqualify instead."
              : "Override scores cannot be tied.",
        });
        return;
      }

      if (resolvedOverride.winnerUsername !== winnerUsername) {
        res.status(400).json({
          success: false,
          message:
            resolvedOverride.comparisonMode === "adjusted"
              ? "Override scores must support the selected winner after handicap allowances."
              : "Override scores must support the selected winner.",
        });
        return;
      }
    }

    const [decisionDate, decisionTime] = getUtcTimestampParts();
    const nextStatus =
      action === "walkover"
        ? "walkover"
        : action === "disqualify"
          ? "disqualified"
          : "finalised";
    const [submittedAtDate, submittedAtTime] = parseIsoTimestampParts(
      match.workflow?.submittedAt,
    );
    const [confirmedAtDate, confirmedAtTime] = parseIsoTimestampParts(
      match.workflow?.confirmedAt,
    );
    const [disputedAtDate, disputedAtTime] = parseIsoTimestampParts(
      match.workflow?.disputedAt,
    );
    const existingPersistedMatch = await tournamentGateway.findTournamentMatchByKey({
      matchNumber: parsedMatchId.matchNumber,
      roundNumber: parsedMatchId.roundNumber,
      tournamentId: tournament.id,
    });

    const overrideHandicapPayload =
      action === "override" && hasOverrideScoreValues
        ? buildPersistedHandicapPayload(match, leftScore, rightScore)
        : buildPersistedHandicapPayload(
            match,
            match.score?.competitorA ?? null,
            match.score?.competitorB ?? null,
          );

    await tournamentGateway.updateTournamentMatchWorkflow({
      confirmedByUsername:
        action === "override" ? actor.username : match.workflow?.confirmedByUsername ?? null,
      confirmedTimestampParts:
        action === "override"
          ? [decisionDate, decisionTime]
          : [confirmedAtDate, confirmedAtTime],
      disputedByUsername: match.workflow?.disputedByUsername ?? null,
      disputedTimestampParts: [disputedAtDate, disputedAtTime],
      disputeReason: reason,
      leftScore:
        action === "override" && hasOverrideScoreValues
          ? leftScore
          : match.score?.competitorA ?? null,
      matchNumber: parsedMatchId.matchNumber,
      rightScore:
        action === "override" && hasOverrideScoreValues
          ? rightScore
          : match.score?.competitorB ?? null,
      roundNumber: parsedMatchId.roundNumber,
      status: nextStatus,
      submittedByUsername: match.workflow?.submittedByUsername ?? null,
      submittedTimestampParts: [submittedAtDate, submittedAtTime],
      tournamentId: tournament.id,
      winnerUsername,
      ...overrideHandicapPayload,
    });

    const updatedTournamentSnapshot = await syncTournamentMatches(
      tournament,
      actor.username,
    );

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: `match_${action}`,
        actorUsername: actor.username,
        after: {
          action,
          reason,
          winnerUsername,
          ...(updatedTournamentSnapshot.builtTournament.engine?.matches?.find(
            (entry) => String(entry.id) === req.params.id,
          ) ?? {}),
        },
        before: existingPersistedMatch ?? null,
        changedAtDate: decisionDate,
        changedAtTime: decisionTime,
        entityId: req.params.id,
        entityLabel: `${tournament.name} ${match.roundTitle}`,
        entityType: "tournament_match_decision",
        req,
        target: `/api/tournament-matches/${req.params.id}/override`,
      }).catch((auditError) => {
        console.error("Failed to record tournament match decision audit event", auditError);
      });
    }

    broadcastTournamentsUpdated(`tournament-match.${action}`);

    res.json({
      success: true,
      match:
        updatedTournamentSnapshot.builtTournament.engine?.matches?.find(
          (entry) => String(entry.id) === req.params.id,
        ) ?? null,
      tournament: updatedTournamentSnapshot.builtTournament,
    });
  });

  app.post("/api/tournaments/:id/competitors-export", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to export tournament competitors.",
      });
      return;
    }

    const tournament = await tournamentGateway.findTournamentById(req.params.id);

    if (!tournament) {
      res.status(404).json({
        success: false,
        message: "Tournament not found.",
      });
      return;
    }

    const registrations = await tournamentGateway.listTournamentRegistrationsByTournamentId(
      tournament.id,
    );
    const builtTournament = buildTournament(
      tournament,
      registrations,
      await tournamentGateway.listTournamentScoresByTournamentId(tournament.id),
      actor.username,
      await tournamentGateway.listTournamentRoundsByTournamentId(tournament.id),
      await tournamentGateway.listTournamentMatchesByTournamentId(tournament.id),
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
