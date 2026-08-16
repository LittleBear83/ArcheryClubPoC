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

function normalizeGoldenRecordsHandicapType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized.includes("outdoor")) {
    return "outdoor";
  }

  if (normalized.includes("indoor")) {
    return "indoor";
  }

  return normalized;
}

function mapGoldenRecordsBowClassToDiscipline(bowClass) {
  switch (String(bowClass ?? "").trim().toLowerCase()) {
    case "recurve":
      return "Recurve Bow";
    case "compound":
      return "Compound Bow";
    case "barebow":
      return "Bare Bow";
    case "longbow":
      return "Long Bow";
    default:
      return "";
  }
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
const GOLDEN_RECORDS_252_ACHIEVEMENT_ALIAS_TO_FIELD = new Map([
  ["252 white", "award25220"],
  ["252 black", "award25230"],
]);
const GOLDEN_RECORDS_252_SEQUENCE_BY_ALIAS = new Map([
  ["252 white", 1],
  ["252 black", 1],
]);
const GOLDEN_RECORDS_252_DISTANCE_BY_AWARD_KEY = new Map([
  ["award25220", 20],
  ["award25230", 30],
  ["award25240", 40],
  ["award25250", 50],
  ["award25260", 60],
  ["award25280", 80],
  ["award252100", 100],
]);

const GOLDEN_RECORDS_252_ACHIEVEMENT_DISTANCE_PATTERN = /^252@\s*(20|30|40|50|60|80|100)\s*yds\/[123]$/i;
const GOLDEN_RECORDS_252_ACHIEVEMENT_SEQUENCE_PATTERN = /^252@\s*(20|30|40|50|60|80|100)\s*yds\/([123])$/i;
const GOLDEN_RECORDS_SIGHTMARK_DISTANCE_PATTERN = /sight\s*mark\s*(20|30|40|50|60|80|100)\s*yds?/i;

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
  ["grand master bowman", { flagKey: "grandMasterBowman", dateKey: "grandMasterBowmanDate" }],
  ["elite master bowman", { flagKey: "eliteMasterBowman", dateKey: "eliteMasterBowmanDate" }],
]);

function normalizeGoldenRecordsDate(value) {
  return String(value ?? "").trim().slice(0, 10);
}

function normalizeGoldenRecordsTime(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "00:00:00";
  }

  return normalized.length >= 8 ? normalized.slice(11, 19) || "00:00:00" : "00:00:00";
}

function createDefaultSnapshot(isEnabled) {
  return {
    achievements: [],
    candidateMatches: [],
    classifications: [],
    enabled: isEnabled,
    fetchedAt: "",
    handicaps: [],
    matchedMemberId: "",
    matchedMemberName: "",
    matchSource: isEnabled ? "not-synced" : "disabled",
  };
}

function getGoldenRecords252AwardKey({ achievementName, roundName }) {
  const directRoundMatch = GOLDEN_RECORDS_252_ROUND_TO_FIELD.get(roundName);

  if (directRoundMatch) {
    return directRoundMatch;
  }

  const achievementAliasMatch = GOLDEN_RECORDS_252_ACHIEVEMENT_ALIAS_TO_FIELD.get(
    String(achievementName ?? "").trim().toLowerCase(),
  );

  if (achievementAliasMatch) {
    return achievementAliasMatch;
  }

  const achievementDistanceMatch = String(achievementName ?? "")
    .trim()
    .match(GOLDEN_RECORDS_252_ACHIEVEMENT_DISTANCE_PATTERN);

  if (!achievementDistanceMatch) {
    return null;
  }

  return GOLDEN_RECORDS_252_ROUND_TO_FIELD.get(`252 - ${achievementDistanceMatch[1]} yds`) ?? null;
}

function normalizeGoldenRecordsSignOffDates(value) {
  const dates = Array.isArray(value)
    ? value.map((entry) => normalizeGoldenRecordsDate(entry)).filter(Boolean)
    : [];

  return [...new Set(dates)].sort((left, right) => left.localeCompare(right)).slice(0, 3);
}

