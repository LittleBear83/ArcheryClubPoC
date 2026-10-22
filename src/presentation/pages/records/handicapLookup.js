import { applyHandicapAllowancePercent,
  MAX_HANDICAP_ALLOWANCE_PERCENT, MIN_HANDICAP_ALLOWANCE_PERCENT } from "../../../../shared/handicapAllowance.js";

export function findHandicapReferenceScores(input, selectedTable, comparisonTables) {
  const value = String(input ?? "").trim();
  if (!value) return { status: "empty" };
  const handicap = Number(value);
  if (!Number.isInteger(handicap) || handicap < 0) return { status: "invalid" };
  if (!selectedTable.rows.some((row) => row.handicapValue === handicap)) return { status: "missing" };
  return { status: "found", handicap,
    scores: comparisonTables.map((table) => ({ tableKey: table.tableKey, title: table.title,
      score: table.rows.find((row) => row.handicapValue === handicap)?.referenceScore ?? null })) };
}

export function calculateHandicapLookupScores(lookup, scoreInput, percentInput) {
  if (lookup.status !== "found" || String(scoreInput).trim() === "") return { status: "empty" };

  const archerScore = Number(scoreInput);
  if (!Number.isInteger(archerScore) || archerScore < 0) return { status: "invalid-score" };

  const percentText = String(percentInput).trim();
  const allowancePercent = Number(percentText);
  if (percentText === "" || !Number.isFinite(allowancePercent) ||
      allowancePercent < MIN_HANDICAP_ALLOWANCE_PERCENT ||
      allowancePercent > MAX_HANDICAP_ALLOWANCE_PERCENT) {
    return { status: "invalid-percent" };
  }

  return { status: "found", allowancePercent, archerScore,
    scores: lookup.scores.map((entry) => {
      const adjustedAllowance = applyHandicapAllowancePercent(entry.score, allowancePercent);
      return { tableKey: entry.tableKey, adjustedAllowance,
        adjustedScore: adjustedAllowance === null ? null : archerScore + adjustedAllowance };
    }) };
}
