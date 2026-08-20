const CAPTAINS_SWORD_TEMPLATE_KEY = "captains-sword";
const CAPTAINS_SWORD_ALLOWANCE_PERCENT = 95;
const CAPTAINS_SWORD_TABLE_FAMILY_KEY = "indoor-rounds";
const CAPTAINS_SWORD_ROUND_NAME = "Portsmouth Full size";

function normalizeTemplateKey(tournament) {
  return String(tournament?.template_key ?? tournament?.templateKey ?? "")
    .trim()
    .toLowerCase();
}

function normalizeDisciplineVariant(bowClass) {
  return String(bowClass ?? "").trim().toLowerCase() === "compound"
    ? "Compound"
    : "Non-Compound";
}

function normalizeBowCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function mapBowCodeToGoldenRecordsBowClass(bowCode) {
  switch (normalizeBowCode(bowCode)) {
    case "BB":
      return "barebow";
    case "CB":
      return "compound";
    case "LB":
      return "longbow";
    case "RC":
      return "recurve";
    default:
      return "";
  }
}

function toSortableTimestamp(entry) {
  const updated = String(entry?.updated ?? "").trim();
  const achieved = String(entry?.achieved ?? "").trim();
  const value = updated || achieved;
  const parsed = value ? Date.parse(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function selectIndoorHandicapEntry(handicaps = [], preferredBowCode = null) {
  const indoorEntries = handicaps.filter(
    (entry) =>
      String(entry?.type ?? "").trim().toLowerCase() === "indoor" &&
      Number.isInteger(entry?.handicap),
  );

  if (indoorEntries.length === 0) {
    return null;
  }

  const preferredBowClass = mapBowCodeToGoldenRecordsBowClass(preferredBowCode);
  const filteredIndoorEntries = preferredBowClass
    ? indoorEntries.filter(
        (entry) => String(entry?.bowClass ?? "").trim().toLowerCase() === preferredBowClass,
      )
    : indoorEntries;

  const eligibleEntries =
    filteredIndoorEntries.length > 0 ? filteredIndoorEntries : indoorEntries;

  return [...eligibleEntries].sort((left, right) => {
    const byUpdated = toSortableTimestamp(right) - toSortableTimestamp(left);

    if (byUpdated !== 0) {
      return byUpdated;
    }

    const leftVariant = normalizeDisciplineVariant(left?.bowClass);
    const rightVariant = normalizeDisciplineVariant(right?.bowClass);

    return rightVariant.localeCompare(leftVariant);
  })[0];
}

function flattenHandicapTables(handicapTablesSnapshot) {
  return (handicapTablesSnapshot?.families ?? []).flatMap((family) =>
    (family?.tables ?? []).map((table) => ({
      familyKey: family.familyKey,
      tableKey: table.tableKey,
      title: table.title,
      rows: table.rows ?? [],
    })),
  );
}

function findCaptainsSwordRoundTable(handicapTablesSnapshot, bowClass) {
  const targetTitle = `${normalizeDisciplineVariant(bowClass)} ${CAPTAINS_SWORD_ROUND_NAME}`;

  return flattenHandicapTables(handicapTablesSnapshot).find(
    (table) =>
      table.familyKey === CAPTAINS_SWORD_TABLE_FAMILY_KEY && table.title === targetTitle,
  );
}

function calculateAllowancePoints({
  allowancePercent = CAPTAINS_SWORD_ALLOWANCE_PERCENT,
  maxReferenceScore,
  referenceScore,
}) {
  if (
    !Number.isInteger(referenceScore) ||
    !Number.isInteger(maxReferenceScore) ||
    maxReferenceScore < referenceScore
  ) {
    return null;
  }

  return Math.round((maxReferenceScore - referenceScore) * (allowancePercent / 100));
}

function buildParticipantHandicapSnapshot({
  allowancePercent = CAPTAINS_SWORD_ALLOWANCE_PERCENT,
  handicapTablesSnapshot,
  handicaps = [],
  preferredBowCode = null,
}) {
  const handicapEntry = selectIndoorHandicapEntry(handicaps, preferredBowCode);

  if (!handicapEntry) {
    return null;
  }

  const roundTable = findCaptainsSwordRoundTable(
    handicapTablesSnapshot,
    handicapEntry.bowClass,
  );

  if (!roundTable) {
    return null;
  }

  const matchingRow = roundTable.rows.find(
    (row) => row.handicapValue === handicapEntry.handicap,
  );

  if (!matchingRow) {
    return null;
  }

  const maxReferenceScore = roundTable.rows.reduce(
    (currentMax, row) =>
      Number.isInteger(row.referenceScore)
        ? Math.max(currentMax, row.referenceScore)
        : currentMax,
    Number.NEGATIVE_INFINITY,
  );
  const allowancePoints = calculateAllowancePoints({
    allowancePercent,
    maxReferenceScore,
    referenceScore: matchingRow.referenceScore,
  });

  return {
    allowancePercent,
    bowClass: handicapEntry.bowClass,
    discipline: handicapEntry.discipline,
    handicapValue: handicapEntry.handicap,
    handicapType: handicapEntry.type,
    referenceScore: matchingRow.referenceScore,
    tableKey: roundTable.tableKey,
    tableTitle: roundTable.title,
    allowancePoints,
  };
}

function buildMatchHandicapSnapshot({
  allowancePercent = CAPTAINS_SWORD_ALLOWANCE_PERCENT,
  leftParticipantUsername = null,
  participantSnapshotsByUsername = new Map(),
  rightParticipantUsername = null,
}) {
  const leftSnapshot = leftParticipantUsername
    ? (participantSnapshotsByUsername.get(leftParticipantUsername) ?? null)
    : null;
  const rightSnapshot = rightParticipantUsername
    ? (participantSnapshotsByUsername.get(rightParticipantUsername) ?? null)
    : null;

  return {
    allowancePercent,
    leftAllowancePoints: leftSnapshot?.allowancePoints ?? null,
    leftBowClass: leftSnapshot?.bowClass ?? null,
    leftDiscipline: leftSnapshot?.discipline ?? null,
    leftHandicapType: leftSnapshot?.handicapType ?? null,
    leftHandicapValue: leftSnapshot?.handicapValue ?? null,
    leftReferenceScore: leftSnapshot?.referenceScore ?? null,
    leftTableKey: leftSnapshot?.tableKey ?? null,
    leftTableTitle: leftSnapshot?.tableTitle ?? null,
    rightAllowancePoints: rightSnapshot?.allowancePoints ?? null,
    rightBowClass: rightSnapshot?.bowClass ?? null,
    rightDiscipline: rightSnapshot?.discipline ?? null,
    rightHandicapType: rightSnapshot?.handicapType ?? null,
    rightHandicapValue: rightSnapshot?.handicapValue ?? null,
    rightReferenceScore: rightSnapshot?.referenceScore ?? null,
    rightTableKey: rightSnapshot?.tableKey ?? null,
    rightTableTitle: rightSnapshot?.tableTitle ?? null,
  };
}

function calculateAdjustedMatchScores({
  leftAllowancePoints = null,
  leftScore = null,
  rightAllowancePoints = null,
  rightScore = null,
}) {
  return {
    leftAdjustedScore:
      Number.isInteger(leftScore) && Number.isInteger(leftAllowancePoints)
        ? leftScore + leftAllowancePoints
        : null,
    rightAdjustedScore:
      Number.isInteger(rightScore) && Number.isInteger(rightAllowancePoints)
        ? rightScore + rightAllowancePoints
        : null,
  };
}

function isCaptainsSwordTournament(tournament) {
  return normalizeTemplateKey(tournament) === CAPTAINS_SWORD_TEMPLATE_KEY;
}

export {
  buildMatchHandicapSnapshot,
  buildParticipantHandicapSnapshot,
  calculateAdjustedMatchScores,
  CAPTAINS_SWORD_ALLOWANCE_PERCENT,
  CAPTAINS_SWORD_TEMPLATE_KEY,
  isCaptainsSwordTournament,
};