function normalizeGoldenRecords252Achievement(achievement) {
  const achievementName = String(achievement?.achievement ?? "").trim();
  const normalizedAchievementName = achievementName.toLowerCase();
  const roundName = String(achievement?.round ?? "").trim();
  const achievedDate = normalizeGoldenRecordsDate(achievement?.achieved);
  const awardKey = getGoldenRecords252AwardKey({
    achievementName,
    roundName,
  });

  if (!awardKey || !achievedDate) {
    return null;
  }

  const sequenceMatch = achievementName.match(GOLDEN_RECORDS_252_ACHIEVEMENT_SEQUENCE_PATTERN);
  const sequenceNumber = sequenceMatch
    ? Number.parseInt(sequenceMatch[2], 10)
    : (GOLDEN_RECORDS_252_SEQUENCE_BY_ALIAS.get(normalizedAchievementName) ?? null);
  const distanceYards = GOLDEN_RECORDS_252_DISTANCE_BY_AWARD_KEY.get(awardKey) ?? null;

  return {
    achievedDate,
    awardKey,
    distanceYards,
    sequenceNumber,
    sourceAchievementId: String(achievement?.achievementId ?? achievement?.achievement_id ?? "").trim(),
    sourceLabel: achievementName,
  };
}

function normalizeGoldenRecords252Achievements(achievements = []) {
  const normalizedEntries = achievements
    .map((achievement) => normalizeGoldenRecords252Achievement(achievement))
    .filter(Boolean);

  normalizedEntries.sort((left, right) => {
    const byDistance = (left.distanceYards ?? 0) - (right.distanceYards ?? 0);

    if (byDistance !== 0) {
      return byDistance;
    }

    const leftSequence = left.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const rightSequence = right.sequenceNumber ?? Number.MAX_SAFE_INTEGER;
    const bySequence = leftSequence - rightSequence;

    if (bySequence !== 0) {
      return bySequence;
    }

    const byDate = left.achievedDate.localeCompare(right.achievedDate);

    if (byDate !== 0) {
      return byDate;
    }

    return left.sourceLabel.localeCompare(right.sourceLabel);
  });

  return normalizedEntries;
}

