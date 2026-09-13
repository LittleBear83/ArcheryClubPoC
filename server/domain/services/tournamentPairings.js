import { hasPairingResults } from "../../../shared/tournamentPairingRules.js";
export { validateRoundPairings, hasPairingResults } from "../../../shared/tournamentPairingRules.js";
import { randomInt } from "node:crypto";

export function randomiseRoundSlots(slots, chooseIndex = randomInt) {
  const shuffled = [...slots];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = chooseIndex(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  // Give an empty match an archer from a full match whenever both exist.
  // This preserves all slots, including unavoidable empty matches in sparse fields.
  const fullMatches = [];
  const emptyMatches = [];
  for (let index = 0; index < shuffled.length; index += 2) {
    if (shuffled[index] !== null && shuffled[index + 1] !== null) fullMatches.push(index);
    else if (shuffled[index] === null && shuffled[index + 1] === null) emptyMatches.push(index);
  }
  for (const empty of emptyMatches) {
    const full = fullMatches.pop();
    if (full === undefined) break;
    [shuffled[empty], shuffled[full]] = [shuffled[full], shuffled[empty]];
  }
  return shuffled;
}

export async function ensureRandomisedRoundDraw({ plan, round, previousRoundsReady, registrationClosed, persist, chooseIndex }) {
  if (!plan.draw?.randomiseEveryRound || !round || !previousRoundsReady || !registrationClosed || plan.draw.roundPairings?.[round.roundNumber] || hasPairingResults(round.matches)) return null;
  const slots = round.matches.flatMap((match) => [match.leftParticipant?.username ?? null, match.rightParticipant?.username ?? null]);
  const shuffled = randomiseRoundSlots(slots, chooseIndex);
  const pairings = Array.from({ length: shuffled.length / 2 }, (_, index) => shuffled.slice(index * 2, index * 2 + 2));
  return persist(round.roundNumber, pairings);
}
