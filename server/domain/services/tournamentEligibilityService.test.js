import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTournamentEligibilitySnapshot,
  evaluateTournamentRegistrationEligibility,
  evaluateTournamentRoundEligibility,
} from "./tournamentEligibilityService.js";

const captainsSwordTournament = { templateKey: "captains-sword" };
const eligibilityRules = {
  handicapQualificationRoundsRequired: 3,
  qualifyingRoundsRequiredPerKnockoutRound: 1,
  qualifyingRoundDiscipline: "indoor",
};

test("eligibility snapshot counts matching indoor rounds and handicap", () => {
  const snapshot = buildTournamentEligibilitySnapshot({
    bowCode: "RC",
    goldenRecordsSnapshot: {
      enabled: true,
      achievements: [
        {
          achieved: "2026-01-10T10:00:00",
          bowClass: "recurve",
          discipline: "indoor",
          round: "Portsmouth",
        },
        {
          achieved: "2026-01-10T12:00:00",
          bowClass: "recurve",
          discipline: "indoor",
          round: "Portsmouth",
        },
        {
          achieved: "2026-01-17T10:00:00",
          bowClass: "recurve",
          discipline: "indoor",
          round: "Portsmouth",
        },
        {
          achieved: "2026-01-24T10:00:00",
          bowClass: "compound",
          discipline: "indoor",
          round: "Portsmouth",
        },
      ],
      handicaps: [
        {
          bowClass: "recurve",
          handicap: 42,
          type: "indoor",
        },
      ],
    },
    qualifyingDiscipline: "indoor",
    username: "robin",
  });

  assert.equal(snapshot.qualifyingRoundCount, 2);
  assert.equal(snapshot.hasCurrentHandicap, true);
});

test("registration eligibility explains missing handicap rounds", () => {
  const result = evaluateTournamentRegistrationEligibility({
    eligibilityRules,
    snapshot: {
      dataStatus: "available",
      hasCurrentHandicap: false,
      qualifyingDiscipline: "indoor",
      qualifyingRoundCount: 1,
    },
    tournament: captainsSwordTournament,
  });

  assert.equal(result.isEligible, false);
  assert.match(result.reason, /current indoor handicap/i);
  assert.match(result.reason, /2 more indoor qualifying rounds/i);
});

test("round eligibility scales with knockout round number", () => {
  const result = evaluateTournamentRoundEligibility({
    eligibilityRules,
    roundNumber: 3,
    snapshot: {
      dataStatus: "available",
      hasCurrentHandicap: true,
      qualifyingDiscipline: "indoor",
      qualifyingRoundCount: 2,
    },
    tournament: captainsSwordTournament,
  });

  assert.equal(result.isEligible, false);
  assert.match(result.reason, /1 more indoor qualifying round/i);
  assert.match(result.reason, /round 3/i);
});
