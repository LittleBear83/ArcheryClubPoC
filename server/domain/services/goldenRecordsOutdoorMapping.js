export function mapGoldenRecordsBowClassToOutdoorBowType(bowClass) {
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

export const GOLDEN_RECORDS_OUTDOOR_ACHIEVEMENT_MAPPINGS = [
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

const GOLDEN_RECORDS_252_SIGN_OFF_FIELD_BY_AWARD_KEY = new Map([
  ["award25220", "award25220SignOffDates"],
  ["award25230", "award25230SignOffDates"],
  ["award25240", "award25240SignOffDates"],
  ["award25250", "award25250SignOffDates"],
  ["award25260", "award25260SignOffDates"],
  ["award25280", "award25280SignOffDates"],
  ["award252100", "award252100SignOffDates"],
]);

export const GOLDEN_RECORDS_CLASSIFICATION_TO_FIELD = new Map([
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

export function normalizeGoldenRecordsDate(value) {
  return String(value ?? "").trim().slice(0, 10);
}

export function getGoldenRecords252AwardKey({ achievementName, roundName }) {
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

export function buildGoldenRecordsManagedOutdoorFieldReset(entry) {
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

export function buildEmptyOutdoorEntryPayload({
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

export function applyGoldenRecordsAchievementsToEntry(entry, achievements = [], is252Complete = (dates) => dates.filter(Boolean).length >= 3) {
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

    const nextAwardComplete = is252Complete(nextDates);
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

export function applyGoldenRecordsClassificationsToEntry(entry, classifications = []) {
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
