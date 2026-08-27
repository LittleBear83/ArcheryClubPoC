import { isCaptainsSwordTournament } from "./tournamentHandicapService.js";

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

function normalizeDiscipline(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "indoor" || normalized === "outdoor" || normalized === "both") {
    return normalized;
  }

  return normalized;
}

function selectRelevantAchievements({
  achievements = [],
  bowCode = null,
  qualifyingDiscipline = "indoor",
}) {
  const preferredBowClass = mapBowCodeToGoldenRecordsBowClass(bowCode);
  const normalizedDiscipline = normalizeDiscipline(qualifyingDiscipline);

  return achievements.filter((achievement) => {
    const achievementDiscipline = normalizeDiscipline(
      achievement?.type ?? achievement?.discipline,
    );
    const roundName = String(achievement?.round ?? "").trim();
    const achievementBowClass = String(achievement?.bowClass ?? "")
      .trim()
      .toLowerCase();

    if (!roundName || achievementDiscipline !== normalizedDiscipline) {
      return false;
    }

    if (preferredBowClass && achievementBowClass && achievementBowClass !== preferredBowClass) {
      return false;
    }

    return true;
  });
}

function dedupeQualifyingAchievements(achievements = []) {
  const seen = new Set();

  return achievements.filter((achievement) => {
    const dedupeKey = [
      String(achievement?.achieved ?? "").trim().slice(0, 10),
      String(achievement?.round ?? "").trim().toLowerCase(),
      String(achievement?.bowClass ?? "").trim().toLowerCase(),
    ].join("|");

    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

function buildTournamentEligibilitySnapshot({
  bowCode = null,
  goldenRecordsSnapshot = null,
  qualifyingDiscipline = "indoor",
  username = null,
}) {
  const snapshotEnabled = goldenRecordsSnapshot?.enabled !== false;
  const filteredAchievements = dedupeQualifyingAchievements(
    selectRelevantAchievements({
      achievements: goldenRecordsSnapshot?.achievements ?? [],
      bowCode,
      qualifyingDiscipline,
    }),
  );
  const preferredBowClass = mapBowCodeToGoldenRecordsBowClass(bowCode);
  const hasCurrentHandicap = (goldenRecordsSnapshot?.handicaps ?? []).some((entry) => {
    const matchesDiscipline =
      normalizeDiscipline(entry?.type) === normalizeDiscipline(qualifyingDiscipline);
    const matchesBowClass =
      !preferredBowClass ||
      String(entry?.bowClass ?? "").trim().toLowerCase() === preferredBowClass;

    return matchesDiscipline && matchesBowClass && Number.isInteger(entry?.handicap);
  });

  return {
    bowCode: bowCode ?? null,
    dataStatus: snapshotEnabled ? "available" : "unavailable",
    hasCurrentHandicap,
    qualifyingDiscipline: normalizeDiscipline(qualifyingDiscipline),
    qualifyingRoundCount: filteredAchievements.length,
    qualifyingRounds: filteredAchievements.map((achievement) => ({
      achieved: achievement.achieved ?? "",
      round: achievement.round ?? "",
    })),
    username,
  };
}

function formatEligibilityReason(reasons = []) {
  return reasons.length > 0 ? reasons.join(" ") : null;
}

function evaluateTournamentRegistrationEligibility({
  eligibilityRules = null,
  snapshot = null,
  tournament = null,
}) {
  if (!isCaptainsSwordTournament(tournament) || !eligibilityRules) {
    return {
      isEligible: true,
      reason: null,
    };
  }

  if (!snapshot || snapshot.dataStatus !== "available") {
    return {
      isEligible: false,
      reason: "Eligibility could not be checked because Golden Records is unavailable.",
    };
  }

  const reasons = [];
  const handicapRoundsRequired = Math.max(
    Number(eligibilityRules.handicapQualificationRoundsRequired ?? 0),
    0,
  );

  if (!snapshot.hasCurrentHandicap) {
    reasons.push(
      `A current ${snapshot.qualifyingDiscipline} handicap is required before registering.`,
    );
  }

  if (snapshot.qualifyingRoundCount < handicapRoundsRequired) {
    const missingRounds = handicapRoundsRequired - snapshot.qualifyingRoundCount;
    reasons.push(
      `Needs ${missingRounds} more ${snapshot.qualifyingDiscipline} qualifying round${missingRounds === 1 ? "" : "s"} before registering.`,
    );
  }

  return {
    isEligible: reasons.length === 0,
    reason: formatEligibilityReason(reasons),
  };
}

function evaluateTournamentRoundEligibility({
  eligibilityRules = null,
  roundNumber = 1,
  snapshot = null,
  tournament = null,
}) {
  if (!isCaptainsSwordTournament(tournament) || !eligibilityRules) {
    return {
      isEligible: true,
      reason: null,
    };
  }

  if (!snapshot || snapshot.dataStatus !== "available") {
    return {
      isEligible: false,
      reason: "Eligibility could not be checked because Golden Records is unavailable.",
    };
  }

  const reasons = [];
  const roundsPerKnockoutRound = Math.max(
    Number(eligibilityRules.qualifyingRoundsRequiredPerKnockoutRound ?? 0),
    0,
  );
  const requiredQualifyingRounds = Math.max(roundNumber * roundsPerKnockoutRound, 0);

  if (!snapshot.hasCurrentHandicap) {
    reasons.push(
      `A current ${snapshot.qualifyingDiscipline} handicap is required before playing.`,
    );
  }

  if (snapshot.qualifyingRoundCount < requiredQualifyingRounds) {
    const missingRounds = requiredQualifyingRounds - snapshot.qualifyingRoundCount;
    reasons.push(
      `Needs ${missingRounds} more ${snapshot.qualifyingDiscipline} qualifying round${missingRounds === 1 ? "" : "s"} before round ${roundNumber}.`,
    );
  }

  return {
    isEligible: reasons.length === 0,
    reason: formatEligibilityReason(reasons),
  };
}

export {
  buildTournamentEligibilitySnapshot,
  evaluateTournamentRegistrationEligibility,
  evaluateTournamentRoundEligibility,
};
