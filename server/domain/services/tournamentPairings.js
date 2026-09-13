import { hasPairingResults } from "../../../shared/tournamentPairingRules.js";
export { validateRoundPairings, hasPairingResults } from "../../../shared/tournamentPairingRules.js";
import { randomInt } from "node:crypto";

export function randomiseRoundSlots(slots, chooseIndex = randomInt) {
  const shuffled = [...slots];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = chooseIndex(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
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
