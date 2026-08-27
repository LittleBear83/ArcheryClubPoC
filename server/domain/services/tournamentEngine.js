const RESOLVED_TOURNAMENT_MATCH_STATUSES = new Set([
  "completed",
  "finalised",
  "progressed",
  "walkover",
  "disqualified",
  "bye",
  "retired_both",
]);

function isTournamentMatchResolvedStatus(status) {
  return RESOLVED_TOURNAMENT_MATCH_STATUSES.has(String(status ?? "").trim());
}

function getComparableScore(match, side) {
  const adjustedScore =
    side === "left" ? match?.leftAdjustedScore : match?.rightAdjustedScore;

  if (Number.isInteger(adjustedScore)) {
    return adjustedScore;
  }

  const rawScore = side === "left" ? match?.leftScore : match?.rightScore;
  return Number.isInteger(rawScore) ? rawScore : null;
}

function buildHighestLoserCandidates(matches = []) {
  return matches
    .flatMap((match, index) => {
      if (!match?.winner || !match.leftParticipant || !match.rightParticipant) {
        return [];
      }

      const winnerUsername = match.winner.username ?? null;
      const leftUsername = match.leftParticipant.username ?? null;
      const rightUsername = match.rightParticipant.username ?? null;
      let loser = null;
      let comparableScore = null;

      if (winnerUsername && winnerUsername === leftUsername) {
        loser = match.rightParticipant;
        comparableScore = getComparableScore(match, "right");
      } else if (winnerUsername && winnerUsername === rightUsername) {
        loser = match.leftParticipant;
        comparableScore = getComparableScore(match, "left");
      }

      if (!loser || !Number.isInteger(comparableScore)) {
        return [];
      }

      return [
        {
          comparableScore,
          matchNumber: index + 1,
          participant: loser,
        },
      ];
    })
    .sort((left, right) => {
      if (right.comparableScore !== left.comparableScore) {
        return right.comparableScore - left.comparableScore;
      }

      if (left.matchNumber !== right.matchNumber) {
        return left.matchNumber - right.matchNumber;
      }

      return String(left.participant?.fullName ?? "").localeCompare(
        String(right.participant?.fullName ?? ""),
      );
    });
}

function fillHighestLoserSlots(nextRoundParticipants, matches = []) {
  const candidates = buildHighestLoserCandidates(matches);
  const assignedUsernames = new Set(
    nextRoundParticipants
      .map((participant) => participant?.username ?? null)
      .filter(Boolean),
  );
  let candidateIndex = 0;

  return nextRoundParticipants.map((participant) => {
    if (participant) {
      return participant;
    }

    while (candidateIndex < candidates.length) {
      const candidate = candidates[candidateIndex];
      candidateIndex += 1;
      const username = candidate.participant?.username ?? null;

      if (!username || assignedUsernames.has(username)) {
        continue;
      }

      assignedUsernames.add(username);
      return candidate.participant;
    }

    return null;
  });
}

