import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTournamentBracket } from "./tournamentEngine.js";
import { buildTournamentRoundPlanJson, parseTournamentRoundPlan } from "./tournamentRoundPlan.js";
import { ensureRandomisedRoundDraw, randomiseRoundSlots, validateRoundPairings } from "./tournamentPairings.js";

const entrants = ["a", "b", "c", "d", "e", "f", "g", "h"].map((username) => ({ username, fullName: username }));
const names = (round) => round.matches.map((match) => [match.leftParticipant?.username ?? null, match.rightParticipant?.username ?? null]);

test("deterministic Fisher-Yates preserves every archer and bye", () => {
  assert.deepEqual(randomiseRoundSlots(["a", "b", "c", null], () => 0), ["b", "c", null, "a"]);
});

test("pairing validation rejects duplicates, self, missing, extra and malformed archers", () => {
  const eligible = ["a", "b", "c", null];
  assert.equal(validateRoundPairings([["a", "c"], ["b", null]], eligible), true);
  for (const invalid of [[["a", "a"], ["b", null]], [["a", "b"]], [["a", "b"], ["x", null]], [["a", "b"], [null, null]], [["a", "b"], ["c", "d"]], [["a", "b", "c"], [null]], null]) assert.equal(validateRoundPairings(invalid, eligible), false);
});

test("each new round gets one persisted draw; reload and manual override remain stable", async () => {
  let plan = parseTournamentRoundPlan(buildTournamentRoundPlanJson({ draw: { randomiseEveryRound: true } }));
  let calls = 0;
  const persist = async (number, pairings) => {
    calls += 1;
    plan = parseTournamentRoundPlan(buildTournamentRoundPlanJson({ ...plan, draw: { ...plan.draw, roundPairings: { ...plan.draw.roundPairings, [number]: pairings } } }));
    return plan;
  };
  let bracket = buildTournamentBracket(entrants, new Map(), new Map(), { roundPairings: plan.draw.roundPairings });
  await ensureRandomisedRoundDraw({ plan, round: bracket.rounds[0], previousRoundsReady: true, registrationClosed: true, persist, chooseIndex: () => 0 });
  assert.equal(calls, 1);
  bracket = buildTournamentBracket(entrants, new Map(), new Map(), { roundPairings: plan.draw.roundPairings });
  const first = names(bracket.rounds[0]);
  assert.notDeepEqual(first, [["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
  assert.equal(await ensureRandomisedRoundDraw({ plan, round: bracket.rounds[0], previousRoundsReady: true, registrationClosed: true, persist, chooseIndex: () => { throw new Error("Reload reshuffled"); } }), null);
  const manual = [["a", "h"], ["b", "g"], ["c", "f"], ["d", "e"]];
  await persist(1, manual);
  const scores = new Map([[1, new Map(entrants.map((entrant, index) => [entrant.username, 100 - index]))]]);
  bracket = buildTournamentBracket(entrants, scores, new Map(), { roundPairings: plan.draw.roundPairings });
  assert.deepEqual(names(bracket.rounds[0]), manual);
  const defaultSecond = names(bracket.rounds[1]);
  await ensureRandomisedRoundDraw({ plan, round: bracket.rounds[1], previousRoundsReady: true, registrationClosed: true, persist, chooseIndex: () => 0 });
  bracket = buildTournamentBracket(entrants, scores, new Map(), { roundPairings: plan.draw.roundPairings });
  assert.notDeepEqual(names(bracket.rounds[1]), defaultSecond);
  assert.deepEqual(names(bracket.rounds[0]), manual);
  assert.deepEqual(names(bracket.rounds[1]), plan.draw.roundPairings[2]);
  const reloaded = buildTournamentBracket(entrants, scores, new Map(), { roundPairings: JSON.parse(JSON.stringify(plan.draw.roundPairings)) });
  assert.deepEqual(names(reloaded.rounds[1]), names(bracket.rounds[1]));
});

test("fixed draw and unfinished/result-bearing rounds do not randomise", async () => {
  const round = buildTournamentBracket(entrants, new Map()).rounds[0];
  const persist = () => { throw new Error("Unexpected draw"); };
  const plan = { draw: { randomiseEveryRound: true, roundPairings: {} } };
  for (const args of [{ plan: { draw: null } }, { previousRoundsReady: false }, { registrationClosed: false }, { round: { ...round, matches: [{ ...round.matches[0], leftScore: 1 }] } }]) {
    assert.equal(await ensureRandomisedRoundDraw({ plan, round, previousRoundsReady: true, registrationClosed: true, persist, ...args }), null);
  }
  assert.deepEqual(names(round), [["a", "b"], ["c", "d"], ["e", "f"], ["g", "h"]]);
});

test("odd fields preserve bye slots and no archer appears twice", () => {
  const pairings = [["c", "a"], ["b", null]];
  const round = buildTournamentBracket(entrants.slice(0, 3), new Map(), new Map(), { roundPairings: { 1: pairings } }).rounds[0];
  assert.deepEqual(names(round), pairings);
  assert.equal(round.matches[1].status, "bye");
  assert.equal(round.matches[1].winner.username, "b");
});
