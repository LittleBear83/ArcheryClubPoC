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
