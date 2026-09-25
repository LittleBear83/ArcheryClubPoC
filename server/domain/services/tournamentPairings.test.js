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

test("five archers in eight slots distribute all three byes and persist a valid draw", async () => {
  // The identity shuffle previously paired the final two null slots together.
  for (const chooseIndex of [(limit) => limit - 1, () => 0, (limit) => Math.floor(limit / 2)]) {
    const field = entrants.slice(0, 5);
    let plan = { draw: { randomiseEveryRound: true, roundPairings: {} } };
    let writes = 0;
    const round = buildTournamentBracket(field, new Map()).rounds[0];
    await ensureRandomisedRoundDraw({ plan, round, previousRoundsReady: true, registrationClosed: true, chooseIndex, persist: async (number, pairings) => {
      writes += 1;
      plan = parseTournamentRoundPlan(buildTournamentRoundPlanJson({ draw: { ...plan.draw, roundPairings: { [number]: pairings } } }));
      return plan;
    } });
    const pairings = plan.draw.roundPairings[1];
    const slots = pairings.flat();
    assert.deepEqual(slots.filter((slot) => slot !== null).sort(), ["a", "b", "c", "d", "e"]);
    assert.equal(new Set(slots.filter((slot) => slot !== null)).size, 5);
    assert.equal(slots.filter((slot) => slot === null).length, 3);
    assert.equal(validateRoundPairings(pairings, names(round).flat()), true);
    for (const [left, right] of pairings) {
      assert.ok(left !== null || right !== null, "avoidable null/null match");
      assert.notEqual(left, right, "self pairing");
    }
    const bracket = buildTournamentBracket(field, new Map(), new Map(), { roundPairings: plan.draw.roundPairings });
    const reloaded = bracket.rounds[0];
    assert.deepEqual(names(reloaded), pairings);
    const byes = reloaded.matches.filter((match) => match.status === "bye");
    assert.equal(byes.length, 3);
    for (const match of byes) assert.equal(match.winner.username, (match.leftParticipant ?? match.rightParticipant).username);
    assert.equal(reloaded.matches.filter((match) => match.leftParticipant && match.rightParticipant).length, 1);
    assert.equal(await ensureRandomisedRoundDraw({ plan, round: reloaded, previousRoundsReady: true, registrationClosed: true, persist: () => { throw new Error("Persisted draw rewritten"); }, chooseIndex: () => { throw new Error("Persisted draw reshuffled"); } }), null);
    assert.equal(writes, 1);
    const scores = new Map([[1, new Map(field.map((archer, index) => [archer.username, 100 - index]))]]);
    const progressed = buildTournamentBracket(field, scores, new Map(), { roundPairings: plan.draw.roundPairings });
    const winners = progressed.rounds[0].matches.map((match) => match.winner.username).sort();
    assert.deepEqual(names(progressed.rounds[1]).flat().sort(), winners);
  }
});

test("sparse slots retain unavoidable empty matches without losing archers", () => {
  const slots = randomiseRoundSlots(["a", "b", null, null, null, null, null, null], (limit) => limit - 1);
  const pairings = Array.from({ length: 4 }, (_, index) => slots.slice(index * 2, index * 2 + 2));
  assert.deepEqual(slots.filter((slot) => slot !== null).sort(), ["a", "b"]);
  assert.equal(pairings.filter(([left, right]) => left === null && right === null).length, 2);
  assert.equal(pairings.filter(([left, right]) => (left === null) !== (right === null)).length, 2);
});
