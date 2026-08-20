import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchHandicapSnapshot,
  buildParticipantHandicapSnapshot,
  calculateAdjustedMatchScores,
  isCaptainsSwordTournament,
} from "./tournamentHandicapService.js";

const handicapTablesSnapshot = {
  families: [
    {
      familyKey: "indoor-rounds",
      tables: [
        {
          tableKey: "non-compound-portsmouth",
          title: "Non-Compound Portsmouth Full size",
          rows: [
            { handicapValue: 0, referenceScore: 600 },
            { handicapValue: 20, referenceScore: 593 },
          ],
        },
        {
          tableKey: "compound-portsmouth",
          title: "Compound Portsmouth Full size",
          rows: [
            { handicapValue: 0, referenceScore: 596 },
            { handicapValue: 10, referenceScore: 592 },
          ],
        },
      ],
    },
  ],
};

test("Captain's Sword handicap snapshot uses indoor Portsmouth tables", () => {
  const participantSnapshot = buildParticipantHandicapSnapshot({
    handicapTablesSnapshot,
    handicaps: [
      {
        bowClass: "Recurve",
        discipline: "Recurve Bow",
        handicap: 20,
        type: "indoor",
        updated: "2026-08-01",
      },
    ],
  });

  assert.deepEqual(participantSnapshot, {
    allowancePercent: 95,
    allowancePoints: 7,
    bowClass: "Recurve",
    discipline: "Recurve Bow",
    handicapType: "indoor",
    handicapValue: 20,
    referenceScore: 593,
    tableKey: "non-compound-portsmouth",
    tableTitle: "Non-Compound Portsmouth Full size",
  });
});

test("Captain's Sword match snapshot carries both competitors", () => {
  const participantSnapshotsByUsername = new Map([
    [
      "archer-a",
      {
        allowancePercent: 95,
        allowancePoints: 7,
        bowClass: "Recurve",
        discipline: "Recurve Bow",
        handicapType: "indoor",
        handicapValue: 20,
        referenceScore: 593,
        tableKey: "non-compound-portsmouth",
        tableTitle: "Non-Compound Portsmouth Full size",
      },
    ],
    [
      "archer-b",
      {
        allowancePercent: 95,
        allowancePoints: 4,
        bowClass: "Compound",
        discipline: "Compound Bow",
        handicapType: "indoor",
        handicapValue: 10,
        referenceScore: 592,
        tableKey: "compound-portsmouth",
        tableTitle: "Compound Portsmouth Full size",
      },
    ],
  ]);

  assert.deepEqual(
    buildMatchHandicapSnapshot({
      leftParticipantUsername: "archer-a",
      participantSnapshotsByUsername,
      rightParticipantUsername: "archer-b",
    }),
    {
      allowancePercent: 95,
      leftAllowancePoints: 7,
      leftBowClass: "Recurve",
      leftDiscipline: "Recurve Bow",
      leftHandicapType: "indoor",
      leftHandicapValue: 20,
      leftReferenceScore: 593,
      leftTableKey: "non-compound-portsmouth",
      leftTableTitle: "Non-Compound Portsmouth Full size",
      rightAllowancePoints: 4,
      rightBowClass: "Compound",
      rightDiscipline: "Compound Bow",
      rightHandicapType: "indoor",
      rightHandicapValue: 10,
      rightReferenceScore: 592,
      rightTableKey: "compound-portsmouth",
      rightTableTitle: "Compound Portsmouth Full size",
    },
  );
});

test("Captain's Sword adjusted scores add persisted allowances", () => {
  assert.deepEqual(
    calculateAdjustedMatchScores({
      leftAllowancePoints: 7,
      leftScore: 545,
      rightAllowancePoints: 4,
      rightScore: 548,
    }),
    {
      leftAdjustedScore: 552,
      rightAdjustedScore: 552,
    },
  );
});

test("Captain's Sword template detection matches template key", () => {
  assert.equal(isCaptainsSwordTournament({ templateKey: "captains-sword" }), true);
  assert.equal(isCaptainsSwordTournament({ template_key: "standard-knockout" }), false);
});
