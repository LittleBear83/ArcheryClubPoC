import { deriveGoldenRecordsAchievements } from "./goldenRecordsAchievements.js";
import { completeIndoorScoreAwards, indoorSeasonYear, mapIndoorEvidence } from "./goldenRecordsIndoorMapping.js";
import { createHash } from "node:crypto";

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

function comparableSnapshot(value) {
  const sort = (entry) => Array.isArray(entry)
    ? entry.map(sort)
    : entry && typeof entry === "object"
      ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sort(entry[key])]))
      : entry;
  return JSON.stringify(sort({ ...value, fetchedAt: "" }));
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

    const sequenced = normalized252Achievements.filter((row) => row.awardKey === awardKey && row.sequenceNumber);
    const nextDates = sequenced.some((row) => row.sourceLabel.includes("/"))
      ? [1, 2, 3].map((level) => sequenced.find((row) => row.sequenceNumber === level)?.achievedDate ?? "")
      : normalizeGoldenRecordsSignOffDates(dates);
    const paddedDates = [...nextDates];

    while (paddedDates.length < 3) {
      paddedDates.push("");
    }

    const nextAwardComplete = nextDates.filter(Boolean).length >= 3;
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
  manualMatchTransaction,
  memberDirectoryGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
  indoorTableGateway,
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
    const existing = await goldenRecordsSyncGateway.findByUsername?.(user.username);
    if (existing && comparableSnapshot(existing) === comparableSnapshot(snapshot)) return false;
    const [syncedAtDate, syncedAtTime] = getUtcTimestampParts();

    await goldenRecordsSyncGateway.upsertSnapshot({
      fetchedAt: snapshot?.fetchedAt ?? "",
      snapshot,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
      username: user.username,
    });
    return true;
  }

  async function buildLiveSnapshotForUser(user, clubData, signal) {
    if (!goldenRecordsCurrentHandicapService?.isEnabled || !user) {
      return createDefaultSnapshot(false);
    }

    const snapshot = await goldenRecordsCurrentHandicapService.getSnapshotForMember({
      clubData,
      email: user.email ?? user.email_address ?? "",
      archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
      firstName: user.first_name,
      goldenRecordsId: user.golden_records_member_id ?? user.gr_id ?? "",
      surname: user.surname,
      username: user.username,
      signal,
    });
    signal?.throwIfAborted();

    if (
      String(user.golden_records_member_id ?? user.gr_id ?? "").trim() !== String(snapshot?.matchedMemberId ?? "").trim() &&
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
        throw error;
      }
    }

    return {
      ...snapshot,
      rawAchievements: snapshot.rawAchievements ?? snapshot.achievements ?? [],
      achievements: deriveGoldenRecordsAchievements(snapshot.achievements),
    };
  }

  async function syncOutdoorTableFromGoldenRecords({ disciplines, goldenRecordsSnapshot, outdoorGateway = outdoorTableGateway, updatedByUsername, user }) {
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
    const currentEntries = await outdoorGateway.listEntriesByYear(currentSeasonYear);
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

        if (nextEntry.handicap !== (handicapEntry?.handicap ?? nextEntry.handicap)) {
          nextEntry = {
            ...nextEntry,
            handicap: handicapEntry?.handicap ?? nextEntry.handicap,
          };
        }

        const achievementResult = applyGoldenRecordsAchievementsToEntry(nextEntry, achievementEntries);
        nextEntry = achievementResult.entry;

        const classificationResult = applyGoldenRecordsClassificationsToEntry(
          nextEntry,
          classificationEntries,
        );
        nextEntry = classificationResult.entry;
        const hasChanges = JSON.stringify(nextEntry) !== JSON.stringify(existingEntry);
        if (!hasChanges) {
          continue;
        }

        await outdoorGateway.updateEntry({
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

      await outdoorGateway.createEntry(createdWithClassifications.entry);
      createdCount += 1;
    }

    return {
      createdCount,
      syncedCount: createdCount + updatedCount,
      updatedCount,
    };
  }

  async function syncIndoorTableFromGoldenRecords({ disciplines, goldenRecordsSnapshot, indoorGateway = indoorTableGateway, user, createMissingOnly = false, existingRows }) {
    if (!indoorGateway) return { createdCount: 0, updatedCount: 0, syncedCount: 0 };
    const memberId = String(goldenRecordsSnapshot?.matchedMemberId ?? "").trim();
    if (!memberId) return { createdCount: 0, updatedCount: 0, syncedCount: 0 };
    const allowedBowTypes = new Set(disciplines.map((discipline) => {
      const name = String(discipline ?? "").replace(/ Bow$/, "");
      return mapGoldenRecordsBowClassToOutdoorBowType(name === "Bare" ? "Barebow" : name === "Long" ? "Longbow" : name);
    }).filter(Boolean));
    const evidence = mapIndoorEvidence(goldenRecordsSnapshot, memberId,
      mapGoldenRecordsBowClassToOutdoorBowType, allowedBowTypes);
    const handicaps = (goldenRecordsSnapshot?.handicaps ?? []).filter((entry) =>
      normalizeGoldenRecordsHandicapType(entry.type) === "indoor" &&
      Number.isInteger(entry.handicap) && entry.handicap >= 0 && entry.handicap <= 150 &&
      String(entry.memberId ?? "").trim() === memberId);
    const seasonYear = indoorSeasonYear(new Date().toISOString());
    const existing = new Map((existingRows ?? await indoorGateway.listEntriesByYear(seasonYear))
      .filter((row) => row.archerUsername?.toLowerCase() === user.username.toLowerCase())
      .map((row) => [row.bowType, row]));
    const [date, time] = getUtcTimestampParts();
    let createdCount = 0;
    let updatedCount = 0;
    const newestByBow = new Map();
    for (const handicap of handicaps) {
      const bowType = mapGoldenRecordsBowClassToOutdoorBowType(handicap.bowClass);
      if (!bowType || !allowedBowTypes.has(bowType)) continue;
      const previous = newestByBow.get(bowType);
      if (!previous || String(handicap.achieved ?? handicap.updated ?? "") >
        String(previous.achieved ?? previous.updated ?? "")) newestByBow.set(bowType, handicap);
    }
    const targetBowTypes = new Set([...existing.keys(), ...newestByBow.keys(),
      ...[...evidence.bySeason.values()].filter((group) => group.seasonYear === seasonYear).map((group) => group.bowType)]);
    for (const bowType of targetBowTypes) {
      const handicap = newestByBow.get(bowType);
      const group = evidence.bySeason.get(`${seasonYear}:${bowType}`);
      const current = existing.get(bowType);
      if (current) {
        const classifications = { ...current.classifications };
        const scores = { ...current.scores };
        let addedDate = false;
        for (const [key, value] of Object.entries(group?.classifications ?? {})) {
          if (!classifications[key]) { classifications[key] = value; addedDate = true; }
        }
        for (const [key, value] of Object.entries(group?.explicitScores ?? {})) {
          if (!scores[key]) { scores[key] = value; addedDate = true; }
        }
        for (const [key, value] of Object.entries(completeIndoorScoreAwards(scores, seasonYear))) {
          if (!scores[key]) { scores[key] = value; addedDate = true; }
        }
        // Manual profile edits are signed by another member; retain their handicap.
        const manualEditor = current.updatedByUsername &&
          ![user.username.toLowerCase(), "scheduler"].includes(current.updatedByUsername.toLowerCase());
        const canUpdateHandicap = !manualEditor || current.handicap == null;
        const nextHandicap = !createMissingOnly && canUpdateHandicap ? (handicap?.handicap ?? current.handicap) : current.handicap;
        if (current.handicap === nextHandicap && !addedDate) continue;
        await indoorGateway.updateEntry({ ...current, handicap: nextHandicap, classifications, scores,
          updatedAtDate: date, updatedAtTime: time,
          updatedByUsername: manualEditor ? current.updatedByUsername : null });
        updatedCount += 1;
      } else {
        const payload = { seasonYear, archerUsername: user.username,
          bowType, handicap: handicap?.handicap ?? null,
          classifications: { ...group?.classifications }, scores: { ...group?.scores },
          createdAtDate: date, createdAtTime: time, updatedAtDate: date, updatedAtTime: time,
          updatedByUsername: null };
        const created = createMissingOnly
          ? await indoorGateway.createEntryIfAbsent(payload)
          : await indoorGateway.createEntry(payload);
        if (!created) continue;
        existing.set(bowType, created);
        if (existingRows) existingRows.push({ archerUsername: user.username, bowType });
        createdCount += 1;
      }
    }
    // Current handicaps belong to the current row, but dated awards retain their
    // original indoor season. Fill historical rows without changing manual data.
    if (!createMissingOnly) {
      const historicalRowsByYear = new Map();
      for (const group of evidence.bySeason.values()) {
        if (group.seasonYear >= seasonYear) continue;
        if (!historicalRowsByYear.has(group.seasonYear)) {
          historicalRowsByYear.set(group.seasonYear, await indoorGateway.listEntriesByYear(group.seasonYear));
        }
        const historicalRows = historicalRowsByYear.get(group.seasonYear);
        const current = historicalRows.find((row) =>
          row.archerUsername?.toLowerCase() === user.username.toLowerCase() && row.bowType === group.bowType);
        if (current) {
          const classifications = { ...current.classifications };
          const scores = { ...current.scores };
          let changed = false;
          for (const [key, value] of Object.entries(group.classifications)) {
            if (!classifications[key]) { classifications[key] = value; changed = true; }
          }
          for (const [key, value] of Object.entries(group.explicitScores)) {
            if (!scores[key]) { scores[key] = value; changed = true; }
          }
          const completed = completeIndoorScoreAwards(scores, group.seasonYear);
          if (Object.keys(completed).some((key) => !scores[key])) changed = true;
          if (!changed) continue;
          await indoorGateway.updateEntry({ ...current, classifications, scores: completed,
            updatedAtDate: date, updatedAtTime: time });
          updatedCount += 1;
        } else {
          const created = await indoorGateway.createEntry({ seasonYear: group.seasonYear,
            archerUsername: user.username, bowType: group.bowType, handicap: null,
            classifications: { ...group.classifications }, scores: { ...group.scores },
            createdAtDate: date, createdAtTime: time, updatedAtDate: date, updatedAtTime: time,
            updatedByUsername: null });
          historicalRows.push(created);
          createdCount += 1;
        }
      }
    }
    return { createdCount, updatedCount, syncedCount: createdCount + updatedCount };
  }

  async function backfillIndoorTableFromStoredSnapshots() {
    if (!indoorTableGateway || !goldenRecordsSyncGateway?.listStoredSnapshots) return 0;
    const [stored, users, existingRows] = await Promise.all([
      goldenRecordsSyncGateway.listStoredSnapshots(),
      memberDirectoryGateway.listAllUsers(),
      indoorTableGateway.listEntriesByYear(indoorSeasonYear(new Date().toISOString())),
    ]);
    const usersByName = new Map(users.map((user) => [user.username.toLowerCase(), user]));
    let changedCount = 0;
    for (const { username, snapshot } of stored) {
      const user = usersByName.get(username.toLowerCase());
      if (!user || !snapshot?.enabled || snapshot.error || !snapshot.matchedMemberId ||
        ["ambiguous", "not-found", "disabled"].includes(snapshot.matchSource)) continue;
      if (!(snapshot.handicaps ?? []).some((entry) => normalizeGoldenRecordsHandicapType(entry.type) === "indoor") &&
        !(snapshot.achievements ?? []).length && !(snapshot.indoorClassifications ?? snapshot.classifications ?? []).length) continue;
      const disciplines = (await memberDirectoryGateway.findDisciplinesByUsername(user.username))
        .map((row) => row.discipline);
      const result = await syncIndoorTableFromGoldenRecords({
        disciplines, goldenRecordsSnapshot: snapshot, updatedByUsername: user.username,
        user, createMissingOnly: true, existingRows,
      });
      changedCount += result.syncedCount;
    }
    // Manual high awards can exist without a Golden Records snapshot.
    for (const row of await indoorTableGateway.listEntriesByYear(indoorSeasonYear(new Date().toISOString()))) {
      const completed = completeIndoorScoreAwards(row.scores, row.seasonYear);
      if (JSON.stringify(completed) === JSON.stringify(row.scores)) continue;
      const [date, time] = getUtcTimestampParts();
      await indoorTableGateway.updateEntry({ ...row, scores: completed,
        updatedAtDate: date, updatedAtTime: time });
      changedCount += 1;
    }
    return changedCount;
  }

  async function previewIndoorHistoricalBackfill() {
    const [stored, users, availableYears] = await Promise.all([
      goldenRecordsSyncGateway.listStoredSnapshots(), memberDirectoryGateway.listAllUsers(),
      indoorTableGateway.listAvailableYears(),
    ]);
    const usersByName = new Map(users.map((user) => [user.username.toLowerCase(), user]));
    const rowsByYear = new Map();
    const plan = { source: "stored-snapshots", inserts: [], updates: [], skipped: [], unmapped: [] };
    for (const { username, snapshot } of stored) {
      const user = usersByName.get(username.toLowerCase());
      if (!user || !snapshot?.enabled || snapshot.error || !snapshot.matchedMemberId ||
        ["ambiguous", "not-found", "disabled"].includes(snapshot.matchSource)) {
        plan.skipped.push({ username, reason: "No uniquely matched, complete stored snapshot" });
        continue;
      }
      const disciplines = (await memberDirectoryGateway.findDisciplinesByUsername(user.username))
        .map((row) => row.discipline);
      const allowedBowTypes = new Set(disciplines.map((discipline) => {
        const name = discipline.replace(/ Bow$/, "");
        return mapGoldenRecordsBowClassToOutdoorBowType(name === "Bare" ? "Barebow" : name === "Long" ? "Longbow" : name);
      }).filter(Boolean));
      const evidence = mapIndoorEvidence(snapshot, snapshot.matchedMemberId,
        mapGoldenRecordsBowClassToOutdoorBowType, allowedBowTypes);
      for (const row of evidence.unmapped) plan.unmapped.push({ username, ...row });
      if (evidence.bySeason.size === 0) {
        plan.skipped.push({ username, reason: "No mapped, dated indoor achievements" });
      }
      for (const group of evidence.bySeason.values()) {
        if (!rowsByYear.has(group.seasonYear)) {
          rowsByYear.set(group.seasonYear,
            availableYears.includes(group.seasonYear)
              ? await indoorTableGateway.listEntriesByYear(group.seasonYear) : []);
        }
        const existing = rowsByYear.get(group.seasonYear).find((row) =>
          row.archerUsername.toLowerCase() === username.toLowerCase() && row.bowType === group.bowType);
        const fields = {
          classifications: Object.fromEntries(Object.entries(group.classifications)
            .filter(([key]) => !existing?.classifications?.[key])),
          scores: Object.fromEntries(Object.entries(completeIndoorScoreAwards({
            ...group.explicitScores, ...existing?.scores }, group.seasonYear))
            .filter(([key]) => !existing?.scores?.[key])),
        };
        const record = { username, seasonYear: group.seasonYear, bowType: group.bowType, ...fields };
        if (!existing) plan.inserts.push(record);
        else if (Object.keys(fields.classifications).length || Object.keys(fields.scores).length) plan.updates.push(record);
        else plan.skipped.push({ username, seasonYear: group.seasonYear, bowType: group.bowType,
          reason: "All verified dates already present or manually recorded" });
      }
    }
    for (const seasonYear of availableYears) {
      if (!rowsByYear.has(seasonYear)) rowsByYear.set(seasonYear, await indoorTableGateway.listEntriesByYear(seasonYear));
      for (const row of rowsByYear.get(seasonYear)) {
        const completed = completeIndoorScoreAwards(row.scores, seasonYear);
        const missing = Object.fromEntries(Object.entries(completed).filter(([key]) => !row.scores?.[key]));
        if (!Object.keys(missing).length) continue;
        const proposed = plan.updates.find((entry) => entry.username.toLowerCase() === row.archerUsername.toLowerCase() &&
          entry.bowType === row.bowType && entry.seasonYear === seasonYear);
        if (proposed) proposed.scores = { ...missing, ...proposed.scores };
        else plan.updates.push({ username: row.archerUsername, seasonYear, bowType: row.bowType,
          classifications: {}, scores: missing });
      }
    }
    plan.planHash = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    return plan;
  }

  async function applyIndoorHistoricalBackfill(planHash) {
    if (!/^[a-f0-9]{64}$/.test(String(planHash ?? ""))) throw new Error("Preview the indoor backfill before applying it.");
    const plan = await previewIndoorHistoricalBackfill();
    if (plan.planHash !== planHash) throw new Error("Indoor backfill data changed since the preview. Preview again; no changes were made.");
    const [date, time] = getUtcTimestampParts();
    let inserted = 0;
    let updated = 0;
    for (const record of [...plan.inserts, ...plan.updates]) {
      const rows = await indoorTableGateway.listEntriesByYear(record.seasonYear);
      const current = rows.find((row) => row.archerUsername.toLowerCase() === record.username.toLowerCase() && row.bowType === record.bowType);
      if (current) {
        const classifications = { ...current.classifications };
        const scores = { ...current.scores };
        let changed = false;
        for (const [key, value] of Object.entries(record.classifications)) {
          if (!classifications[key]) { classifications[key] = value; changed = true; }
        }
        for (const [key, value] of Object.entries(record.scores)) {
          if (!scores[key]) { scores[key] = value; changed = true; }
        }
        if (!changed) continue;
        await indoorTableGateway.updateEntry({ ...current, classifications, scores,
          updatedAtDate: date, updatedAtTime: time });
        updated += 1;
      } else {
        const created = await indoorTableGateway.createEntryIfAbsent({
          seasonYear: record.seasonYear, archerUsername: record.username, bowType: record.bowType,
          handicap: null, classifications: record.classifications, scores: record.scores,
          createdAtDate: date, createdAtTime: time, updatedAtDate: date, updatedAtTime: time,
          updatedByUsername: null,
        });
        if (created) inserted += 1;
      }
    }
    return { inserted, updated };
  }

  async function syncDistanceSignOffsFromGoldenRecords({
    disciplines,
    goldenRecordsSnapshot,
    transactionClient,
    updatedByUsername,
    user,
    skipUnchanged = false,
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
    const existingSignOffs = skipUnchanged ? await memberDistanceSignOffRepository.listByUsername?.(user.username) ?? [] : [];

    for (const discipline of disciplines) {
      const signOffs = (signOffsByDiscipline.get(discipline) ?? [])
        .sort((left, right) => left.distanceYards - right.distanceYards)
        .reduce((next, signOff) => {
          if (!next.some((entry) => entry.distanceYards === signOff.distanceYards)) {
            next.push(signOff);
          }

          return next;
        }, []);

      const existing = existingSignOffs.filter((row) => row.discipline === discipline);
      if (skipUnchanged && existing.length === signOffs.length && existing.every((row) => signOffs.some((next) =>
        row.distanceYards === next.distanceYards && row.source === next.source &&
        row.signedOffByUsername === next.signedOffByUsername && row.signedOffAt === next.signedOffAtDate &&
        row.signedOffAtTime === next.signedOffAtTime))) {
        continue;
      }

      await memberDistanceSignOffRepository.replaceForDiscipline(
        user.username,
        discipline,
        signOffs,
        transactionClient,
      );
      replacedCount += signOffs.length;
    }

    return {
      replacedCount,
    };
  }

  async function syncMember(user, { updatedByUsername, clubData, signal } = {}) {
    if (!user) {
      throw new Error("A member is required before Golden Records can be synced.");
    }

    const safeUpdatedByUsername =
      String(updatedByUsername ?? "").trim() || String(user.username ?? "").trim();
    const disciplines = (await memberDirectoryGateway.findDisciplinesByUsername(user.username)).map(
      (discipline) => discipline.discipline,
    );
    const snapshot = await buildLiveSnapshotForUser(user, clubData, signal);
    signal?.throwIfAborted();

    // A transient upstream error must not replace the last good snapshot.
    if (!snapshot.error) await persistSnapshot(user, snapshot, safeUpdatedByUsername);

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
    const indoorSyncSummary = await syncIndoorTableFromGoldenRecords({
      disciplines, goldenRecordsSnapshot: snapshot, updatedByUsername: safeUpdatedByUsername, user,
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
        skipUnchanged: true,
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
      createdCount: outdoorSyncSummary.createdCount + indoorSyncSummary.createdCount,
      goldenRecords: snapshot,
      indoorChangeCount: indoorSyncSummary.syncedCount,
      outdoorChangeCount: outdoorSyncSummary.syncedCount,
      signOffError,
      signOffCount: signOffSummary.replacedCount,
      syncedCount: outdoorSyncSummary.syncedCount + indoorSyncSummary.syncedCount,
      updatedCount: outdoorSyncSummary.updatedCount + indoorSyncSummary.updatedCount,
    };
  }

  async function assignMemberMatch(user, { goldenRecordsId, updatedByUsername } = {}) {
    if (!user) throw new Error("A member is required before Golden Records can be assigned.");
    if (!goldenRecordsCurrentHandicapService?.isEnabled) {
      const error = new Error("Golden Records is not enabled for this environment.");
      error.status = 400;
      throw error;
    }

    const selectedId = String(goldenRecordsId ?? "").trim();
    const currentSnapshot = await getStoredSnapshotForUser(user);
    const selectedCandidate = currentSnapshot.candidateMatches?.find(
      (candidate) => String(candidate.memberId) === selectedId && !candidate.memberArchived,
    );
    if (!selectedCandidate) {
      const error = new Error("Select an active Golden Records candidate shown for this member. Refresh the match suggestions if needed.");
      error.status = 400;
      throw error;
    }

    // Fetch and validate the remote identity and every downstream page before
    // changing users.gr_id or replacing the stored profile snapshot.
    const remoteSnapshot = await goldenRecordsCurrentHandicapService.getSnapshotForMemberById(selectedId);
    if (String(remoteSnapshot.matchedMemberId) !== selectedId) {
      const error = new Error("Selected Golden Records member was not found or is archived.");
      error.status = 400;
      throw error;
    }
    const snapshot = {
      ...remoteSnapshot,
      rawAchievements: remoteSnapshot.rawAchievements ?? remoteSnapshot.achievements ?? [],
      achievements: deriveGoldenRecordsAchievements(remoteSnapshot.achievements),
    };
    const disciplines = (await memberDirectoryGateway.findDisciplinesByUsername(user.username))
      .map((row) => row.discipline);
    const safeUpdatedByUsername = String(updatedByUsername ?? "").trim() || user.username;
    const applyMatch = async ({ outdoorGateway = outdoorTableGateway, indoorGateway = indoorTableGateway, transactionClient = null } = {}) => {
      const outdoorSummary = await syncOutdoorTableFromGoldenRecords({
        disciplines, goldenRecordsSnapshot: snapshot, outdoorGateway,
        updatedByUsername: safeUpdatedByUsername, user,
      });
      const indoorSummary = await syncIndoorTableFromGoldenRecords({
        disciplines, goldenRecordsSnapshot: snapshot, indoorGateway,
        updatedByUsername: safeUpdatedByUsername, user,
      });
      const signOffSummary = await syncDistanceSignOffsFromGoldenRecords({
        disciplines, goldenRecordsSnapshot: snapshot, transactionClient,
        updatedByUsername: safeUpdatedByUsername, user,
      });
      const [syncedAtDate, syncedAtTime] = getUtcTimestampParts();
      await goldenRecordsSyncGateway.commitManualMatch({
        fetchedAt: snapshot.fetchedAt ?? "",
        memberId: selectedId,
        snapshot,
        syncedAtDate,
        syncedAtTime,
        updatedByUsername: safeUpdatedByUsername,
        username: user.username,
      }, transactionClient);
      return { outdoorSummary, indoorSummary, signOffSummary };
    };
    const { outdoorSummary, indoorSummary, signOffSummary } = manualMatchTransaction
      ? await manualMatchTransaction(applyMatch)
      : await applyMatch();
    user.gr_id = selectedId;

    return {
      createdCount: outdoorSummary.createdCount + indoorSummary.createdCount,
      goldenRecords: snapshot,
      indoorChangeCount: indoorSummary.syncedCount,
      outdoorChangeCount: outdoorSummary.syncedCount,
      signOffCount: signOffSummary.replacedCount,
      syncedCount: outdoorSummary.syncedCount + indoorSummary.syncedCount,
      updatedCount: outdoorSummary.updatedCount + indoorSummary.updatedCount,
    };
  }

  async function syncAllMembers({ updatedByUsername, onProgress, maxDurationMs } = {}) {
    const startedAtMs = Date.now();
    const overallSignal = maxDurationMs ? AbortSignal.timeout(maxDurationMs) : undefined;
    if (!goldenRecordsCurrentHandicapService?.isEnabled) {
      throw new Error("Golden Records API is not configured for full-club sync.");
    }
    const clubData = goldenRecordsCurrentHandicapService?.isEnabled && goldenRecordsCurrentHandicapService.fetchClubData
      ? await goldenRecordsCurrentHandicapService.fetchClubData({ signal: overallSignal }) : undefined;
    const users = await memberDirectoryGateway.listAllUsers();
    if (clubData) clubData.portalMembers = users;
    const summary = {
      matchedCount: 0,
      unmatchedCount: 0,
      achievementCount: 0,
      attemptedCount: 0,
      syncedCount: 0,
      indoorChangeCount: 0,
      outdoorChangeCount: 0,
      errorCount: 0,
      errors: [],
    };

    for (const user of users) {
      if (maxDurationMs && Date.now() - startedAtMs >= maxDurationMs) {
        throw new Error("Golden Records sync exceeded its request time budget; retry to continue.");
      }
      summary.attemptedCount += 1;

      try {
        const memberSignal = overallSignal
          ? AbortSignal.any([overallSignal, AbortSignal.timeout(120_000)])
          : AbortSignal.timeout(120_000);
        const result = await syncMember(user, { updatedByUsername, clubData, signal: memberSignal });
        memberSignal.throwIfAborted();
        if (result.goldenRecords.error) throw new Error(result.goldenRecords.error);
        if (result.goldenRecords.matchedMemberId) {
          summary.matchedCount += 1;
          summary.syncedCount += 1;
          summary.indoorChangeCount += result.indoorChangeCount ?? 0;
          summary.outdoorChangeCount += result.outdoorChangeCount ?? 0;
          summary.achievementCount += result.goldenRecords.achievements.length;
        } else {
          summary.unmatchedCount += 1;
        }
        if (result.signOffError) {
          summary.errorCount += 1;
          summary.errors.push({ username: user.username, message: result.signOffError });
        }
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
      await onProgress?.({
        attemptedCount: summary.attemptedCount,
        matchedCount: summary.matchedCount,
        unmatchedCount: summary.unmatchedCount,
        achievementCount: summary.achievementCount,
        errorCount: summary.errorCount,
      });
      overallSignal?.throwIfAborted();
      if (maxDurationMs && Date.now() - startedAtMs >= maxDurationMs) {
        throw new Error("Golden Records sync exceeded its request time budget; retry to continue.");
      }
    }

    logger.info?.("Golden Records club sync complete", summary);
    return summary;
  }

  return {
    assignMemberMatch,
    getStoredSnapshotForUser,
    backfillIndoorTableFromStoredSnapshots,
    previewIndoorHistoricalBackfill,
    applyIndoorHistoricalBackfill,
    syncAllMembers,
    syncMember,
  };
}
