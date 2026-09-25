export function validateRoundPairings(pairings, eligibleSlots) {
  if (!Array.isArray(pairings) || pairings.length * 2 !== eligibleSlots.length || pairings.some((pair) => !Array.isArray(pair) || pair.length !== 2 || pair.some((value) => value !== null && (typeof value !== "string" || !value)))) return false;
  const assigned = pairings.flat().filter((value) => value !== null);
  const eligible = eligibleSlots.filter((value) => value !== null);
  return assigned.length === eligible.length && new Set(assigned).size === assigned.length && assigned.every((value) => eligible.includes(value));
}

export function hasPairingResults(matches) {
  return matches.some((match) => match.leftScore != null || match.rightScore != null || match.score?.competitorA != null || match.score?.competitorB != null || match.submittedByUsername || match.confirmedByUsername || match.disputedByUsername || match.workflow?.submittedByUsername || match.workflow?.confirmedByUsername || match.workflow?.disputedByUsername || ["completed", "finalised", "progressed", "walkover", "disqualified", "retired_both", "awaiting_opponent_confirmation", "disputed"].includes(match.status));
}