function buildGoldenRecordsManagedOutdoorFieldReset(entry) {
  const nextEntry = { ...entry };

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

function applyGoldenRecordsAchievementsToEntry(entry, achievements = []) {
  let nextEntry = { ...entry };
  let hasChanges = false;

  for (const achievement of achievements) {
    const achievementName = String(achievement.achievement ?? "").trim();
    const achievedDate = normalizeGoldenRecordsDate(achievement.achieved);
    const mappedAchievement = GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS.find(
      (candidate) => candidate.achievement.toLowerCase() === achievementName.toLowerCase(),
    );

    if (mappedAchievement) {
      if (!nextEntry[mappedAchievement.flagKey] || nextEntry[mappedAchievement.dateKey] !== achievedDate) {
        nextEntry = {
          ...nextEntry,
          [mappedAchievement.flagKey]: true,
          [mappedAchievement.dateKey]: achievedDate,
        };
        hasChanges = true;
      }

      continue;
    }
  }

  const normalized252Achievements = normalizeGoldenRecords252Achievements(achievements);
  const signOffDatesByAwardKey = normalized252Achievements.reduce((next, achievement) => {
    const currentDates = next.get(achievement.awardKey) ?? [];
    currentDates.push(achievement.achievedDate);
    next.set(achievement.awardKey, currentDates);
    return next;
  }, new Map());

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

function getSightmarkDistance(achievementName) {
  const match = String(achievementName ?? "").trim().match(GOLDEN_RECORDS_SIGHTMARK_DISTANCE_PATTERN);

  if (!match) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

export function createGoldenRecordsMemberSyncService({
  distanceSignOffYards,
  getUtcTimestampParts,
  goldenRecordsCurrentHandicapService,
  goldenRecordsSyncGateway,
  logger = console,
  memberDirectoryGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
}) {
  async function getStoredSnapshotForUser(user) {
    if (!user) {
      return createDefaultSnapshot(false);
    }

    const storedSnapshot = await goldenRecordsSyncGateway.findByUsername(user.username);

    if (storedSnapshot) {
      return storedSnapshot;
    }

    return createDefaultSnapshot(Boolean(goldenRecordsCurrentHandicapService?.isEnabled));
  }

  async function persistSnapshot(user, snapshot, updatedByUsername) {
    const [syncedAtDate, syncedAtTime] = getUtcTimestampParts();

    await goldenRecordsSyncGateway.upsertSnapshot({
      fetchedAt: snapshot?.fetchedAt ?? "",
      snapshot,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
      username: user.username,
    });
  }

  async function buildLiveSnapshotForUser(user) {
    if (!goldenRecordsCurrentHandicapService?.isEnabled || !user) {
      return createDefaultSnapshot(false);
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
        await memberDirectoryGateway.updateGoldenRecordsId(user.username, snapshot.matchedMemberId);
        user.gr_id = snapshot.matchedMemberId;
      } catch (error) {
        logger.error?.("Failed to persist Golden Records member id", {
          error: error instanceof Error ? error.message : error,
          matchedMemberId: snapshot.matchedMemberId,
          username: user.username,
        });
      }
    }

    return snapshot;
  }

  async function syncOutdoorTableFromGoldenRecords({ disciplines, goldenRecordsSnapshot, updatedByUsername, user }) {
    const outdoorHandicaps = (goldenRecordsSnapshot?.handicaps ?? []).filter(
      (entry) =>
        normalizeGoldenRecordsHandicapType(entry.type) === "outdoor" &&
        Number.isInteger(entry.handicap),
    );
    const matchedMemberId = String(goldenRecordsSnapshot?.matchedMemberId ?? "").trim();
    const outdoorClassifications = (goldenRecordsSnapshot?.classifications ?? []).filter((entry) => {
      if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
        return false;
      }

      return (
        String(entry.type ?? "").trim().toLowerCase() === "outdoor" &&
        GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD.has(
          String(entry.classification ?? "").trim().toLowerCase(),
        )
      );
    });
    const outdoorAchievements = (goldenRecordsSnapshot?.achievements ?? []).filter((entry) => {
      const achievementName = String(entry.achievement ?? "").trim().toLowerCase();
      const roundName = String(entry.round ?? "").trim();

      if (matchedMemberId && String(entry.memberId ?? "").trim() !== matchedMemberId) {
        return false;
      }

      return (
        Boolean(getGoldenRecords252AwardKey({ achievementName: entry.achievement, roundName })) ||
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

        const achievementResult = applyGoldenRecordsAchievementsToEntry(nextEntry, achievementEntries);
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

        await outdoorTableGateway.updateEntry({
          ...nextEntry,
          updatedAtDate,
          updatedAtTime,
          updatedByUsername,
        });
        updatedCount += 1;
        continue;
      }

      const createdPayload = buildEmptyOutdoorEntryPayload({
        archerUsername: user.username,
        bowType,
        handicap: handicapEntry?.handicap ?? null,
        updatedAtDate,
        updatedAtTime,
        updatedByUsername,
      });
      const createdResult = applyGoldenRecordsAchievementsToEntry(createdPayload, achievementEntries);
      const createdWithClassifications = applyGoldenRecordsClassificationsToEntry(
        createdResult.entry,
        classificationEntries,
      );

      await outdoorTableGateway.createEntry(createdWithClassifications.entry);
      createdCount += 1;
    }

    return {
      createdCount,
      syncedCount: createdCount + updatedCount,
      updatedCount,
    };
  }

  async function syncDistanceSignOffsFromGoldenRecords({
    disciplines,
    goldenRecordsSnapshot,
    updatedByUsername,
    user,
  }) {
    const matchedMemberId = String(goldenRecordsSnapshot?.matchedMemberId ?? "").trim();
    const allowedDisciplineSet = new Set(disciplines);
    const signOffsByDiscipline = new Map();

    for (const achievement of goldenRecordsSnapshot?.achievements ?? []) {
      if (matchedMemberId && String(achievement.memberId ?? "").trim() !== matchedMemberId) {
        continue;
      }

      const distanceYards = getSightmarkDistance(achievement.achievement);
      const discipline = mapGoldenRecordsBowClassToDiscipline(achievement.bowClass);
      const achievedDate = normalizeGoldenRecordsDate(achievement.achieved);

      if (
        !distanceYards ||
        !distanceSignOffYards.includes(distanceYards) ||
        !discipline ||
        !allowedDisciplineSet.has(discipline) ||
        !achievedDate
      ) {
        continue;
      }

      const current = signOffsByDiscipline.get(discipline) ?? [];
      current.push({
        username: user.username,
        discipline,
        distanceYards,
        source: "golden-records",
        signedOffAtDate: achievedDate,
        signedOffAtTime: normalizeGoldenRecordsTime(achievement.achieved),
        signedOffByUsername: updatedByUsername,
      });
      signOffsByDiscipline.set(discipline, current);
    }

    let replacedCount = 0;

    for (const discipline of disciplines) {
      const signOffs = (signOffsByDiscipline.get(discipline) ?? [])
        .sort((left, right) => left.distanceYards - right.distanceYards)
        .reduce((next, signOff) => {
          if (!next.some((entry) => entry.distanceYards === signOff.distanceYards)) {
            next.push(signOff);
          }

          return next;
        }, []);

      await memberDistanceSignOffRepository.replaceForDiscipline(
        user.username,
        discipline,
        signOffs,
      );
      replacedCount += signOffs.length;
    }

    return {
      replacedCount,
    };
  }

  async function syncMember(user, { updatedByUsername } = {}) {
    if (!user) {
      throw new Error("A member is required before Golden Records can be synced.");
    }

    const safeUpdatedByUsername =
      String(updatedByUsername ?? "").trim() || String(user.username ?? "").trim();
    const disciplines = (await memberDirectoryGateway.findDisciplinesByUsername(user.username)).map(
      (discipline) => discipline.discipline,
    );
    const snapshot = await buildLiveSnapshotForUser(user);

    await persistSnapshot(user, snapshot, safeUpdatedByUsername);

    if (!snapshot.enabled || snapshot.error) {
      return {
        createdCount: 0,
        goldenRecords: snapshot,
        signOffCount: 0,
        syncedCount: 0,
        updatedCount: 0,
      };
    }

    if (snapshot.matchSource === "ambiguous" || snapshot.matchSource === "not-found") {
      return {
        createdCount: 0,
        goldenRecords: snapshot,
        signOffCount: 0,
        syncedCount: 0,
        updatedCount: 0,
      };
    }

    const outdoorSyncSummary = await syncOutdoorTableFromGoldenRecords({
      disciplines,
      goldenRecordsSnapshot: snapshot,
      updatedByUsername: safeUpdatedByUsername,
      user,
    });
    let signOffSummary = {
      replacedCount: 0,
    };
    let signOffError = "";

    try {
      signOffSummary = await syncDistanceSignOffsFromGoldenRecords({
        disciplines,
        goldenRecordsSnapshot: snapshot,
        updatedByUsername: safeUpdatedByUsername,
        user,
      });
    } catch (error) {
      signOffError =
        error instanceof Error ? error.message : "Distance sign-off sync failed.";
      logger.error?.("Golden Records distance sign-off sync failed for member", {
        error: signOffError,
        username: user.username,
      });
    }

    return {
      createdCount: outdoorSyncSummary.createdCount,
      goldenRecords: snapshot,
      signOffError,
      signOffCount: signOffSummary.replacedCount,
      syncedCount: outdoorSyncSummary.syncedCount,
      updatedCount: outdoorSyncSummary.updatedCount,
    };
  }

  async function syncAllMembers({ updatedByUsername } = {}) {
    const users = await memberDirectoryGateway.listAllUsers();
    const summary = {
      attemptedCount: 0,
      syncedCount: 0,
      errorCount: 0,
      errors: [],
    };

    for (const user of users) {
      summary.attemptedCount += 1;

      try {
        await syncMember(user, { updatedByUsername });
        summary.syncedCount += 1;
      } catch (error) {
        summary.errorCount += 1;
        summary.errors.push({
          message: error instanceof Error ? error.message : "Golden Records sync failed.",
          username: user.username,
        });
        logger.error?.("Golden Records scheduled sync failed for member", {
          error: error instanceof Error ? error.message : error,
          username: user.username,
        });
      }
    }

    return summary;
  }

  return {
    getStoredSnapshotForUser,
    syncAllMembers,
    syncMember,
  };
}
