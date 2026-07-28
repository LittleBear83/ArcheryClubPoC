export function registerAdminMemberRoutes({
  actorHasPermission,
  ALLOWED_DISCIPLINES,
  app,
  auditChangeLogger,
  buildCommitteeRole,
  buildEditableMemberProfile,
  buildLoanBowRecord,
  buildUniqueRoleKeyFromTitle,
  CURRENT_PERMISSION_KEY_SET,
  DISTANCE_SIGN_OFF_YARDS,
  goldenRecordsCurrentHandicapService,
  goldenRecordsMemberSyncService,
  getActorUser,
  getUtcTimestampParts,
  getPermissionsForRole,
  listAssignableRoleKeys,
  listProfilePageMembers,
  memberDirectoryGateway,
  outdoorTableGateway,
  roleCommitteeGateway,
  PERMISSIONS,
  refreshRoleAccessSnapshot,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile,
  serverEventBus,
  TOURNAMENT_TYPE_OPTIONS,
  verifyPassword,
  buildMemberUserProfile,
  memberDistanceSignOffRepository,
}) {
  const MEMBER_UPDATE_PERMISSION_KEYS = [
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.SIGN_OFF_DISTANCES,
    PERMISSIONS.MANAGE_COMMITTEE_ROLES,
    "manage_loan_bows",
  ];
  const ROLE_UPDATE_PERMISSION_KEYS = [
    PERMISSIONS.MANAGE_ROLES_PERMISSIONS,
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.SIGN_OFF_DISTANCES,
    PERMISSIONS.MANAGE_COMMITTEE_ROLES,
    "manage_loan_bows",
  ];

  async function listUsernamesByRoleKey(roleKey) {
    return (await memberDirectoryGateway.listAllUsers())
      .filter((user) => user.user_type === roleKey)
      .map((user) => user.username)
      .filter((username) => typeof username === "string" && username.length > 0);
  }

  function broadcastRolesUpdated(scope = "roles", usernames = []) {
    serverEventBus?.broadcastToAnyPermission(ROLE_UPDATE_PERMISSION_KEYS, "roles.updated", {
      changedAt: new Date().toISOString(),
      scope,
      usernames,
    });

    if (usernames.length > 0) {
      serverEventBus?.broadcastToUsers(usernames, "roles.updated", {
        changedAt: new Date().toISOString(),
        scope,
        usernames,
      });
    }
  }

  function broadcastCommitteeUpdated(scope = "committee") {
    serverEventBus?.broadcastToAll("committee.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  }

  function broadcastMembersUpdated(scope = "members", username = null) {
    serverEventBus?.broadcastToAnyPermission(MEMBER_UPDATE_PERMISSION_KEYS, "members.updated", {
      changedAt: new Date().toISOString(),
      scope,
      username,
    });

    if (username) {
      serverEventBus?.broadcastToUsers([username], "members.updated", {
        changedAt: new Date().toISOString(),
        scope,
        username,
      });
    }
  }

  async function buildEditableProfileWithDistanceSignOffs(
    user,
    disciplines,
    loanBow,
    canViewRfidTag,
  ) {
    return {
      ...buildEditableProfileResponse(user, disciplines, loanBow, canViewRfidTag),
      distanceSignOffs: await memberDistanceSignOffRepository.listByDiscipline(
        user.username,
        disciplines,
      ),
    };
  }

  async function buildGoldenRecordsSnapshotForUser(user) {
    if (!goldenRecordsCurrentHandicapService?.isEnabled || !user) {
      return {
        candidateMatches: [],
        enabled: false,
        fetchedAt: "",
        handicaps: [],
        matchedMemberId: "",
        matchedMemberName: "",
        matchSource: "disabled",
      };
    }

    const snapshot = await goldenRecordsCurrentHandicapService.getSnapshotForMember({
      archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
      firstName: user.first_name,
      goldenRecordsId: user.gr_id ?? "",
      surname: user.surname,
      username: user.username,
    });

    if (
      !String(user.gr_id ?? "").trim() &&
      String(snapshot?.matchedMemberId ?? "").trim() &&
      typeof memberDirectoryGateway.updateGoldenRecordsId === "function"
    ) {
      try {
        await memberDirectoryGateway.updateGoldenRecordsId(
          user.username,
          snapshot.matchedMemberId,
        );
        user.gr_id = snapshot.matchedMemberId;
      } catch (error) {
        console.error("Failed to persist Golden Records member id", {
          error: error instanceof Error ? error.message : error,
          matchedMemberId: snapshot.matchedMemberId,
          username: user.username,
        });
      }
    }

    return snapshot;
  }

  function mapGoldenRecordsBowClassToOutdoorBowType(bowClass) {
    switch (String(bowClass ?? "").trim().toLowerCase()) {
      case "recurve":
        return "Rec";
      case "compound":
        return "Comp";
      case "barebow":
        return "B/bow";
      case "longbow":
        return "L/bow";
      default:
        return "";
    }
  }

  function buildEmptyOutdoorEntryPayload({
    archerUsername,
    bowType,
    handicap,
    updatedAtDate,
    updatedAtTime,
    updatedByUsername,
  }) {
    const emptyDates = ["", "", ""];

    return {
      seasonYear: new Date().getUTCFullYear(),
      archerUsername,
      bowType,
      handicap,
      archer3rd: false,
      archer2nd: false,
      archer1st: false,
      bowman3rd: false,
      bowman2nd: false,
      bowman1st: false,
      masterBowman: false,
      grandMasterBowman: false,
      eliteMasterBowman: false,
      archer3rdDate: "",
      archer2ndDate: "",
      archer1stDate: "",
      bowman3rdDate: "",
      bowman2ndDate: "",
      bowman1stDate: "",
      masterBowmanDate: "",
      grandMasterBowmanDate: "",
      eliteMasterBowmanDate: "",
      award25220: false,
      award25230: false,
      award25240: false,
      award25250: false,
      award25260: false,
      award25280: false,
      award252100: false,
      award25220SignOffDates: [...emptyDates],
      award25230SignOffDates: [...emptyDates],
      award25240SignOffDates: [...emptyDates],
      award25250SignOffDates: [...emptyDates],
      award25260SignOffDates: [...emptyDates],
      award25280SignOffDates: [...emptyDates],
      award252100SignOffDates: [...emptyDates],
      cloutWhite20: false,
      cloutWhite30: false,
      cloutWhite40: false,
      cloutWhite50: false,
      cloutWhite60: false,
      cloutWhite7080: false,
      cloutWhite90100: false,
      createdAtDate: updatedAtDate,
      createdAtTime: updatedAtTime,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername,
    };
  }

  const GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS = [
    { achievement: "Archer 3rd", flagKey: "archer3rd", dateKey: "archer3rdDate" },
    { achievement: "Archer 2nd", flagKey: "archer2nd", dateKey: "archer2ndDate" },
    { achievement: "Archer 1st", flagKey: "archer1st", dateKey: "archer1stDate" },
    { achievement: "Bowman 3rd", flagKey: "bowman3rd", dateKey: "bowman3rdDate" },
    { achievement: "Bowman 2nd", flagKey: "bowman2nd", dateKey: "bowman2ndDate" },
    { achievement: "Bowman 1st", flagKey: "bowman1st", dateKey: "bowman1stDate" },
    { achievement: "Master Bowman", flagKey: "masterBowman", dateKey: "masterBowmanDate" },
    {
      achievement: "Grand Master Bowman",
      flagKey: "grandMasterBowman",
      dateKey: "grandMasterBowmanDate",
    },
    {
      achievement: "Elite Master Bowman",
      flagKey: "eliteMasterBowman",
      dateKey: "eliteMasterBowmanDate",
    },
  ];
  const GOLDEN_RECORDS_252_ROUND_TO_FIELD = new Map([
    ["252 - 20 yds", "award25220"],
    ["252 - 30 yds", "award25230"],
    ["252 - 40 yds", "award25240"],
    ["252 - 50 yds", "award25250"],
    ["252 - 60 yds", "award25260"],
    ["252 - 80 yds", "award25280"],
    ["252 - 100 yds", "award252100"],
  ]);
  const GOLDEN_RECORDS_252_ACHIEVEMENT_DISTANCE_PATTERN = /^252@\s*(20|30|40|50|60|80|100)\s*yds\/[123]$/i;
  const GOLDEN_RECORDS_252_SIGN_OFF_FIELD_BY_AWARD_KEY = new Map([
    ["award25220", "award25220SignOffDates"],
    ["award25230", "award25230SignOffDates"],
    ["award25240", "award25240SignOffDates"],
    ["award25250", "award25250SignOffDates"],
    ["award25260", "award25260SignOffDates"],
    ["award25280", "award25280SignOffDates"],
    ["award252100", "award252100SignOffDates"],
  ]);
  const GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD = new Map([
    ["archer 3rd class", { flagKey: "archer3rd", dateKey: "archer3rdDate" }],
    ["archer 2nd class", { flagKey: "archer2nd", dateKey: "archer2ndDate" }],
    ["archer 1st class", { flagKey: "archer1st", dateKey: "archer1stDate" }],
    ["bowman 3rd class", { flagKey: "bowman3rd", dateKey: "bowman3rdDate" }],
    ["bowman 2nd class", { flagKey: "bowman2nd", dateKey: "bowman2ndDate" }],
    ["bowman 1st class", { flagKey: "bowman1st", dateKey: "bowman1stDate" }],
    ["master bowman", { flagKey: "masterBowman", dateKey: "masterBowmanDate" }],
    [
      "grand master bowman",
      { flagKey: "grandMasterBowman", dateKey: "grandMasterBowmanDate" },
    ],
    [
      "elite master bowman",
      { flagKey: "eliteMasterBowman", dateKey: "eliteMasterBowmanDate" },
    ],
  ]);

  function normalizeGoldenRecordsDate(value) {
    return String(value ?? "").trim().slice(0, 10);
  }

  function getGoldenRecords252AwardKey({
    achievementName,
    roundName,
  }) {
    const directRoundMatch = GOLDEN_RECORDS_252_ROUND_TO_FIELD.get(roundName);

    if (directRoundMatch) {
      return directRoundMatch;
    }

    const achievementDistanceMatch = String(achievementName ?? "")
      .trim()
      .match(GOLDEN_RECORDS_252_ACHIEVEMENT_DISTANCE_PATTERN);

    if (!achievementDistanceMatch) {
      return null;
    }

    return GOLDEN_RECORDS_252_ROUND_TO_FIELD.get(
      `252 - ${achievementDistanceMatch[1]} yds`,
    ) ?? null;
  }

  function normalizeGoldenRecordsSignOffDates(value) {
    const dates = Array.isArray(value)
      ? value
          .map((entry) => normalizeGoldenRecordsDate(entry))
          .filter(Boolean)
      : [];

    return [...new Set(dates)].sort((left, right) => left.localeCompare(right)).slice(0, 3);
  }

  function buildGoldenRecordsManagedOutdoorFieldReset(entry) {
    let nextEntry = { ...entry };

    for (const mapping of GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS) {
      nextEntry[mapping.flagKey] = false;
      nextEntry[mapping.dateKey] = "";
    }

    for (const [awardKey, signOffKey] of GOLDEN_RECORDS_252_SIGN_OFF_FIELD_BY_AWARD_KEY.entries()) {
      nextEntry[awardKey] = false;
      nextEntry[signOffKey] = ["", "", ""];
    }

    return nextEntry;
  }

  function applyGoldenRecordsAchievementsToEntry(entry, achievements = []) {
    let nextEntry = { ...entry };
    let hasChanges = false;
    const signOffDatesByAwardKey = new Map();

    for (const achievement of achievements) {
      const achievementName = String(achievement.achievement ?? "").trim();
      const roundName = String(achievement.round ?? "").trim();
      const achievedDate = normalizeGoldenRecordsDate(achievement.achieved);
      const mappedAchievement = GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS.find(
        (candidate) =>
          candidate.achievement.toLowerCase() === achievementName.toLowerCase(),
      );

      if (mappedAchievement) {
        if (
          !nextEntry[mappedAchievement.flagKey] ||
          nextEntry[mappedAchievement.dateKey] !== achievedDate
        ) {
          nextEntry = {
            ...nextEntry,
            [mappedAchievement.flagKey]: true,
            [mappedAchievement.dateKey]: achievedDate,
          };
          hasChanges = true;
        }

        continue;
      }

      const awardKey = getGoldenRecords252AwardKey({
        achievementName,
        roundName,
      });

      if (awardKey && achievedDate) {
        const currentDates = signOffDatesByAwardKey.get(awardKey) ?? [];
        currentDates.push(achievedDate);
        signOffDatesByAwardKey.set(awardKey, currentDates);
      }
    }

    for (const [awardKey, dates] of signOffDatesByAwardKey.entries()) {
      const signOffKey = GOLDEN_RECORDS_252_SIGN_OFF_FIELD_BY_AWARD_KEY.get(awardKey);

      if (!signOffKey) {
        continue;
      }

      const nextDates = normalizeGoldenRecordsSignOffDates(dates);
      const paddedDates = [...nextDates];

      while (paddedDates.length < 3) {
        paddedDates.push("");
      }

      const nextAwardComplete = nextDates.length >= 3;
      const signOffDatesChanged =
        JSON.stringify(nextEntry[signOffKey] ?? []) !== JSON.stringify(paddedDates);

      if (signOffDatesChanged || nextEntry[awardKey] !== nextAwardComplete) {
        nextEntry = {
          ...nextEntry,
          [awardKey]: nextAwardComplete,
          [signOffKey]: paddedDates,
        };
        hasChanges = true;
      }
    }

    return {
      entry: nextEntry,
      hasChanges,
    };
  }

  function applyGoldenRecordsClassificationsToEntry(entry, classifications = []) {
    let nextEntry = { ...entry };
    let hasChanges = false;

    for (const classification of classifications) {
      if (String(classification.type ?? "").trim().toLowerCase() !== "outdoor") {
        continue;
      }

      const mapping = GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD.get(
        String(classification.classification ?? "").trim().toLowerCase(),
      );

      if (!mapping) {
        continue;
      }

      const achievedDate = normalizeGoldenRecordsDate(classification.achieved);

      if (!nextEntry[mapping.flagKey] || nextEntry[mapping.dateKey] !== achievedDate) {
        nextEntry = {
          ...nextEntry,
          [mapping.flagKey]: true,
          [mapping.dateKey]: achievedDate,
        };
        hasChanges = true;
      }
    }

    return {
      entry: nextEntry,
      hasChanges,
    };
  }

  async function syncOutdoorTableFromGoldenRecords({
    disciplines,
    goldenRecordsSnapshot,
    user,
  }) {
    const outdoorHandicaps = (goldenRecordsSnapshot?.handicaps ?? []).filter(
      (entry) =>
        String(entry.type ?? "").trim().toLowerCase() === "outdoor" &&
        Number.isInteger(entry.handicap),
    );
    const matchedMemberId = String(goldenRecordsSnapshot?.matchedMemberId ?? "").trim();
    const outdoorClassifications = (goldenRecordsSnapshot?.classifications ?? []).filter(
      (entry) => {
        if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
          return false;
        }

        return (
          String(entry.type ?? "").trim().toLowerCase() === "outdoor" &&
          GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD.has(
            String(entry.classification ?? "").trim().toLowerCase(),
          )
        );
      },
    );
    const outdoorAchievements = (goldenRecordsSnapshot?.achievements ?? []).filter((entry) => {
      const achievementName = String(entry.achievement ?? "").trim().toLowerCase();
      const roundName = String(entry.round ?? "").trim();

      if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
        return false;
      }

      return (
        Boolean(
          getGoldenRecords252AwardKey({
            achievementName: entry.achievement,
            roundName,
          }),
        ) ||
        GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS.some(
          (candidate) => candidate.achievement.toLowerCase() === achievementName,
        )
      );
    });

    if (
      outdoorHandicaps.length === 0 &&
      outdoorAchievements.length === 0 &&
      outdoorClassifications.length === 0
    ) {
      return {
        createdCount: 0,
        syncedCount: 0,
        updatedCount: 0,
      };
    }

    const currentSeasonYear = new Date().getUTCFullYear();
    const currentEntries = await outdoorTableGateway.listEntriesByYear(currentSeasonYear);
    const memberEntriesByBowType = new Map(
      currentEntries
        .filter((entry) => entry.archerUsername === user.username)
        .map((entry) => [entry.bowType, entry]),
    );
    const allowedBowTypes = new Set(
      disciplines.flatMap((discipline) => {
        switch (discipline) {
          case "Recurve Bow":
            return ["Rec"];
          case "Compound Bow":
            return ["Comp"];
          case "Bare Bow":
            return ["B/bow"];
          case "Long Bow":
            return ["L/bow"];
          default:
            return [];
        }
      }),
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const syncUpdatedByUsername =
      String(user?.username ?? "").trim() || "system";
    let createdCount = 0;
    let updatedCount = 0;
    const achievementsByBowType = outdoorAchievements.reduce((next, achievement) => {
      const bowType = mapGoldenRecordsBowClassToOutdoorBowType(achievement.bowClass);

      if (!bowType || !allowedBowTypes.has(bowType)) {
        return next;
      }

      const current = next.get(bowType) ?? [];
      current.push(achievement);
      next.set(bowType, current);

      return next;
    }, new Map());
    const classificationsByBowType = outdoorClassifications.reduce((next, classification) => {
      const bowType = mapGoldenRecordsBowClassToOutdoorBowType(classification.bowClass);

      if (!bowType || !allowedBowTypes.has(bowType)) {
        return next;
      }

      const current = next.get(bowType) ?? [];
      current.push(classification);
      next.set(bowType, current);

      return next;
    }, new Map());
    const targetBowTypes = new Set([
      ...outdoorHandicaps
        .map((entry) => mapGoldenRecordsBowClassToOutdoorBowType(entry.bowClass))
        .filter((bowType) => bowType && allowedBowTypes.has(bowType)),
      ...achievementsByBowType.keys(),
      ...classificationsByBowType.keys(),
    ]);

    for (const bowType of targetBowTypes) {
      const handicapEntry = outdoorHandicaps.find(
        (entry) => mapGoldenRecordsBowClassToOutdoorBowType(entry.bowClass) === bowType,
      );
      const achievementEntries = achievementsByBowType.get(bowType) ?? [];
      const classificationEntries = classificationsByBowType.get(bowType) ?? [];
      const existingEntry = memberEntriesByBowType.get(bowType);

      if (existingEntry) {
        let nextEntry = buildGoldenRecordsManagedOutdoorFieldReset(existingEntry);
        let hasChanges =
          JSON.stringify(buildGoldenRecordsManagedOutdoorFieldReset(existingEntry)) !==
          JSON.stringify(existingEntry);

        if (nextEntry.handicap !== (handicapEntry?.handicap ?? nextEntry.handicap)) {
          nextEntry = {
            ...nextEntry,
            handicap: handicapEntry?.handicap ?? nextEntry.handicap,
          };
          hasChanges = true;
        }

        const achievementResult = applyGoldenRecordsAchievementsToEntry(
          nextEntry,
          achievementEntries,
        );
        nextEntry = achievementResult.entry;
        hasChanges = hasChanges || achievementResult.hasChanges;
        const classificationResult = applyGoldenRecordsClassificationsToEntry(
          nextEntry,
          classificationEntries,
        );
        nextEntry = classificationResult.entry;
        hasChanges = hasChanges || classificationResult.hasChanges;

        if (!hasChanges) {
          continue;
        }

        const updatedEntry = await outdoorTableGateway.updateEntry({
          ...nextEntry,
          updatedAtDate,
          updatedAtTime,
          updatedByUsername: syncUpdatedByUsername,
        });

        memberEntriesByBowType.set(bowType, updatedEntry);
        updatedCount += 1;
        continue;
      }

      const createdPayload = buildEmptyOutdoorEntryPayload({
        archerUsername: user.username,
        bowType,
        handicap: handicapEntry?.handicap ?? null,
        updatedAtDate,
        updatedAtTime,
        updatedByUsername: syncUpdatedByUsername,
      });
      const createdResult = applyGoldenRecordsAchievementsToEntry(
        createdPayload,
        achievementEntries,
      );
      const createdWithClassifications = applyGoldenRecordsClassificationsToEntry(
        createdResult.entry,
        classificationEntries,
      );
      const createdEntry = await outdoorTableGateway.createEntry(
        createdWithClassifications.entry,
      );

      memberEntriesByBowType.set(bowType, createdEntry);
      createdCount += 1;
    }

    return {
      createdCount,
      syncedCount: createdCount + updatedCount,
      updatedCount,
    };
  }

  const resolvedGoldenRecordsMemberSyncService = goldenRecordsMemberSyncService ?? {
    async getStoredSnapshotForUser(user) {
      return buildGoldenRecordsSnapshotForUser(user);
    },
    async syncMember(user, { updatedByUsername } = {}) {
      const disciplines = await listMemberDisciplines(user.username);
      const goldenRecords = await buildGoldenRecordsSnapshotForUser(user);

      if (
        goldenRecords.enabled &&
        !goldenRecords.error &&
        goldenRecords.matchSource !== "ambiguous" &&
        goldenRecords.matchSource !== "not-found"
      ) {
        const syncSummary = await syncOutdoorTableFromGoldenRecords({
          disciplines,
          goldenRecordsSnapshot: goldenRecords,
          user,
        });

        return {
          ...syncSummary,
          goldenRecords,
          signOffCount: 0,
        };
      }

      return {
        createdCount: 0,
        goldenRecords,
        signOffCount: 0,
        syncedCount: 0,
        updatedCount: 0,
      };
    },
  };

  async function buildRoleDefinitionPayload(role) {
    const [assignedUserCount, permissions] = await Promise.all([
      roleCommitteeGateway.countUsersByRoleKey(role.role_key),
      roleCommitteeGateway.listRolePermissionKeysByRoleKey(role.role_key),
    ]);

    return {
      roleKey: role.role_key,
      title: role.title,
      isSystem: Boolean(role.is_system),
      assignedUserCount: assignedUserCount.count ?? 0,
      permissions: permissions.filter((permissionKey) =>
        CURRENT_PERMISSION_KEY_SET.has(permissionKey),
      ),
    };
  }

  async function findMemberByUsername(username) {
    return memberDirectoryGateway.findUserByUsername(username);
  }

  async function listMemberDisciplines(username) {
    return (await memberDirectoryGateway.findDisciplinesByUsername(username)).map(
      (discipline) => discipline.discipline,
    );
  }

  async function findMemberLoanBow(username) {
    return memberDirectoryGateway.findLoanBowByUsername(username);
  }

  app.get("/api/profile-options", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (
      !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS) &&
      !actorHasPermission(actor, PERMISSIONS.SIGN_OFF_DISTANCES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to load member options.",
      });
      return;
    }

    res.json({
      success: true,
      members: (await listProfilePageMembers()).map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
      userTypes: listAssignableRoleKeys(),
      disciplines: ALLOWED_DISCIPLINES,
    });
  });

  app.get("/api/roles", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage roles.",
      });
      return;
    }

    const [roles, permissions] = await Promise.all([
      roleCommitteeGateway.listRoleDefinitions(),
      roleCommitteeGateway.listPermissionDefinitions(),
    ]);

    res.json({
      success: true,
      roles: await Promise.all(roles.map(buildRoleDefinitionPayload)),
      permissions: permissions.map((permission) => ({
        key: permission.permission_key,
        label: permission.label,
        description: permission.description,
      })),
    });
  });

  app.post("/api/roles", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create roles.",
      });
      return;
    }

    const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
    const permissionsRaw = Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : [];
    const title = titleRaw.trim();
    const normalizedPermissions = [
      ...new Set(
        permissionsRaw
          .filter((permission) => typeof permission === "string")
          .map((permission) => permission.trim())
          .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
      ),
    ];

    if (!title) {
      res.status(400).json({
        success: false,
        message: "Role title is required.",
      });
      return;
    }

    const roleKey = buildUniqueRoleKeyFromTitle(title);

    if (!roleKey) {
      res.status(400).json({
        success: false,
        message: "Role title must contain letters or numbers.",
      });
      return;
    }

    const createdRole = await roleCommitteeGateway.createRole({
      permissions: normalizedPermissions,
      roleKey,
      title,
    });
    const createdRolePayload = await buildRoleDefinitionPayload(createdRole);
    const [createdAtDate, createdAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: createdRolePayload,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: createdRole.role_key,
        entityLabel: createdRole.title,
        entityType: "role",
        req,
        statusCode: 201,
        target: `/api/roles/${createdRole.role_key}`,
      }).catch((auditError) => {
        console.error("Failed to record role audit event", auditError);
      });
    }
    await refreshRoleAccessSnapshot();
    broadcastRolesUpdated("roles.create");

    res.status(201).json({
      success: true,
      role: createdRolePayload,
    });
  });

  app.put("/api/roles/:roleKey", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update roles.",
      });
      return;
    }

    const roleKey = req.params.roleKey;
    const existingRole = await roleCommitteeGateway.findRoleDefinitionByKey(roleKey);

    if (!existingRole) {
      res.status(404).json({
        success: false,
        message: "Role not found.",
      });
      return;
    }

    const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
    const permissionsRaw = Array.isArray(req.body?.permissions)
      ? req.body.permissions
      : [];
    const title = titleRaw.trim();

    if (!title) {
      res.status(400).json({
        success: false,
        message: "Role title is required.",
      });
      return;
    }

    const normalizedPermissions = [
      ...new Set(
        permissionsRaw
          .filter((permission) => typeof permission === "string")
          .map((permission) => permission.trim())
          .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
      ),
    ];

    const affectedUsernames = await listUsernamesByRoleKey(roleKey);
    const existingRolePayload = await buildRoleDefinitionPayload(existingRole);
    const updatedRole = await roleCommitteeGateway.updateRole({
      permissions: normalizedPermissions,
      roleKey,
      title,
    });
    const updatedRolePayload = await buildRoleDefinitionPayload(updatedRole);
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedRolePayload,
        before: existingRolePayload,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: roleKey,
        entityLabel: updatedRole.title,
        entityType: "role",
        req,
        target: `/api/roles/${roleKey}`,
      }).catch((auditError) => {
        console.error("Failed to record role audit event", auditError);
      });
    }
    await refreshRoleAccessSnapshot();
    broadcastRolesUpdated("roles.update", affectedUsernames);

    res.json({
      success: true,
      role: updatedRolePayload,
    });
  });

  app.delete("/api/roles/:roleKey", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.DELETE_ROLES)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete roles.",
      });
      return;
    }

    const roleKey = req.params.roleKey;
    const existingRole = await roleCommitteeGateway.findRoleDefinitionByKey(roleKey);

    if (!existingRole) {
      res.status(404).json({
        success: false,
        message: "Role not found.",
      });
      return;
    }

    if (existingRole.is_system) {
      res.status(400).json({
        success: false,
        message: "System roles cannot be deleted.",
      });
      return;
    }

    const fallbackRole = await roleCommitteeGateway.findRoleDefinitionByKey("general");

    if (!fallbackRole) {
      res.status(500).json({
        success: false,
        message: "The fallback general role could not be found.",
      });
      return;
    }

    const affectedUsernames = await listUsernamesByRoleKey(roleKey);
    const existingRolePayload = await buildRoleDefinitionPayload(existingRole);
    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    const deleteResult = await roleCommitteeGateway.deleteRole(roleKey, "general");

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: {
          fallbackRoleKey: "general",
          reassignedUserCount: deleteResult?.reassignedUserCount ?? 0,
        },
        before: existingRolePayload,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: roleKey,
        entityLabel: existingRole.title,
        entityType: "role",
        req,
        target: `/api/roles/${roleKey}`,
      }).catch((auditError) => {
        console.error("Failed to record role audit event", auditError);
      });
    }
    await refreshRoleAccessSnapshot();
    broadcastRolesUpdated("roles.delete", affectedUsernames);

    res.json({
      success: true,
      deletedRoleKey: roleKey,
      reassignedUserCount: deleteResult?.reassignedUserCount ?? 0,
    });
  });

  app.get("/api/tournament-options", (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to load tournament setup options.",
      });
      return;
    }

    res.json({
      success: true,
      tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
    });
  });

  function normalizeCommitteeRoleText(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }

  const MAX_COMMITTEE_PHOTO_DATA_URL_LENGTH = 5_000_000;
  const COMMITTEE_PHOTO_DATA_URL_PATTERN =
    /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i;

  function normalizeCommitteeRolePhotoDataUrl(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return null;
    }

    if (
      trimmedValue.length > MAX_COMMITTEE_PHOTO_DATA_URL_LENGTH ||
      !COMMITTEE_PHOTO_DATA_URL_PATTERN.test(trimmedValue)
    ) {
      return null;
    }

    return trimmedValue;
  }

  async function buildUniqueCommitteeRoleKey(title) {
    const baseTitle = normalizeCommitteeRoleText(title);

    if (!baseTitle) {
      return "";
    }

    let nextKey = buildUniqueRoleKeyFromTitle(baseTitle);

    if (!nextKey) {
      return "";
    }

    let counter = 2;

    while (
      (await roleCommitteeGateway.findCommitteeRoleByKey(nextKey)) ||
      (await roleCommitteeGateway.findRoleDefinitionByKey(nextKey))
    ) {
      nextKey = buildUniqueRoleKeyFromTitle(`${baseTitle} ${counter}`);
      counter += 1;
    }

    return nextKey;
  }

  function resolveCommitteeRolePayload(body, existingRole = null) {
    const title = normalizeCommitteeRoleText(body?.title, existingRole?.title ?? "");
    const summary = normalizeCommitteeRoleText(body?.summary, existingRole?.summary ?? "");
    const responsibilities = normalizeCommitteeRoleText(
      body?.responsibilities,
      existingRole?.responsibilities ?? summary,
    );
    const personalBlurb = normalizeCommitteeRoleText(
      body?.personalBlurb,
      existingRole?.personal_blurb ?? "",
    );
    const photoDataUrl =
      body?.photoDataUrl === null
        ? null
        : normalizeCommitteeRolePhotoDataUrl(
            body?.photoDataUrl ?? existingRole?.photo_data_url ?? null,
          );
    const assignedUsername = normalizeCommitteeRoleText(body?.assignedUsername);

    return {
      title,
      summary,
      responsibilities: responsibilities || summary,
      personalBlurb,
      photoDataUrl,
      assignedUsername: assignedUsername || null,
    };
  }

  function buildEditableProfileResponse(user, disciplines, loanBow, canViewRfidTag) {
    const editableProfile = buildEditableMemberProfile(user, disciplines, loanBow);

    if (canViewRfidTag) {
      return editableProfile;
    }

    return {
      ...editableProfile,
      rfidTag: "",
    };
  }

  app.get("/api/committee-roles", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const committeeRoles = await roleCommitteeGateway.listCommitteeRoles();

    res.json({
      success: true,
      roles: committeeRoles.map(buildCommitteeRole),
      members: actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
        ? (await memberDirectoryGateway.listAllUsers()).map((user) => ({
            username: user.username,
            fullName: `${user.first_name} ${user.surname}`,
            userType: user.user_type,
          }))
        : [],
    });
  });

  app.post("/api/committee-roles", async (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create committee roles.",
      });
      return;
    }

    const payload = resolveCommitteeRolePayload(req.body);

    if (!payload.title || !payload.summary) {
      res.status(400).json({
        success: false,
        message: "A title and summary are required.",
      });
      return;
    }

    if (
      payload.assignedUsername &&
      !(await findMemberByUsername(payload.assignedUsername))
    ) {
      res.status(404).json({
        success: false,
        message: "Assigned member not found.",
      });
      return;
    }

    const roleKey = await buildUniqueCommitteeRoleKey(payload.title);

    if (!roleKey) {
      res.status(400).json({
        success: false,
        message: "A valid committee role title is required.",
      });
      return;
    }

    const displayOrder =
      (await roleCommitteeGateway.findMaxCommitteeRoleDisplayOrder())
        .maxDisplayOrder + 1;

    await roleCommitteeGateway.insertCommitteeRole({
      roleKey,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      displayOrder,
      assignedUsername: payload.assignedUsername,
    });

    const createdRole = (await roleCommitteeGateway.listCommitteeRoles())
      .map(buildCommitteeRole)
      .find((entry) => entry.roleKey === roleKey);
    const [createdAtDate, createdAtTime] = getUtcTimestampParts();

    if (auditChangeLogger && createdRole) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: createdRole,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: createdRole.id,
        entityLabel: createdRole.title,
        entityType: "committee_role",
        req,
        statusCode: 201,
        target: `/api/committee-roles/${createdRole.id}`,
      }).catch((auditError) => {
        console.error("Failed to record committee role audit event", auditError);
      });
    }
    broadcastCommitteeUpdated("committee.create");

    res.status(201).json({
      success: true,
      role: createdRole,
    });
  });

  app.put("/api/committee-roles/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update committee roles.",
      });
      return;
    }

    const role = await roleCommitteeGateway.findCommitteeRoleById(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: "Committee role not found.",
      });
      return;
    }

    const payload = resolveCommitteeRolePayload(req.body, role);

    if (
      payload.assignedUsername &&
      !(await findMemberByUsername(payload.assignedUsername))
    ) {
      res.status(404).json({
        success: false,
        message: "Assigned member not found.",
      });
      return;
    }

    if (!payload.title || !payload.summary) {
      res.status(400).json({
        success: false,
        message: "A title and summary are required.",
      });
      return;
    }

    const existingRolePayload = buildCommitteeRole(role);
    await roleCommitteeGateway.updateCommitteeRoleDetails({
      id: role.id,
      title: payload.title,
      summary: payload.summary,
      responsibilities: payload.responsibilities,
      personalBlurb: payload.personalBlurb,
      photoDataUrl: payload.photoDataUrl,
      assignedUsername: payload.assignedUsername,
    });

    const updatedRole = (await roleCommitteeGateway.listCommitteeRoles())
      .map(buildCommitteeRole)
      .find((entry) => entry.id === role.id);
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger && updatedRole) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedRole,
        before: existingRolePayload,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: role.id,
        entityLabel: updatedRole.title,
        entityType: "committee_role",
        req,
        target: `/api/committee-roles/${role.id}`,
      }).catch((auditError) => {
        console.error("Failed to record committee role audit event", auditError);
      });
    }
    broadcastCommitteeUpdated("committee.update");

    res.json({
      success: true,
      role: updatedRole,
    });
  });

  app.delete("/api/committee-roles/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (
      !actor ||
      !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete committee roles.",
      });
      return;
    }

    const role = await roleCommitteeGateway.findCommitteeRoleById(req.params.id);

    if (!role) {
      res.status(404).json({
        success: false,
        message: "Committee role not found.",
      });
      return;
    }

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    await roleCommitteeGateway.deleteCommitteeRoleById(role.id);

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: null,
        before: buildCommitteeRole(role),
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: role.id,
        entityLabel: role.title,
        entityType: "committee_role",
        req,
        target: `/api/committee-roles/${role.id}`,
      }).catch((auditError) => {
        console.error("Failed to record committee role audit event", auditError);
      });
    }
    broadcastCommitteeUpdated("committee.delete");

    res.json({
      success: true,
      deletedRoleId: role.id,
    });
  });

  app.get("/api/user-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const isSelf =
      actor.username.localeCompare(requestedUsername, undefined, {
        sensitivity: "accent",
      }) === 0;

    const canManageMembers = actorHasPermission(
      actor,
      PERMISSIONS.MANAGE_MEMBERS,
    );
    const canSignOffDistances = actorHasPermission(
      actor,
      PERMISSIONS.SIGN_OFF_DISTANCES,
    );

    if (!isSelf && !canManageMembers && !canSignOffDistances) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to edit another member profile.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const disciplines = await listMemberDisciplines(user.username);
    const loanBow = await findMemberLoanBow(user.username);

    const goldenRecords = await resolvedGoldenRecordsMemberSyncService.getStoredSnapshotForUser(user);

    res.json({
      success: true,
      editableProfile: await buildEditableProfileWithDistanceSignOffs(
        user,
        disciplines,
        loanBow,
        canManageMembers,
      ),
      goldenRecords,
      userProfile: buildMemberUserProfile(user, disciplines),
      userTypes: listAssignableRoleKeys(),
      disciplines: ALLOWED_DISCIPLINES,
    });
  });

  app.post("/api/user-profiles/:username/golden-records/refresh-handicap", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to sync Golden Records.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const syncSummary = await resolvedGoldenRecordsMemberSyncService.syncMember(user, {
      updatedByUsername: actor.username,
    });
    const goldenRecords = syncSummary.goldenRecords;

    if (!goldenRecords.enabled) {
      res.status(400).json({
        success: false,
        message: "Golden Records is not enabled for this environment.",
      });
      return;
    }

    if (goldenRecords.error) {
      res.status(502).json({
        success: false,
        message: goldenRecords.error,
      });
      return;
    }

    if (goldenRecords.matchSource === "ambiguous") {
      res.status(409).json({
        candidateMatches: goldenRecords.candidateMatches ?? [],
        goldenRecords,
        success: false,
        message:
          "Golden Records matched more than one archer for this member. Please confirm the member details there first.",
      });
      return;
    }

    if (goldenRecords.matchSource === "not-found") {
      res.status(404).json({
        candidateMatches: goldenRecords.candidateMatches ?? [],
        goldenRecords,
        success: false,
        message:
          "No Golden Records archer could be matched automatically for this member. Please choose the correct account carefully.",
      });
      return;
    }

    serverEventBus?.broadcastToAll("outdoor-table.updated", {
      changedAt: new Date().toISOString(),
      scope: "golden-records-sync",
      username: user.username,
    });
    broadcastMembersUpdated("members.golden-records-sync", user.username);

    res.json({
      success: true,
      goldenRecords,
      message:
        syncSummary.syncedCount > 0 || syncSummary.signOffCount > 0
          ? `Golden Records synced. ${syncSummary.syncedCount} outdoor field ${
              syncSummary.syncedCount === 1 ? "change was" : "changes were"
            } synced and ${syncSummary.signOffCount} distance sign-off ${
              syncSummary.signOffCount === 1 ? "was" : "were"
            } refreshed.`
          : "Golden Records synced. No local data changes were needed.",
      syncedHandicapCount: syncSummary.syncedCount,
      updatedHandicapCount: syncSummary.updatedCount,
      createdHandicapCount: syncSummary.createdCount,
    });
  });

  app.post("/api/user-profiles/:username/golden-records/assign-match", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;
    const goldenRecordsId = String(req.body?.goldenRecordsId ?? "").trim();

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to assign Golden Records accounts.",
      });
      return;
    }

    if (!goldenRecordsId) {
      res.status(400).json({
        success: false,
        message: "A Golden Records account must be selected before it can be assigned.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    await memberDirectoryGateway.updateGoldenRecordsId(user.username, goldenRecordsId);
    user.gr_id = goldenRecordsId;

    const syncSummary = await resolvedGoldenRecordsMemberSyncService.syncMember(user, {
      updatedByUsername: actor.username,
    });
    const goldenRecords = syncSummary.goldenRecords;

    if (!goldenRecords.enabled) {
      res.status(400).json({
        success: false,
        message: "Golden Records is not enabled for this environment.",
      });
      return;
    }

    if (goldenRecords.error) {
      res.status(502).json({
        success: false,
        message: goldenRecords.error,
      });
      return;
    }

    serverEventBus?.broadcastToAll("outdoor-table.updated", {
      changedAt: new Date().toISOString(),
      scope: "golden-records-match-assigned",
      username: user.username,
    });
    broadcastMembersUpdated("members.golden-records-match-assigned", user.username);

    res.json({
      success: true,
      goldenRecords,
      message:
        syncSummary.syncedCount > 0 || syncSummary.signOffCount > 0
          ? `Golden Records account assigned and refreshed. ${syncSummary.syncedCount} outdoor field ${
              syncSummary.syncedCount === 1 ? "change was" : "changes were"
            } synced and ${syncSummary.signOffCount} distance sign-off ${
              syncSummary.signOffCount === 1 ? "was" : "were"
            } refreshed.`
          : "Golden Records account assigned and refreshed. No local data changes were needed.",
      syncedHandicapCount: syncSummary.syncedCount,
      updatedHandicapCount: syncSummary.updatedCount,
      createdHandicapCount: syncSummary.createdCount,
    });
  });

  app.post("/api/user-profiles", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create member profiles.",
      });
      return;
    }

    const {
      username,
      firstName,
      surname,
      goldenRecordsId,
      archeryGbMembershipNumber,
      emailAddress,
      password,
      rfidTag,
      activeMember,
      affiliateMember,
      juniorMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
    } = req.body ?? {};

    if (await findMemberByUsername(username ?? "")) {
      res.status(409).json({
        success: false,
        message: "A member with that username already exists.",
      });
      return;
    }

    const result = await saveMemberProfile({
      username,
      firstName,
      surname,
      goldenRecordsId,
      archeryGbMembershipNumber,
      emailAddress,
      password,
      rfidTag,
      activeMember,
      affiliateMember,
      juniorMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
      existingUser: null,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const createdUser = await findMemberByUsername(username);
    const createdDisciplines = await listMemberDisciplines(username);
    const createdLoanBow = await findMemberLoanBow(username);
    const createdEditableProfile = createdUser
      ? await buildEditableProfileWithDistanceSignOffs(
          createdUser,
          createdDisciplines,
          createdLoanBow,
          true,
        )
      : result.editableProfile ?? null;

    if (auditChangeLogger && createdEditableProfile) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: createdEditableProfile,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: username,
        entityLabel: `${firstName ?? ""} ${surname ?? ""}`.trim() || String(username),
        entityType: "member_profile",
        req,
        statusCode: 201,
        target: `/api/user-profiles/${username}`,
      }).catch((auditError) => {
        console.error("Failed to record member profile audit event", auditError);
      });
    }

    broadcastMembersUpdated("members.create", username);

    res.status(201).json({
      success: true,
      ...result,
    });
  });

  app.put("/api/user-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const existingUser = await findMemberByUsername(requestedUsername);

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const isSelf =
      actor.username.localeCompare(existingUser.username, undefined, {
        sensitivity: "accent",
      }) === 0;

    const canManageMembers = actorHasPermission(
      actor,
      PERMISSIONS.MANAGE_MEMBERS,
    );
    const canManageMemberDisciplines =
      canManageMembers ||
      actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBER_DISCIPLINES);

    if (!isSelf && !canManageMembers) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update another member profile.",
      });
      return;
    }

    const {
      firstName,
      surname,
      goldenRecordsId,
      archeryGbMembershipNumber,
      emailAddress,
      password,
      rfidTag,
      activeMember,
      affiliateMember,
      juniorMember,
      membershipFeesDue,
      coachingVolunteer,
      userType,
      disciplines,
      loanBow,
    } = req.body ?? {};

    const previousDisciplines = await listMemberDisciplines(existingUser.username);
    const previousLoanBow = await findMemberLoanBow(existingUser.username);
    const previousEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      existingUser,
      previousDisciplines,
      previousLoanBow,
      canManageMembers,
    );

    const result = await saveMemberProfile({
      username: existingUser.username,
      firstName,
      surname,
      goldenRecordsId: canManageMembers ? goldenRecordsId : existingUser.gr_id,
      archeryGbMembershipNumber: canManageMembers || isSelf
        ? archeryGbMembershipNumber
        : existingUser.archery_gb_membership_number,
      emailAddress,
      password,
      rfidTag: canManageMembers ? rfidTag : existingUser.rfid_tag,
      activeMember: canManageMembers ? activeMember : existingUser.active_member,
      affiliateMember: canManageMembers
        ? affiliateMember
        : existingUser.affiliate_member,
      juniorMember: canManageMembers
        ? juniorMember
        : existingUser.junior_member,
      membershipFeesDue: canManageMembers
        ? membershipFeesDue
        : existingUser.membership_fees_due,
      coachingVolunteer: canManageMembers
        ? coachingVolunteer
        : existingUser.coaching_volunteer,
      userType: canManageMembers ? userType : existingUser.user_type,
      disciplines: canManageMemberDisciplines
        ? disciplines
        : await listMemberDisciplines(existingUser.username),
      loanBow: canManageMembers
        ? loanBow
        : buildLoanBowRecord(await findMemberLoanBow(existingUser.username)),
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    const updatedUser = await findMemberByUsername(existingUser.username);
    const updatedDisciplines = result.editableProfile?.disciplines ?? [];
    const updatedLoanBow = await findMemberLoanBow(existingUser.username);
    const updatedEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      updatedUser,
      updatedDisciplines,
      updatedLoanBow,
      canManageMembers,
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedEditableProfile,
        before: previousEditableProfile,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: existingUser.username,
        entityLabel: `${updatedUser?.first_name ?? existingUser.first_name} ${updatedUser?.surname ?? existingUser.surname}`.trim(),
        entityType: "member_profile",
        req,
        target: `/api/user-profiles/${existingUser.username}`,
      }).catch((auditError) => {
        console.error("Failed to record member profile audit event", auditError);
      });
    }

    broadcastMembersUpdated("members.update", existingUser.username);

    res.json({
      success: true,
      ...result,
      editableProfile: updatedEditableProfile,
    });
  });

  app.delete("/api/user-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete member profiles.",
      });
      return;
    }

    const existingUser = await findMemberByUsername(requestedUsername);

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    if (
      actor.username.localeCompare(existingUser.username, undefined, {
        sensitivity: "accent",
      }) === 0
    ) {
      res.status(400).json({
        success: false,
        message: "You cannot delete your own member profile.",
      });
      return;
    }

    const confirmationUsername =
      typeof req.body?.confirmationUsername === "string"
        ? req.body.confirmationUsername.trim()
        : "";

    if (confirmationUsername !== existingUser.username) {
      res.status(400).json({
        success: false,
        message: "Type the exact member username to confirm deletion.",
      });
      return;
    }

    const existingDisciplines = await listMemberDisciplines(existingUser.username);
    const existingLoanBow = await findMemberLoanBow(existingUser.username);
    const previousEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      existingUser,
      existingDisciplines,
      existingLoanBow,
      true,
    );

    const result = await saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      archeryGbMembershipNumber: existingUser.archery_gb_membership_number,
      emailAddress: existingUser.email_address,
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag,
      activeMember: false,
      affiliateMember: existingUser.affiliate_member,
      juniorMember: existingUser.junior_member,
      membershipFeesDue: existingUser.membership_fees_due,
      coachingVolunteer: existingUser.coaching_volunteer,
      userType: existingUser.user_type,
      disciplines: existingDisciplines,
      loanBow: buildLoanBowRecord(existingLoanBow),
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    const deletedUser = await findMemberByUsername(existingUser.username);
    const deletedLoanBow = await findMemberLoanBow(existingUser.username);
    const deletedEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      deletedUser,
      existingDisciplines,
      deletedLoanBow,
      true,
    );
    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: deletedEditableProfile,
        before: previousEditableProfile,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: existingUser.username,
        entityLabel: `${existingUser.first_name} ${existingUser.surname}`.trim(),
        entityType: "member_profile",
        req,
        target: `/api/user-profiles/${existingUser.username}`,
      }).catch((auditError) => {
        console.error("Failed to record member profile delete event", auditError);
      });
    }

    broadcastMembersUpdated("members.delete", existingUser.username);

    res.json({
      success: true,
      deletedUsername: existingUser.username,
      message: `${existingUser.username} deleted successfully.`,
    });
  });

  app.post("/api/user-profiles/:username/distance-sign-offs", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.SIGN_OFF_DISTANCES)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to sign off member distances.",
      });
      return;
    }

    const member = await findMemberByUsername(requestedUsername);

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    if (
      actor.username.localeCompare(member.username, undefined, {
        sensitivity: "accent",
      }) === 0
    ) {
      res.status(400).json({
        success: false,
        message:
          "Members cannot sign themselves off. Another authorised member must complete the sign-off.",
      });
      return;
    }

    const discipline =
      typeof req.body?.discipline === "string" ? req.body.discipline.trim() : "";
    const distanceYards = Number.parseInt(req.body?.distanceYards, 10);
    const memberPasswordConfirmation =
      typeof req.body?.memberPasswordConfirmation === "string"
        ? req.body.memberPasswordConfirmation
        : "";
    const disciplines = await listMemberDisciplines(member.username);

    if (!disciplines.includes(discipline)) {
      res.status(400).json({
        success: false,
        message: "Choose a discipline recorded on this member profile.",
      });
      return;
    }

    if (!DISTANCE_SIGN_OFF_YARDS.includes(distanceYards)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid distance to sign off.",
      });
      return;
    }

    if (!verifyPassword(memberPasswordConfirmation, member.password)) {
      res.status(400).json({
        success: false,
        message: "The member password confirmation is incorrect.",
      });
      return;
    }

    const [signedOffAtDate, signedOffAtTime] = getUtcTimestampParts();

    await memberDistanceSignOffRepository.upsert({
      username: member.username,
      discipline,
      distanceYards,
      signedOffByUsername: actor.username,
      signedOffAtDate,
      signedOffAtTime,
    });
    const updatedSignOff =
      (await memberDistanceSignOffRepository
        .listByUsername(member.username))
        .find(
          (entry) =>
            entry.discipline === discipline &&
            entry.distanceYards === distanceYards,
        ) ?? null;

    if (auditChangeLogger && updatedSignOff) {
      void auditChangeLogger.recordEntityChange({
        action: "signed_off",
        actorUsername: actor.username,
        after: updatedSignOff,
        before: null,
        changedAtDate: signedOffAtDate,
        changedAtTime: signedOffAtTime,
        entityId: `${member.username}:${discipline}:${distanceYards}`,
        entityLabel: `${member.username} ${discipline} ${distanceYards}yd`,
        entityType: "distance_sign_off",
        req,
        statusCode: 201,
        target: `/api/user-profiles/${member.username}/distance-sign-offs`,
      }).catch((auditError) => {
        console.error("Failed to record distance sign-off audit event", auditError);
      });
    }
    broadcastMembersUpdated("members.distance-signoff", member.username);

    const loanBow = await findMemberLoanBow(member.username);

    res.status(201).json({
      success: true,
      message: `${discipline} ${distanceYards} yds signed off for ${member.first_name} ${member.surname}.`,
      signOff: updatedSignOff,
      editableProfile: await buildEditableProfileWithDistanceSignOffs(
        member,
        disciplines,
        loanBow,
        actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS),
      ),
    });
  });

  app.post("/api/user-profiles/:username/assign-rfid", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to issue member cards.",
      });
      return;
    }

    const existingUser = await findMemberByUsername(requestedUsername);
    const rfidTag =
      typeof req.body?.rfidTag === "string" ? req.body.rfidTag.trim() : "";

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    if (!rfidTag) {
      res.status(400).json({
        success: false,
        message: "An RFID tag is required to issue a member card.",
      });
      return;
    }

    const disciplines = await listMemberDisciplines(existingUser.username);
    const loanBow = buildLoanBowRecord(await findMemberLoanBow(existingUser.username));
    const previousEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      existingUser,
      disciplines,
      await findMemberLoanBow(existingUser.username),
      true,
    );
    const result = await saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      archeryGbMembershipNumber: existingUser.archery_gb_membership_number,
      password: existingUser.password,
      rfidTag,
      activeMember: existingUser.active_member,
      affiliateMember: existingUser.affiliate_member,
      juniorMember: existingUser.junior_member,
      membershipFeesDue: existingUser.membership_fees_due,
      coachingVolunteer: existingUser.coaching_volunteer,
      userType: existingUser.user_type,
      disciplines,
      loanBow,
      existingUser,
    });

    if (!result.success) {
      res.status(result.status).json(result);
      return;
    }

    const updatedUser = await findMemberByUsername(existingUser.username);
    const updatedLoanBow = await findMemberLoanBow(existingUser.username);
    const updatedEditableProfile = await buildEditableProfileWithDistanceSignOffs(
      updatedUser,
      disciplines,
      updatedLoanBow,
      true,
    );
    const [assignedAtDate, assignedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "rfid_assigned",
        actorUsername: actor.username,
        after: updatedEditableProfile,
        before: previousEditableProfile,
        changedAtDate: assignedAtDate,
        changedAtTime: assignedAtTime,
        entityId: existingUser.username,
        entityLabel: `${updatedUser?.first_name ?? existingUser.first_name} ${updatedUser?.surname ?? existingUser.surname}`.trim(),
        entityType: "member_profile",
        req,
        target: `/api/user-profiles/${existingUser.username}/assign-rfid`,
      }).catch((auditError) => {
        console.error("Failed to record RFID audit event", auditError);
      });
    }

    broadcastMembersUpdated("members.assign-rfid", existingUser.username);

    res.json({
      success: true,
      ...result,
    });
  });

  app.get("/api/loan-bow-options", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    res.json({
      success: true,
      members: (await memberDirectoryGateway
        .listAllUsers())
        .filter(
          (user) =>
            !getPermissionsForRole(user.user_type).includes(
              PERMISSIONS.MANAGE_MEMBERS,
            ),
        )
        .map((user) => ({
          username: user.username,
          fullName: `${user.first_name} ${user.surname}`,
          userType: user.user_type,
        })),
    });
  });

  app.get("/api/loan-bow-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: buildLoanBowRecord(await findMemberLoanBow(user.username)),
    });
  });

  app.put("/api/loan-bow-profiles/:username", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const loanBow = sanitizeLoanBow(req.body?.loanBow);
    const previousLoanBow = buildLoanBowRecord(await findMemberLoanBow(user.username));

    await saveLoanBowRecord(user.username, loanBow);
    const updatedLoanBow = buildLoanBowRecord(await findMemberLoanBow(user.username));
    const [savedAtDate, savedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedLoanBow,
        before: previousLoanBow,
        changedAtDate: savedAtDate,
        changedAtTime: savedAtTime,
        entityId: user.username,
        entityLabel: `${user.first_name} ${user.surname}`.trim(),
        entityType: "loan_bow_profile",
        req,
        target: `/api/loan-bow-profiles/${user.username}`,
      }).catch((auditError) => {
        console.error("Failed to record loan bow audit event", auditError);
      });
    }
    broadcastMembersUpdated("members.loan-bow-save", user.username);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: updatedLoanBow,
    });
  });

  app.post("/api/loan-bow-profiles/:username/return", async (req, res) => {
    const actor = getActorUser(req);
    const requestedUsername = req.params.username;

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage loan bow records.",
      });
      return;
    }

    const user = await findMemberByUsername(requestedUsername);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "Member profile not found.",
      });
      return;
    }

    const existingLoanBow = buildLoanBowRecord(
      await findMemberLoanBow(user.username),
    );
    const returnResult = sanitizeLoanBowReturn(
      existingLoanBow,
      req.body?.loanBowReturn,
    );

    if (!returnResult.success) {
      res.status(returnResult.status).json(returnResult);
      return;
    }

    const previousLoanBow = existingLoanBow;
    await saveLoanBowRecord(user.username, returnResult.loanBow);
    const updatedLoanBow = buildLoanBowRecord(await findMemberLoanBow(user.username));
    const [returnedAtDate, returnedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "returned",
        actorUsername: actor.username,
        after: updatedLoanBow,
        before: previousLoanBow,
        changedAtDate: returnedAtDate,
        changedAtTime: returnedAtTime,
        entityId: user.username,
        entityLabel: `${user.first_name} ${user.surname}`.trim(),
        entityType: "loan_bow_profile",
        req,
        target: `/api/loan-bow-profiles/${user.username}/return`,
      }).catch((auditError) => {
        console.error("Failed to record loan bow audit event", auditError);
      });
    }
    broadcastMembersUpdated("members.loan-bow-return", user.username);

    res.json({
      success: true,
      member: {
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      },
      loanBow: updatedLoanBow,
    });
  });
}
