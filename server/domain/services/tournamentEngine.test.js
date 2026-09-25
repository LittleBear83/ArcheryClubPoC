import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTournamentBracket,
  isTournamentMatchResolvedStatus,
} from "./tournamentEngine.js";

test("highest loser progression backfills a vacant next-round slot", () => {
  const registrations = [
    { username: "alice", fullName: "Alice Archer" },
    { username: "beth", fullName: "Beth Bowman" },
    { username: "cara", fullName: "Cara Cross" },
    { username: "dina", fullName: "Dina Draw" },
  ];
  const scoresByRound = new Map();
  scoresByRound.set(
    1,
    new Map([
      ["alice", 540],
      ["beth", 535],
      ["cara", 522],
      ["dina", 510],
    ]),
  );
  const persistedMatchesByKey = new Map([
    [
      "1:2",
      {
        leftMemberUsername: "cara",
        rightMemberUsername: "dina",
        leftScore: 522,
        rightScore: 510,
        winnerUsername: null,
        status: "retired_both",
      },
    ],
  ]);

  const bracket = buildTournamentBracket(
    registrations,
    scoresByRound,
    persistedMatchesByKey,
    { supportsHighestLoserProgression: true },
  );

  assert.equal(bracket.rounds[0].matches[1].status, "retired_both");
  assert.equal(bracket.rounds[1].matches[0].leftParticipant?.username, "alice");
  assert.equal(bracket.rounds[1].matches[0].rightParticipant?.username, "beth");
});

test("retired-both matches count as resolved tournament states", () => {
  assert.equal(isTournamentMatchResolvedStatus("retired_both"), true);
});

test("frozen draw order controls first-round pairings", () => {
  const registrations = [
    { username: "alice", fullName: "Alice Archer" },
    { username: "beth", fullName: "Beth Bowman" },
    { username: "cara", fullName: "Cara Cross" },
    { username: "dina", fullName: "Dina Draw" },
  ];

  const bracket = buildTournamentBracket(
    registrations,
    new Map(),
    new Map(),
    {
      frozenDrawOrderUsernames: ["dina", "beth", "alice", "cara"],
    },
  );

  assert.equal(bracket.rounds[0].matches[0].leftParticipant?.username, "dina");
  assert.equal(bracket.rounds[0].matches[0].rightParticipant?.username, "beth");
  assert.equal(bracket.rounds[0].matches[1].leftParticipant?.username, "alice");
  assert.equal(bracket.rounds[0].matches[1].rightParticipant?.username, "cara");
});

test("per-round draw keeps advancing pairings stable across rebuilds", () => {
  const registrations = ["alice", "beth", "cara", "dina", "erin", "fran", "gina", "helen"]
    .map((username) => ({ username, fullName: username }));
  const scores = new Map([[1, new Map(registrations.map((entrant, index) =>
    [entrant.username, 100 - index]))]]);
  const options = {
    frozenDrawOrderUsernames: registrations.map((entrant) => entrant.username),
    randomizeEachRound: true,
  };
  const first = buildTournamentBracket(registrations, scores, new Map(), options);
  const rebuilt = buildTournamentBracket(registrations, scores, new Map(), options);
  const nextRound = first.rounds[1].matches.flatMap((match) =>
    [match.leftParticipant?.username, match.rightParticipant?.username]);

  assert.deepEqual(nextRound, rebuilt.rounds[1].matches.flatMap((match) =>
    [match.leftParticipant?.username, match.rightParticipant?.username]));
  assert.deepEqual([...nextRound].sort(), ["alice", "cara", "erin", "gina"]);

  const startedMatches = new Map([
    ["2:1", { leftMemberUsername: "gina", rightMemberUsername: "alice", leftScore: 50, status: "pending" }],
    ["2:2", { leftMemberUsername: "cara", rightMemberUsername: "erin", status: "pending" }],
  ]);
  const started = buildTournamentBracket(registrations, scores, startedMatches, options);
  assert.deepEqual(started.rounds[1].matches.flatMap((match) =>
    [match.leftParticipant?.username, match.rightParticipant?.username]),
  ["gina", "alice", "cara", "erin"]);
});
