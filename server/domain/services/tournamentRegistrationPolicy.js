import { parseTournamentRoundPlan } from "./tournamentRoundPlan.js";

// Only unplayed brackets can be rebuilt. Check persisted competition data,
// rather than treating registration dates as evidence that a shoot is safe.
export function tournamentRegistrationPolicy({ tournament, scores = [], matches = [], isLocalPiNode = false, today = new Date().toISOString().slice(0, 10) }) {
  if (isLocalPiNode) return { allowed: false, reason: "Add archers on the Cloud portal. Tournament administration on the Pi is read-only.", requiresRedraw: false };
  const hasResults = scores.length > 0 || matches.some((match) =>
    ["left_score", "right_score", "submitted_by_username", "submitted_at_date", "confirmed_by_username", "confirmed_at_date", "disputed_by_username", "disputed_at_date", "dispute_reason"].some((key) => match[key] != null && match[key] !== "")
    || !["scheduled", "pending", "bye", "empty"].includes(match.status ?? "scheduled")
    || (match.winner_username && match.status !== "bye"));
  if (hasResults || ["completed", "finalised", "archived"].includes(tournament.status)) {
    return { allowed: false, reason: "Archers cannot be added once scores or match results exist, or the tournament is complete. Existing results will be preserved.", requiresRedraw: false };
  }
  const plan = parseTournamentRoundPlan(tournament.round_schedule_json);
  const requiresRedraw = Boolean(plan.draw?.generatedAt || plan.draw?.orderUsernames?.length
    || Object.keys(plan.draw?.roundPairings ?? {}).length
    || (today > tournament.registration_end_date && matches.some((match) => match.left_member_username || match.right_member_username)));
  return { allowed: true, reason: null, requiresRedraw };
}