function buildTournamentBracket(
  registrations,
  scoresByRound,
  persistedMatchesByKey = new Map(),
  {
    frozenDrawOrderUsernames = [],
    supportsHighestLoserProgression = false,
  } = {},
) {
  const frozenOrderLookup = new Map(
    frozenDrawOrderUsernames.map((username, index) => [username, index]),
  );
  const entrants = [...registrations]
    .sort((left, right) => {
      const leftFrozenIndex = frozenOrderLookup.get(left.username);
      const rightFrozenIndex = frozenOrderLookup.get(right.username);
      const leftHasFrozenIndex = Number.isInteger(leftFrozenIndex);
      const rightHasFrozenIndex = Number.isInteger(rightFrozenIndex);

      if (leftHasFrozenIndex && rightHasFrozenIndex) {
        return leftFrozenIndex - rightFrozenIndex;
      }

      if (leftHasFrozenIndex !== rightHasFrozenIndex) {
        return leftHasFrozenIndex ? -1 : 1;
      }

      return left.fullName.localeCompare(right.fullName);
    })
    .map((registration, index) => ({
      bowCode: registration.bowCode ?? null,
      username: registration.username,
      fullName: registration.fullName,
      seed: index + 1,
    }));

  if (entrants.length === 0) {
    return {
      rounds: [],
      winner: null,
      currentRoundNumber: null,
    };
  }

  const bracketSize = 2 ** Math.ceil(Math.log2(Math.max(entrants.length, 2)));
  const slots = [...entrants];

  while (slots.length < bracketSize) {
    slots.push(null);
  }

  const rounds = [];
  let currentParticipants = slots;
  let currentRoundNumber = null;

  while (currentParticipants.length > 1) {
    const roundIndex = rounds.length + 1;
    const roundScores = scoresByRound.get(roundIndex) ?? new Map();
    const matches = [];

    for (let index = 0; index < currentParticipants.length; index += 2) {
      const matchNumber = index / 2 + 1;
      const leftParticipant = currentParticipants[index] ?? null;
      const rightParticipant = currentParticipants[index + 1] ?? null;
      const leftScore = leftParticipant
        ? (roundScores.get(leftParticipant.username) ?? null)
        : null;
      const rightScore = rightParticipant
        ? (roundScores.get(rightParticipant.username) ?? null)
        : null;

      let winner = null;
      let status = "pending";
      const persistedMatch =
        persistedMatchesByKey.get(`${roundIndex}:${matchNumber}`) ?? null;
      const persistedParticipantsMatch =
        persistedMatch &&
        (persistedMatch.leftMemberUsername ?? null) ===
          (leftParticipant?.username ?? null) &&
        (persistedMatch.rightMemberUsername ?? null) ===
          (rightParticipant?.username ?? null);

      if (leftParticipant && !rightParticipant) {
        if (roundIndex === 1) {
          winner = leftParticipant;
          status = "bye";
        } else {
          status = "pending";
        }
      } else if (!leftParticipant && rightParticipant) {
        if (roundIndex === 1) {
          winner = rightParticipant;
          status = "bye";
        } else {
          status = "pending";
        }
      } else if (!leftParticipant && !rightParticipant) {
        status = "empty";
      } else if (typeof leftScore === "number" && typeof rightScore === "number") {
        if (leftScore > rightScore) {
          winner = leftParticipant;
          status = "completed";
        } else if (rightScore > leftScore) {
          winner = rightParticipant;
          status = "completed";
        } else {
          status = "tie";
        }
      }

      if (persistedParticipantsMatch) {
        const persistedStatus = persistedMatch.status ?? status;

        if (persistedStatus === "retired_both") {
          winner = null;
        } else if (
          persistedMatch.winnerUsername &&
          isTournamentMatchResolvedStatus(persistedStatus)
        ) {
          winner =
            [leftParticipant, rightParticipant].find(
              (participant) =>
                participant?.username === persistedMatch.winnerUsername,
            ) ?? winner;
        }

        status = persistedStatus;
      }

      const persistedMatchFields = persistedParticipantsMatch
        ? {
            confirmedAt: persistedMatch.confirmedAt ?? null,
            confirmedByUsername: persistedMatch.confirmedByUsername ?? null,
            disputeReason: persistedMatch.disputeReason ?? null,
            disputedAt: persistedMatch.disputedAt ?? null,
            disputedByUsername: persistedMatch.disputedByUsername ?? null,
            handicapAllowancePercent:
              persistedMatch.handicapAllowancePercent ?? null,
            leftAdjustedScore: persistedMatch.leftAdjustedScore ?? null,
            leftAllowancePoints: persistedMatch.leftAllowancePoints ?? null,
            leftHandicapBowClass: persistedMatch.leftHandicapBowClass ?? null,
            leftHandicapDiscipline:
              persistedMatch.leftHandicapDiscipline ?? null,
            leftHandicapTableKey:
              persistedMatch.leftHandicapTableKey ?? null,
            leftHandicapTableTitle:
              persistedMatch.leftHandicapTableTitle ?? null,
            leftHandicapType: persistedMatch.leftHandicapType ?? null,
            leftHandicapValue: persistedMatch.leftHandicapValue ?? null,
            leftReferenceScore: persistedMatch.leftReferenceScore ?? null,
            rightAdjustedScore: persistedMatch.rightAdjustedScore ?? null,
            rightAllowancePoints: persistedMatch.rightAllowancePoints ?? null,
            rightHandicapBowClass: persistedMatch.rightHandicapBowClass ?? null,
            rightHandicapDiscipline:
              persistedMatch.rightHandicapDiscipline ?? null,
            rightHandicapTableKey:
              persistedMatch.rightHandicapTableKey ?? null,
            rightHandicapTableTitle:
              persistedMatch.rightHandicapTableTitle ?? null,
            rightHandicapType: persistedMatch.rightHandicapType ?? null,
            rightHandicapValue: persistedMatch.rightHandicapValue ?? null,
            rightReferenceScore: persistedMatch.rightReferenceScore ?? null,
            submittedAt: persistedMatch.submittedAt ?? null,
            submittedByUsername: persistedMatch.submittedByUsername ?? null,
          }
        : {};

      matches.push({
        id: `round-${roundIndex}-match-${matchNumber}`,
        leftParticipant,
        rightParticipant,
        leftScore,
        rightScore,
        winner,
        status,
        ...persistedMatchFields,
      });
    }

    if (
      currentRoundNumber === null &&
      matches.some(
        (match) =>
          !isTournamentMatchResolvedStatus(match.status) &&
          !["empty"].includes(match.status) &&
          match.leftParticipant &&
          match.rightParticipant,
      )
    ) {
      currentRoundNumber = roundIndex;
    }

    rounds.push({
      roundNumber: roundIndex,
      title: `Round ${roundIndex}`,
      matches,
    });

    const nextRoundParticipants = matches.map((match) => match.winner);
    currentParticipants = supportsHighestLoserProgression
      ? fillHighestLoserSlots(nextRoundParticipants, matches)
      : nextRoundParticipants;
  }

  return {
    rounds,
    winner: currentParticipants[0] ?? null,
    currentRoundNumber,
  };
}

export {
  buildTournamentBracket,
  buildHighestLoserCandidates,
  isTournamentMatchResolvedStatus,
};
