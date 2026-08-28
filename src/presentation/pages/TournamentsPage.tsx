import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  MATCH_STATES,
  SingleEliminationBracket,
} from "@g-loot/react-tournament-brackets";
import type {
  MatchComponentProps,
  MatchType,
} from "@g-loot/react-tournament-brackets";
import { buildActorHeaders, fetchApi } from "../../api/client";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import {
  MemberAutocomplete,
} from "../components/MemberAutocomplete";
import { Modal } from "../components/Modal";
import { useIsMobile } from "../hooks/useIsMobile";
import { formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { subscribeToServerEvent } from "../../lib/serverEvents";
import { useSseFallbackPolling } from "../state/useSseFallbackPolling";
import { TournamentsDesktopView } from "./tournaments/TournamentsDesktopView";
import { TournamentsMobileView } from "./tournaments/TournamentsMobileView";
import type { TournamentRecord } from "./tournaments/tournamentViewTypes";

const TOURNAMENT_BRACKET_MATCH_WIDTH = 320;
const TOURNAMENT_BRACKET_MATCH_HEIGHT = 108;
const TOURNAMENT_BRACKET_ROW_HEIGHT = 126;
const TOURNAMENT_BRACKET_COLUMN_GAP = 44;
const TOURNAMENT_ARCHIVE_WINDOW_DAYS = 30;
const TOURNAMENT_SETUP_STEPS = [
  { key: "basics", label: "Basics" },
  { key: "windows", label: "Windows" },
  { key: "schedule", label: "Schedule" },
  { key: "review", label: "Review" },
];
type TournamentCssVars = CSSProperties & Record<string, string>;
const TOURNAMENT_BOW_OPTIONS = [
  { code: "BB", discipline: "Bare Bow" },
  { code: "CB", discipline: "Compound Bow" },
  { code: "LB", discipline: "Long Bow" },
  { code: "RC", discipline: "Recurve Bow" },
];
type TournamentRegistrationCandidate = {
  bowOptions: Array<{ code: string; discipline: string }>;
  fullName: string;
  suggestedBowCode?: string | null;
  username: string;
};
type TournamentTemplateOption = {
  key: string;
  label: string;
  description?: string;
  tournamentType: string;
  format?: string;
  roundType?: string;
  isCustom?: boolean;
  defaults?: {
    registrationMode?: string;
    resultWorkflow?: string;
    handicapAllowancePercent?: number | null;
    defaultRoundNames?: string[];
  };
  capabilities?: Record<string, boolean>;
  eligibilityRules?: {
    handicapQualificationRoundsRequired?: number;
    qualifyingRoundsRequiredPerKnockoutRound?: number;
    qualifyingRoundDiscipline?: string;
  } | null;
};

function createEmptyTemplateForm(templateOptions: TournamentTemplateOption[] = []) {
  const defaultBaseTemplate =
    getTemplateForKey(templateOptions, "standard-knockout") ??
    getTemplateForKey(templateOptions, "captains-sword") ??
    templateOptions[0] ??
    null;

  return {
    label: "",
    description: defaultBaseTemplate?.description ?? "",
    baseTemplateKey: defaultBaseTemplate?.key ?? "",
    resultWorkflow: defaultBaseTemplate?.defaults?.resultWorkflow ?? "single-submit",
    handicapAllowancePercent:
      defaultBaseTemplate?.defaults?.handicapAllowancePercent === null ||
      typeof defaultBaseTemplate?.defaults?.handicapAllowancePercent === "number"
        ? String(defaultBaseTemplate?.defaults?.handicapAllowancePercent ?? "")
        : "",
    defaultRoundNames: (defaultBaseTemplate?.defaults?.defaultRoundNames ?? []).join(", "),
    supportsRandomizedDraw:
      defaultBaseTemplate?.capabilities?.supportsRandomizedDraw ?? false,
    supportsHighestLoserProgression:
      defaultBaseTemplate?.capabilities?.supportsHighestLoserProgression ?? false,
    supportsRoundDeadlines:
      defaultBaseTemplate?.capabilities?.supportsRoundDeadlines ?? false,
    supportsMatchConfirmation:
      defaultBaseTemplate?.capabilities?.supportsMatchConfirmation ?? false,
    supportsEligibilityRules:
      defaultBaseTemplate?.capabilities?.supportsEligibilityRules ?? false,
    supportsHandicapAdjustments:
      defaultBaseTemplate?.capabilities?.supportsHandicapAdjustments ?? false,
    handicapQualificationRoundsRequired: String(
      defaultBaseTemplate?.eligibilityRules?.handicapQualificationRoundsRequired ?? 3,
    ),
    qualifyingRoundsRequiredPerKnockoutRound: String(
      defaultBaseTemplate?.eligibilityRules?.qualifyingRoundsRequiredPerKnockoutRound ?? 1,
    ),
    qualifyingRoundDiscipline:
      defaultBaseTemplate?.eligibilityRules?.qualifyingRoundDiscipline ?? "indoor",
  };
}

function createEmptyTournamentForm(
  today,
  defaultTournamentType = "portsmouth",
  defaultTemplateKey = "",
) {
  return {
    name: "",
    templateKey: defaultTemplateKey,
    tournamentType: defaultTournamentType,
    roundOneStartDate: today,
    roundWindowDays: 14,
    roundRestDays: 0,
    registrationStartDate: today,
    registrationEndDate: today,
  };
}

function getTemplateForKey(templateOptions, templateKey) {
  return (
    templateOptions.find((option) => option.key === templateKey) ?? null
  );
}

function getDefaultTournamentTemplate(templateOptions) {
  return (
    getTemplateForKey(templateOptions, "captains-sword") ??
    getTemplateForKey(templateOptions, "standard-knockout") ??
    templateOptions[0] ??
    null
  );
}

function buildTournamentFormWithTemplate(current, templateOptions, templateKey) {
  const selectedTemplate = getTemplateForKey(templateOptions, templateKey);

  return {
    ...current,
    templateKey: templateKey ?? "",
    tournamentType:
      selectedTemplate?.tournamentType ?? current.tournamentType ?? "portsmouth",
  };
}

function sanitizeFileNameSegment(value, fallback = "tournament") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function addDays(dateString, daysToAdd) {
  if (!dateString) {
    return "";
  }

  const parsed = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setUTCDate(parsed.getUTCDate() + Number(daysToAdd || 0));
  return parsed.toISOString().slice(0, 10);
}

function parseDateStringToUtcStart(dateString?: string | null) {
  if (!dateString) {
    return null;
  }

  const parsed = new Date(`${dateString}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTournamentArchiveReferenceDate(tournament: TournamentRecord) {
  const candidateDates = [
    tournament.scoreWindow?.endDate ?? null,
    tournament.roundOneStartDate ?? null,
    tournament.registrationWindow?.endDate ?? null,
    ...(tournament.roundSchedule ?? []).flatMap((round) => [
      round.submissionDeadline ?? null,
      round.publishDate ?? null,
    ]),
  ]
    .map((value) => parseDateStringToUtcStart(value))
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime());

  return candidateDates[0] ?? null;
}

function isTournamentCompleted(tournament: TournamentRecord) {
  if (tournament.bracket?.winner) {
    return true;
  }

  const engineRounds = tournament.engine?.rounds ?? [];

  return (
    engineRounds.length > 0 &&
    engineRounds.every(
      (round) =>
        round.status === "completed" ||
        round.matches.every(
          (match) =>
            Boolean(match.winner) ||
            ["finalised", "completed", "walkover", "disqualified", "retired_both"].includes(
              String(match.status ?? ""),
            ),
        ),
    )
  );
}

function isTournamentArchived(tournament: TournamentRecord, today: string) {
  if (!isTournamentCompleted(tournament)) {
    return false;
  }

  const archiveReferenceDate = getTournamentArchiveReferenceDate(tournament);
  const todayDate = parseDateStringToUtcStart(today);

  if (!archiveReferenceDate || !todayDate) {
    return false;
  }

  const ageInDays = Math.floor(
    (todayDate.getTime() - archiveReferenceDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  return ageInDays > TOURNAMENT_ARCHIVE_WINDOW_DAYS;
}

function getTournamentMatchHandicapSummary(match) {
  const handicap = match?.handicap;

  if (!handicap) {
    return null;
  }

  const hasAdjustedScores =
    typeof handicap.competitorA?.adjustedScore === "number" ||
    typeof handicap.competitorB?.adjustedScore === "number";
  const hasAllowances =
    typeof handicap.competitorA?.allowancePoints === "number" ||
    typeof handicap.competitorB?.allowancePoints === "number";

  if (!hasAdjustedScores && !hasAllowances) {
    return null;
  }

  return {
    handicapScoreText: hasAllowances
      ? `${typeof handicap.competitorA?.allowancePoints === "number" ? handicap.competitorA.allowancePoints : "-"} - ${
          typeof handicap.competitorB?.allowancePoints === "number"
            ? handicap.competitorB.allowancePoints
            : "-"
        }`
      : "",
    rawScoreText:
      typeof match?.score?.competitorA === "number" ||
      typeof match?.score?.competitorB === "number"
        ? `${typeof match.score?.competitorA === "number" ? match.score.competitorA : "-"} - ${
            typeof match.score?.competitorB === "number" ? match.score.competitorB : "-"
          }`
        : "",
    totalScoreText: hasAdjustedScores
      ? `${typeof handicap.competitorA?.adjustedScore === "number" ? handicap.competitorA.adjustedScore : "-"} - ${
          typeof handicap.competitorB?.adjustedScore === "number"
            ? handicap.competitorB.adjustedScore
            : "-"
        }`
      : "",
    allowancePercent: handicap.allowancePercent ?? null,
  };
}

function formatTournamentBowCode(bowCode) {
  const normalizedBowCode = String(bowCode ?? "").trim().toUpperCase();
  return normalizedBowCode ? `(${normalizedBowCode})` : "";
}

function formatTournamentRegistrationName(registration) {
  const bowCode = formatTournamentBowCode(registration?.bowCode);
  return bowCode ? `${registration.fullName} ${bowCode}` : registration.fullName;
}

function buildTournamentBowCodeLookup(tournament) {
  const bowCodeLookup = new Map<string, string>();

  const registerBowCode = (participant) => {
    const normalizedBowCode = String(participant?.bowCode ?? "").trim().toUpperCase();

    if (!normalizedBowCode) {
      return;
    }

    const usernameKey = String(participant?.username ?? "").trim().toLowerCase();
    const fullNameKey = String(participant?.fullName ?? "").trim().toLowerCase();

    if (usernameKey) {
      bowCodeLookup.set(`user:${usernameKey}`, normalizedBowCode);
    }

    if (fullNameKey) {
      bowCodeLookup.set(`name:${fullNameKey}`, normalizedBowCode);
    }
  };

  tournament?.registrations?.forEach(registerBowCode);
  tournament?.bracket?.rounds?.forEach((round) => {
    round?.matches?.forEach((match) => {
      registerBowCode(match?.leftParticipant);
      registerBowCode(match?.rightParticipant);
      registerBowCode(match?.winner);
    });
  });
  registerBowCode(tournament?.currentMatch?.competitorA);
  registerBowCode(tournament?.currentMatch?.competitorB);
  registerBowCode(tournament?.currentMatch?.winner);
  registerBowCode(tournament?.bracket?.winner);

  return bowCodeLookup;
}

function hydrateTournamentParticipant(participant, bowCodeLookup = new Map()) {
  if (!participant) {
    return null;
  }

  const usernameKey = String(participant.username ?? "").trim().toLowerCase();
  const fullNameKey = String(participant.fullName ?? "").trim().toLowerCase();
  const lookupBowCode =
    (usernameKey ? bowCodeLookup.get(`user:${usernameKey}`) : "") ||
    (fullNameKey ? bowCodeLookup.get(`name:${fullNameKey}`) : "") ||
    null;

  return {
    ...participant,
    bowCode: participant.bowCode ?? lookupBowCode ?? null,
  };
}

function buildExampleRoundPreview({
  roundOneStartDate,
  roundWindowDays,
  roundRestDays,
  roundCount = 5,
}) {
  if (!roundOneStartDate || !Number.isInteger(Number(roundWindowDays)) || Number(roundWindowDays) < 1) {
    return [];
  }

  const rounds = [];
  let startDate = roundOneStartDate;

  for (let index = 0; index < roundCount; index += 1) {
    const endDate = addDays(startDate, Number(roundWindowDays));
    const restStartDate = addDays(endDate, 1);
    const restEndDate =
      Number(roundRestDays) > 0 ? addDays(restStartDate, Number(roundRestDays) - 1) : "";

    rounds.push({
      roundNumber: index + 1,
      roundTitle:
        index === roundCount - 1
          ? "Final"
          : index === roundCount - 2
            ? "Semi-final"
            : `Round ${index + 1}`,
      startDate,
      endDate,
      restStartDate,
      restEndDate,
      hasRestWindow: Number(roundRestDays) > 0,
    });

    startDate = addDays(endDate, Number(roundRestDays) + 1);
  }

  return rounds;
}

function buildTournamentCompetitorExport(tournament) {
  const lines = [
    `Tournament: ${tournament.name}`,
    `Type: ${tournament.typeLabel}`,
    `Registration window: ${formatDate(tournament.registrationWindow.startDate)} to ${formatDate(tournament.registrationWindow.endDate)}`,
    `Score window: ${formatDate(tournament.scoreWindow.startDate)} to ${formatDate(tournament.scoreWindow.endDate)}`,
    `Registered competitors: ${tournament.registrationCount}`,
    "",
    "Competing members:",
    ...(tournament.registrations.length > 0
      ? tournament.registrations.map(
          (registration, index) =>
            `${index + 1}. ${formatTournamentRegistrationName(registration)}`,
        )
      : ["No registered competitors."]),
  ];

  return `${lines.join("\n")}\n`;
}

function getBracketParticipantDisplay(match, side: "left" | "right") {
  const participant =
    side === "left" ? match?.leftParticipant ?? null : match?.rightParticipant ?? null;
  const rawScore =
    side === "left" ? match?.leftScore ?? null : match?.rightScore ?? null;
  const handicap = match?.handicap ?? null;
  const handicapParticipant =
    side === "left"
      ? handicap?.competitorA ?? null
      : handicap?.competitorB ?? null;
  const adjustedScoreFromMatch =
    side === "left"
      ? match?.leftAdjustedScore ?? null
      : match?.rightAdjustedScore ?? null;
  const allowancePointsFromMatch =
    side === "left"
      ? match?.leftAllowancePoints ?? null
      : match?.rightAllowancePoints ?? null;
  const totalScore =
    typeof adjustedScoreFromMatch === "number"
      ? adjustedScoreFromMatch
      : typeof handicapParticipant?.adjustedScore === "number"
      ? handicapParticipant.adjustedScore
      : typeof rawScore === "number" &&
          typeof allowancePointsFromMatch === "number"
        ? rawScore + allowancePointsFromMatch
        : typeof rawScore === "number" &&
            typeof handicapParticipant?.allowancePoints === "number"
          ? rawScore + handicapParticipant.allowancePoints
        : typeof rawScore === "number"
          ? rawScore
          : null;
  const allowancePoints =
    typeof allowancePointsFromMatch === "number"
      ? allowancePointsFromMatch
      : handicapParticipant?.allowancePoints ?? null;

  return {
    allowancePoints,
    participant,
    rawScore,
    scoreToDisplay:
      typeof totalScore === "number"
        ? totalScore
        : typeof rawScore === "number"
          ? rawScore
          : null,
    showAdjustedLabel:
      typeof totalScore === "number" && totalScore !== rawScore,
  };
}

function formatTournamentMatchStatus(status) {
  return String(status ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getTournamentRetirementFlags(match) {
  return {
    competitorA: Boolean(match?.retirement?.competitorA),
    competitorB: Boolean(match?.retirement?.competitorB),
  };
}

function formatTournamentParticipantName(participant, bowCodeLookup = new Map()) {
  if (!participant) {
    return "TBD";
  }

  const hydratedParticipant = hydrateTournamentParticipant(participant, bowCodeLookup);
  const bowCode = formatTournamentBowCode(hydratedParticipant?.bowCode);
  const fullName = bowCode
    ? `${hydratedParticipant?.fullName} ${bowCode}`
    : hydratedParticipant?.fullName;
  return hydratedParticipant?.seed ? `(${hydratedParticipant.seed}) ${fullName}` : fullName;
}

function getTournamentBracketState(match) {
  const leftParticipant = match?.leftParticipant ?? null;
  const rightParticipant = match?.rightParticipant ?? null;

  if (!leftParticipant && !rightParticipant) {
    return MATCH_STATES.NO_PARTY;
  }

  if (match?.status === "bye") {
    return MATCH_STATES.WALK_OVER;
  }

  if (match?.winner || match?.status === "finalised" || match?.status === "completed") {
    return MATCH_STATES.DONE;
  }

  return MATCH_STATES.NO_SHOW;
}

function buildTournamentBracketMatches(tournament) {
  const bowCodeLookup = buildTournamentBowCodeLookup(tournament);
  const roundTitles = tournament.bracket.rounds.map((round) => round.title);
  const matches: MatchType[] = tournament.bracket.rounds.flatMap((round, roundIndex) =>
    round.matches.map((match, matchIndex) => {
      const leftDisplay = getBracketParticipantDisplay(match, "left");
      const rightDisplay = getBracketParticipantDisplay(match, "right");
      const nextMatch = tournament.bracket.rounds[roundIndex + 1]?.matches?.[
        Math.floor(matchIndex / 2)
      ];
      const leftBracketScore =
        typeof leftDisplay.scoreToDisplay === "number"
          ? String(leftDisplay.scoreToDisplay)
          : typeof leftDisplay.rawScore === "number"
            ? String(leftDisplay.rawScore)
            : "";
      const rightBracketScore =
        typeof rightDisplay.scoreToDisplay === "number"
          ? String(rightDisplay.scoreToDisplay)
          : typeof rightDisplay.rawScore === "number"
            ? String(rightDisplay.rawScore)
            : "";

      return {
        id: String(match.id),
        name: round.title,
        nextMatchId: nextMatch ? String(nextMatch.id) : null,
        startTime: "",
        state: getTournamentBracketState(match),
        tournamentRoundText: round.title,
        participants: [
          {
            id:
              leftDisplay.participant?.username ??
              `match-${String(match.id)}-left`,
            isWinner:
              match.winner?.username === match.leftParticipant?.username,
            name: formatTournamentParticipantName(leftDisplay.participant, bowCodeLookup),
            resultText: leftBracketScore,
            status: leftDisplay.participant ? MATCH_STATES.PLAYED : MATCH_STATES.NO_PARTY,
          },
          {
            id:
              rightDisplay.participant?.username ??
              `match-${String(match.id)}-right`,
            isWinner:
              match.winner?.username === match.rightParticipant?.username,
            name: formatTournamentParticipantName(rightDisplay.participant, bowCodeLookup),
            resultText: rightBracketScore,
            status: rightDisplay.participant ? MATCH_STATES.PLAYED : MATCH_STATES.NO_PARTY,
          },
        ],
      };
    }),
  );

  return {
    matches,
    roundTitles,
  };
}

function renderTournamentMatchScoreBreakdownRow(label, rawScore, allowancePoints, totalScore) {
  return (
    <div className="tournament-current-match-score-row">
      <span className="tournament-current-match-score-label">{label}</span>
      <span>Raw {typeof rawScore === "number" ? rawScore : "-"}</span>
      <span>Hcap {typeof allowancePoints === "number" ? allowancePoints : "-"}</span>
      <span>Total {typeof totalScore === "number" ? totalScore : "-"}</span>
    </div>
  );
}

function TournamentBracketMatchCard({
  topParty,
  bottomParty,
  topWon,
  bottomWon,
}: MatchComponentProps) {
  return (
    <div className="tournament-library-match">
      <div className={`tournament-library-match-row ${topWon ? "winner" : ""}`}>
        <span className="tournament-library-match-name">{topParty?.name ?? "TBD"}</span>
        <span className="tournament-library-match-score">
          {topParty?.resultText ?? ""}
        </span>
      </div>
      <div className={`tournament-library-match-row ${bottomWon ? "winner" : ""}`}>
        <span className="tournament-library-match-name">
          {bottomParty?.name ?? "TBD"}
        </span>
        <span className="tournament-library-match-score">
          {bottomParty?.resultText ?? ""}
        </span>
      </div>
    </div>
  );
}

function TournamentBracketGraphic({ tournament }) {
  const { matches, roundTitles } = useMemo(
    () => buildTournamentBracketMatches(tournament),
    [tournament.bracket.rounds],
  );

  return (
    <div className="tournament-bracket-shell">
      <div className="tournament-bracket-scroll">
        <div className="tournament-bracket-board tournament-bracket-board--library">
          <SingleEliminationBracket
            matches={matches}
            matchComponent={TournamentBracketMatchCard}
            options={{
              style: {
                boxHeight: TOURNAMENT_BRACKET_MATCH_HEIGHT,
                canvasPadding: 24,
                connectorColor: "#6f8fc4",
                connectorColorHighlight: "#ffe066",
                roundHeader: {
                  backgroundColor: "#6d8fce",
                  fontColor: "#f7fbff",
                  fontFamily: "inherit",
                  fontSize: 16,
                  height: 42,
                  isShown: true,
                  marginBottom: 24,
                  roundTextGenerator: (currentRoundNumber) =>
                    roundTitles[currentRoundNumber - 1] ?? `Round ${currentRoundNumber}`,
                },
                rowHeight: TOURNAMENT_BRACKET_ROW_HEIGHT,
                spaceBetweenColumns: TOURNAMENT_BRACKET_COLUMN_GAP,
                width: TOURNAMENT_BRACKET_MATCH_WIDTH,
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}

function getTournamentSetupValidationMessage({
  stepKey,
  form,
  selectedTemplate,
  tournamentTypes,
}) {
  if (stepKey === "basics") {
    if (!form.name?.trim()) {
      return "Enter a tournament name before continuing.";
    }

    if (
      !tournamentTypes.some((option) => option.value === form.tournamentType)
    ) {
      return "Choose a valid tournament type.";
    }

    return "";
  }

  if (stepKey === "windows") {
    if (
      !form.registrationStartDate ||
      !form.registrationEndDate ||
      !form.roundOneStartDate
    ) {
      return "Complete the registration dates and round 1 start date before continuing.";
    }

    if (form.registrationStartDate > form.registrationEndDate) {
      return "Registration close must be on or after registration open.";
    }

    if (form.registrationEndDate > form.roundOneStartDate) {
      return "Round 1 must start on or after the registration close date.";
    }

    return "";
  }

  if (
    stepKey === "schedule" &&
    selectedTemplate?.capabilities?.supportsRoundDeadlines
  ) {
    if (!Number.isInteger(Number(form.roundWindowDays)) || Number(form.roundWindowDays) < 1) {
      return "Enter how many days each round should stay open.";
    }

    if (!Number.isInteger(Number(form.roundRestDays)) || Number(form.roundRestDays) < 0) {
      return "Enter a valid rest window in days.";
    }
  }

  return "";
}

function TournamentSetupStepper({ currentStepIndex }) {
  return (
    <ol className="tournament-setup-stepper" aria-label="Tournament setup steps">
      {TOURNAMENT_SETUP_STEPS.map((step, index) => {
        const state =
          index === currentStepIndex
            ? "current"
            : index < currentStepIndex
              ? "complete"
              : "upcoming";

        return (
          <li
            key={step.key}
            className={`tournament-setup-step tournament-setup-step-${state}`}
          >
            <span className="tournament-setup-step-index">{index + 1}</span>
            <span className="tournament-setup-step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function TournamentSetupReview({ form, selectedTemplate, registrationCount = null }) {
  const exampleRounds = buildExampleRoundPreview({
    roundOneStartDate: form.roundOneStartDate,
    roundWindowDays: Number(form.roundWindowDays),
    roundRestDays: Number(form.roundRestDays),
  });

  return (
    <div className="tournament-setup-review">
      <div className="tournament-setup-review-card">
        <h4>Summary</h4>
        <p>
          <strong>Name:</strong> {form.name || "Not set"}
        </p>
        <p>
          <strong>Template:</strong> {selectedTemplate?.label ?? "No template"}
        </p>
        <p>
          <strong>Tournament type:</strong> {form.tournamentType}
        </p>
        <p>
          <strong>Registration:</strong> {formatDate(form.registrationStartDate)} to{" "}
          {formatDate(form.registrationEndDate)}
        </p>
        <p>
          <strong>Round 1 starts:</strong> {formatDate(form.roundOneStartDate)}
        </p>
        <p>
          <strong>Round window:</strong> {form.roundWindowDays} day{form.roundWindowDays === 1 ? "" : "s"}
        </p>
        <p>
          <strong>Rest window:</strong> {form.roundRestDays} day{form.roundRestDays === 1 ? "" : "s"}
        </p>
        {typeof registrationCount === "number" ? (
          <p>
            <strong>Current registrations:</strong> {registrationCount}
          </p>
        ) : null}
      </div>

      {selectedTemplate ? (
        <div className="tournament-setup-review-card">
          <h4>Template Rules</h4>
          <p>{selectedTemplate.description}</p>
          {selectedTemplate.defaults?.handicapAllowancePercent ? (
            <p>
              <strong>Handicap allowance:</strong>{" "}
              {selectedTemplate.defaults.handicapAllowancePercent}%
            </p>
          ) : null}
          {selectedTemplate.eligibilityRules ? (
            <>
              <p>
                <strong>Handicap rounds required:</strong>{" "}
                {selectedTemplate.eligibilityRules.handicapQualificationRoundsRequired}
              </p>
              <p>
                <strong>Qualifying rounds per knockout round:</strong>{" "}
                {
                  selectedTemplate.eligibilityRules
                    .qualifyingRoundsRequiredPerKnockoutRound
                }
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {exampleRounds.length > 0 ? (
        <div className="tournament-setup-review-card">
          <h4>Example Round Windows</h4>
          <p>
            This preview shows how the first 5 rounds would be scheduled once
            registration closes and the bracket is generated.
          </p>
          <ul className="event-summary-list">
            {exampleRounds.map((round) => (
              <li key={`preview-round-${round.roundNumber}`}>
                <strong>{round.roundTitle}</strong>: {formatDate(round.startDate)} to{" "}
                {formatDate(round.endDate)}
                {round.hasRestWindow
                  ? ` | Rest window: ${formatDate(round.restStartDate)} to ${formatDate(round.restEndDate)}`
                  : " | Rest window: none"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TournamentLineUpPage({
  tournament,
  bracketGraphic = null,
  canManageTournaments = false,
  onBack,
}) {
  const currentRoundNumber = tournament?.currentRoundNumber ?? null;
  const roundEntries =
    tournament?.engine?.rounds?.length > 0
      ? tournament.engine.rounds
      : tournament?.bracket?.rounds ?? [];

  return (
    <section className="tournament-lineup-page">
      <div className="tournament-lineup-page-header">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <div className="tournament-lineup-page-copy">
          <h3 className="profile-section-title">Tournament Line Up</h3>
          <p className="tournament-setup-copy">{tournament?.name ?? "Tournament"}</p>
        </div>
      </div>

      <div className="tournament-lineup-page-grid">
        <section className="tournament-registrations-card tournament-lineup-panel">
          <div className="tournament-lineup-panel-header">
            <h4>Competing Members</h4>
            <span>{tournament?.registrations?.length ?? 0} registered</span>
          </div>
          {tournament?.registrations?.length ? (
            <ul className="tournament-lineup-members-list">
              {tournament.registrations.map((registration) => (
                <li key={registration.username} className="tournament-lineup-member-card">
                  <strong>{formatTournamentRegistrationName(registration)}</strong>
                  {canManageTournaments &&
                  registration.eligibility?.registration?.isEligible === false &&
                  registration.eligibility.registration.reason ? (
                    <span>{registration.eligibility.registration.reason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No members have registered yet.</p>
          )}
        </section>

        <section className="tournament-summary-card tournament-lineup-panel">
          <div className="tournament-lineup-panel-header">
            <h4>Round Progress</h4>
            <span>
              {currentRoundNumber ? `Current round: ${currentRoundNumber}` : "No active round"}
            </span>
          </div>
          {roundEntries.length > 0 ? (
            <div className="tournament-lineup-round-list">
              {roundEntries.map((round) => {
                const isCurrentRound =
                  currentRoundNumber !== null && round.roundNumber === currentRoundNumber;
                const matchCount = round.matches?.length ?? 0;
                const resolvedMatches =
                  round.matches?.filter(
                    (match) =>
                      Boolean(match.winner) ||
                      ["finalised", "completed", "walkover", "disqualified", "retired_both"].includes(
                        String(match.status ?? ""),
                      ),
                  ).length ?? 0;

                return (
                  <article
                    key={round.roundNumber}
                    className={`tournament-lineup-round-card ${
                      isCurrentRound ? "tournament-lineup-round-card--current" : ""
                    }`}
                  >
                    <div className="tournament-lineup-round-header">
                      <strong>{round.title}</strong>
                      {isCurrentRound ? (
                        <span className="tournament-lineup-round-badge">Current round</span>
                      ) : null}
                    </div>
                    <div className="tournament-lineup-round-meta">
                      <span>Round {round.roundNumber}</span>
                      <span>
                        {matchCount} match{matchCount === 1 ? "" : "es"}
                      </span>
                      <span>{resolvedMatches} resolved</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>The line up will appear once enough competitors are registered.</p>
          )}
        </section>
      </div>

      <section className="tournament-bracket-card tournament-lineup-panel">
        <div className="tournament-lineup-panel-header">
          <h4>Tournament Progress</h4>
          <span>
            {tournament?.bracket?.winner
              ? `Winner: ${tournament.bracket.winner.fullName}`
              : "Winner pending"}
          </span>
        </div>
        {!tournament?.bracketReady ? (
          <p>
            The tournament bracket graphic will be generated once registration closes on{" "}
            {formatDate(tournament?.registrationWindow?.endDate)}.
          </p>
        ) : tournament?.bracket?.rounds?.length ? (
          bracketGraphic
        ) : (
          <p>The bracket will appear once enough competitors are registered.</p>
        )}
      </section>
    </section>
  );
}

export function TournamentsPage({
  currentUserProfile,
  onTournamentActivity,
  showSetupForm = false,
  tournamentCrud,
}) {
  const isMobile = useIsMobile();
  const today = new Date().toISOString().slice(0, 10);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentTypes, setTournamentTypes] = useState([]);
  const [tournamentTemplates, setTournamentTemplates] = useState<
    TournamentTemplateOption[]
  >([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [scoreValue, setScoreValue] = useState("");
  const [matchScoreAValue, setMatchScoreAValue] = useState("");
  const [matchScoreBValue, setMatchScoreBValue] = useState("");
  const [matchCompetitorARetired, setMatchCompetitorARetired] = useState(false);
  const [matchCompetitorBRetired, setMatchCompetitorBRetired] = useState(false);
  const [matchDisputeReason, setMatchDisputeReason] = useState("");
  const [selectedRegistrationBowCode, setSelectedRegistrationBowCode] = useState("");
  const [registrationCandidates, setRegistrationCandidates] = useState<
    TournamentRegistrationCandidate[]
  >([]);
  const [selectedCaptainRegistrationUsername, setSelectedCaptainRegistrationUsername] =
    useState("");
  const [selectedCaptainRegistrationBowCode, setSelectedCaptainRegistrationBowCode] =
    useState("");
  const [isCaptainRegistrationModalOpen, setIsCaptainRegistrationModalOpen] =
    useState(false);
  const [isCaptainRemovalModalOpen, setIsCaptainRemovalModalOpen] = useState(false);
  const [selectedCaptainRemovalUsername, setSelectedCaptainRemovalUsername] = useState("");
  const [pendingRetirementConfirmation, setPendingRetirementConfirmation] = useState<
    "competitorA" | "competitorB" | null
  >(null);
  const [captainDecisionNotes, setCaptainDecisionNotes] = useState<Record<string, string>>({});
  const [captainDecisionErrors, setCaptainDecisionErrors] = useState<Record<string, string>>({});
  const [captainOverrideScores, setCaptainOverrideScores] = useState<
    Record<string, { leftScore: string; rightScore: string }>
  >({});
  const [form, setForm] = useState(createEmptyTournamentForm(today));
  const [createForm, setCreateForm] = useState(createEmptyTournamentForm(today));
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTournaments, setHasLoadedTournaments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [isApplyingCaptainDecision, setIsApplyingCaptainDecision] = useState(false);
  const [isLoadingRegistrationCandidates, setIsLoadingRegistrationCandidates] =
    useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isEditingTournament, setIsEditingTournament] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [isTournamentLineUpOpen, setIsTournamentLineUpOpen] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState(() =>
    createEmptyTemplateForm(),
  );
  const [editSetupStepIndex, setEditSetupStepIndex] = useState(0);
  const [createSetupStepIndex, setCreateSetupStepIndex] = useState(0);
  const createModalFormRef = useRef<HTMLFormElement | null>(null);
  const editWizardRef = useRef<HTMLFormElement | null>(null);

  const canManageTournaments = hasPermission(
    currentUserProfile,
    "manage_tournaments",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const registrationBowOptions = useMemo(
    () =>
      TOURNAMENT_BOW_OPTIONS.filter((option) =>
        (currentUserProfile?.membership?.disciplines ?? []).includes(option.discipline),
      ),
    [currentUserProfile?.membership?.disciplines],
  );
  const selectedCaptainRegistrationCandidate = useMemo(
    () =>
      registrationCandidates.find(
        (candidate) => candidate.username === selectedCaptainRegistrationUsername,
      ) ?? null,
    [registrationCandidates, selectedCaptainRegistrationUsername],
  );
  const registrationCandidateOptions = useMemo(
    () =>
      registrationCandidates.map((candidate) => ({
        keywords: [candidate.username],
        label: candidate.fullName,
        value: candidate.username,
      })),
    [registrationCandidates],
  );
  const captainRegistrationBowOptions = useMemo(() => {
    if (!selectedCaptainRegistrationCandidate) {
      return [];
    }

    return selectedCaptainRegistrationCandidate.bowOptions.length > 0
      ? selectedCaptainRegistrationCandidate.bowOptions
      : TOURNAMENT_BOW_OPTIONS;
  }, [selectedCaptainRegistrationCandidate]);

  useEffect(() => {
    if (registrationBowOptions.length === 1) {
      setSelectedRegistrationBowCode(registrationBowOptions[0].code);
      return;
    }

    setSelectedRegistrationBowCode((current) =>
      registrationBowOptions.some((option) => option.code === current) ? current : "",
    );
  }, [registrationBowOptions]);

  useEffect(() => {
    if (!selectedCaptainRegistrationCandidate) {
      setSelectedCaptainRegistrationBowCode("");
      return;
    }

    if (captainRegistrationBowOptions.length === 1) {
      setSelectedCaptainRegistrationBowCode(
        captainRegistrationBowOptions[0].code,
      );
      return;
    }

    setSelectedCaptainRegistrationBowCode((current) => {
      if (captainRegistrationBowOptions.some((option) => option.code === current)) {
        return current;
      }

      if (
        selectedCaptainRegistrationCandidate.suggestedBowCode &&
        captainRegistrationBowOptions.some(
          (option) =>
            option.code === selectedCaptainRegistrationCandidate.suggestedBowCode,
        )
      ) {
        return selectedCaptainRegistrationCandidate.suggestedBowCode;
      }

      return "";
    });
  }, [captainRegistrationBowOptions, selectedCaptainRegistrationCandidate]);

  const loadTournaments = useCallback(async () => {
    if (!hasLoadedTournaments) {
      setIsLoading(true);
    }
    setError("");

    try {
      const result = await tournamentCrud.listTournamentsUseCase.execute({
        actorUsername,
      });

      setTournaments(result.tournaments ?? []);
      setTournamentTypes(result.tournamentTypes ?? []);
      setTournamentTemplates(result.tournamentTemplates ?? []);
      setForm((current) => {
        const nextDefaultTemplate = getDefaultTournamentTemplate(
          result.tournamentTemplates ?? [],
        );
        const nextDefaultType = result.tournamentTypes?.[0]?.value ?? "portsmouth";
        const normalizedTemplateKey =
          current.templateKey &&
          result.tournamentTemplates?.some(
            (option) => option.key === current.templateKey,
          )
            ? current.templateKey
            : (nextDefaultTemplate?.key ?? "");
        const selectedTemplate = getTemplateForKey(
          result.tournamentTemplates ?? [],
          normalizedTemplateKey,
        );

        return {
          ...current,
          templateKey: normalizedTemplateKey,
          tournamentType:
            selectedTemplate?.tournamentType ??
            (result.tournamentTypes?.some(
              (option) => option.value === current.tournamentType,
            )
              ? current.tournamentType
              : nextDefaultType),
        };
      });
      setCreateForm((current) => {
        const nextDefaultTemplate = getDefaultTournamentTemplate(
          result.tournamentTemplates ?? [],
        );
        const nextDefaultType = result.tournamentTypes?.[0]?.value ?? "portsmouth";
        const normalizedTemplateKey =
          current.templateKey &&
          result.tournamentTemplates?.some(
            (option) => option.key === current.templateKey,
          )
            ? current.templateKey
            : (nextDefaultTemplate?.key ?? "");
        const selectedTemplate = getTemplateForKey(
          result.tournamentTemplates ?? [],
          normalizedTemplateKey,
        );

        return {
          ...current,
          templateKey: normalizedTemplateKey,
          tournamentType:
            selectedTemplate?.tournamentType ??
            (result.tournamentTypes?.some(
              (option) => option.value === current.tournamentType,
            )
              ? current.tournamentType
              : nextDefaultType),
        };
      });
      setSelectedTournamentId((current) => {
        if (current && result.tournaments?.some((item) => item.id === current)) {
          return current;
        }

        return result.tournaments?.[0]?.id ?? null;
      });
      setHasLoadedTournaments(true);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [actorUsername, hasLoadedTournaments, tournamentCrud]);

  useEffect(() => {
    loadTournaments();
  }, [currentUserProfile?.auth?.username, loadTournaments]);

  useEffect(() => {
    return subscribeToServerEvent("tournaments.updated", () => {
      void loadTournaments();
    });
  }, [loadTournaments]);

  useSseFallbackPolling({
    callback: () => {
      void loadTournaments();
    },
    enabled: Boolean(actorUsername),
    source: "tournaments-page",
  });

  const activeTournaments = useMemo(
    () =>
      (tournaments as TournamentRecord[]).filter(
        (tournament) => !isTournamentArchived(tournament, today),
      ),
    [today, tournaments],
  );
  const archivedTournaments = useMemo(
    () =>
      (tournaments as TournamentRecord[]).filter((tournament) =>
        isTournamentArchived(tournament, today),
      ),
    [today, tournaments],
  );
  const selectedTournament = useMemo(
    () =>
      (tournaments as TournamentRecord[]).find(
        (tournament) => tournament.id === selectedTournamentId,
      ) ??
      activeTournaments[0] ??
      archivedTournaments[0] ??
      null,
    [activeTournaments, archivedTournaments, selectedTournamentId, tournaments],
  );
  const removalCandidates = useMemo(
    () => selectedTournament?.registrations ?? [],
    [selectedTournament?.registrations],
  );
  useEffect(() => {
    if (!canManageTournaments || !selectedTournament?.registrationWindow?.isOpen) {
      setRegistrationCandidates([]);
      setSelectedCaptainRegistrationUsername("");
      setSelectedCaptainRegistrationBowCode("");
      setIsLoadingRegistrationCandidates(false);
      return;
    }

    let isActive = true;
    setIsLoadingRegistrationCandidates(true);

    void fetchApi<{ success: true; members?: TournamentRegistrationCandidate[] }>(
      `/api/tournaments/${selectedTournament.id}/registration-candidates`,
      {
        headers: buildActorHeaders(actorUsername),
        cache: "no-store",
      },
    )
      .then((result) => {
        if (!isActive) {
          return;
        }

        const nextCandidates = result.members ?? [];
        setRegistrationCandidates(nextCandidates);
        setSelectedCaptainRegistrationUsername((current) =>
          nextCandidates.some((candidate) => candidate.username === current)
            ? current
            : "",
        );
      })
      .catch((loadError: Error) => {
        if (!isActive) {
          return;
        }

        setRegistrationCandidates([]);
        setSelectedCaptainRegistrationUsername("");
        setSelectedCaptainRegistrationBowCode("");
        setError(loadError.message);
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingRegistrationCandidates(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    actorUsername,
    canManageTournaments,
    selectedTournament?.id,
    selectedTournament?.registrationCount,
    selectedTournament?.registrationWindow?.isOpen,
  ]);
  const selectedEditTemplate = useMemo(
    () => getTemplateForKey(tournamentTemplates, form.templateKey),
    [form.templateKey, tournamentTemplates],
  );
  const selectedCreateTemplate = useMemo(
    () => getTemplateForKey(tournamentTemplates, createForm.templateKey),
    [createForm.templateKey, tournamentTemplates],
  );
  const selectedBaseTemplate = useMemo(
    () => getTemplateForKey(tournamentTemplates, templateForm.baseTemplateKey),
    [templateForm.baseTemplateKey, tournamentTemplates],
  );
  const currentEditStep =
    TOURNAMENT_SETUP_STEPS[editSetupStepIndex] ?? TOURNAMENT_SETUP_STEPS[0];
  const currentCreateStep =
    TOURNAMENT_SETUP_STEPS[createSetupStepIndex] ?? TOURNAMENT_SETUP_STEPS[0];

  const registrationStatusText = selectedTournament
    ? selectedTournament.isRegistered
      ? "You are registered for this tournament."
      : selectedTournament.registrationWindow.isOpen
        ? "Registration is open."
        : selectedTournament.registrationWindow.isClosed
          ? "Registration has closed."
          : `Registration opens on ${formatDate(selectedTournament.registrationWindow.startDate)}.`
    : "";
  const actorRegistrationEligibilityReason =
    selectedTournament?.eligibility?.actor?.registration?.isEligible === false
      ? selectedTournament.eligibility.actor.registration.reason ?? ""
      : "";
  const actorRoundEligibilityReason =
    selectedTournament?.eligibility?.actor?.currentRound?.isEligible === false
      ? selectedTournament.eligibility.actor.currentRound.reason ?? ""
      : "";
  const pendingRetirementCompetitorName =
    pendingRetirementConfirmation === "competitorA"
      ? selectedTournament?.currentMatch?.competitorA?.fullName ?? "this archer"
      : pendingRetirementConfirmation === "competitorB"
        ? selectedTournament?.currentMatch?.competitorB?.fullName ?? "this archer"
        : "this archer";

  useEffect(() => {
    if (selectedTournament) {
      setScoreValue(
        typeof selectedTournament.actorScore === "number"
          ? String(selectedTournament.actorScore)
          : "",
      );
      setMatchScoreAValue(
        typeof selectedTournament.currentMatch?.score?.competitorA === "number"
          ? String(selectedTournament.currentMatch.score.competitorA)
          : "",
      );
      setMatchScoreBValue(
        typeof selectedTournament.currentMatch?.score?.competitorB === "number"
          ? String(selectedTournament.currentMatch.score.competitorB)
          : "",
      );
      const retirementFlags = getTournamentRetirementFlags(selectedTournament.currentMatch);
      setMatchCompetitorARetired(retirementFlags.competitorA);
      setMatchCompetitorBRetired(retirementFlags.competitorB);
      setMatchDisputeReason("");
    }
  }, [selectedTournament]);

  useEffect(() => {
    if (!selectedTournament) {
      return;
    }

    setCaptainDecisionNotes({});
    setCaptainDecisionErrors({});
    setCaptainOverrideScores(
      Object.fromEntries(
        (
          selectedTournament.engine?.matches?.map((match) => [
            String(match.id),
            {
              leftScore:
                typeof match.score?.competitorA === "number"
                  ? String(match.score.competitorA)
                  : "",
              rightScore:
                typeof match.score?.competitorB === "number"
                  ? String(match.score.competitorB)
                  : "",
            },
          ]) ?? []
        ),
      ),
    );
  }, [selectedTournament?.id]);

  useEffect(() => {
    if (!showSetupForm || !canManageTournaments) {
      return;
    }

    if (isEditingTournament && selectedTournament) {
      setForm({
        name: selectedTournament.name,
        templateKey: selectedTournament.templateKey ?? "",
        tournamentType: selectedTournament.type,
        roundOneStartDate:
          selectedTournament.roundOneStartDate ??
          selectedTournament.roundSchedule?.[0]?.publishDate ??
          today,
        roundWindowDays: Number(selectedTournament.roundWindowDays ?? 14),
        roundRestDays: Number(selectedTournament.roundRestDays ?? 0),
        registrationStartDate: selectedTournament.registrationWindow.startDate,
        registrationEndDate: selectedTournament.registrationWindow.endDate,
      });
      setEditSetupStepIndex(0);
      return;
    }

    setForm(
      createEmptyTournamentForm(
        today,
        tournamentTypes[0]?.value ?? "portsmouth",
        getDefaultTournamentTemplate(tournamentTemplates)?.key ?? "",
      ),
    );
  }, [
    canManageTournaments,
    isEditingTournament,
    selectedTournament,
    showSetupForm,
    today,
    tournamentTemplates,
    tournamentTypes,
  ]);

  const updateTournamentInState = (updatedTournament) => {
    setTournaments((current) => {
      const exists = current.some((item) => item.id === updatedTournament.id);
      const next = exists
        ? current.map((item) =>
            item.id === updatedTournament.id ? updatedTournament : item,
          )
        : [updatedTournament, ...current];

      return next;
    });
    setSelectedTournamentId(updatedTournament.id);
  };

  useEffect(() => {
    if (
      selectedTournament &&
      archivedTournaments.some((tournament) => tournament.id === selectedTournament.id)
    ) {
      setIsArchiveExpanded(true);
    }
  }, [archivedTournaments, selectedTournament]);

  useEffect(() => {
    setIsTournamentLineUpOpen(false);
  }, [selectedTournament?.id]);

  useEffect(() => {
    setIsTournamentLineUpOpen(false);
  }, [selectedTournament?.id]);

  const resetTournamentForm = () => {
    setIsEditingTournament(false);
    setForm(
      createEmptyTournamentForm(
        today,
        tournamentTypes[0]?.value ?? "portsmouth",
        getDefaultTournamentTemplate(tournamentTemplates)?.key ?? "",
      ),
    );
    setEditSetupStepIndex(0);
  };

  const resetCreateForm = () => {
    setCreateForm(
      createEmptyTournamentForm(
        today,
        tournamentTypes[0]?.value ?? "portsmouth",
        getDefaultTournamentTemplate(tournamentTemplates)?.key ?? "",
      ),
    );
    setCreateSetupStepIndex(0);
  };

  const resetTemplateForm = (baseTemplateKey?: string) => {
    const nextForm = createEmptyTemplateForm(tournamentTemplates);

    if (!baseTemplateKey) {
      setTemplateForm(nextForm);
      return;
    }

    const baseTemplate = getTemplateForKey(tournamentTemplates, baseTemplateKey);

    if (!baseTemplate) {
      setTemplateForm(nextForm);
      return;
    }

    setTemplateForm({
      ...nextForm,
      baseTemplateKey: baseTemplate.key,
      description: baseTemplate.description ?? "",
      resultWorkflow: baseTemplate.defaults?.resultWorkflow ?? "single-submit",
      handicapAllowancePercent:
        typeof baseTemplate.defaults?.handicapAllowancePercent === "number"
          ? String(baseTemplate.defaults.handicapAllowancePercent)
          : "",
      defaultRoundNames: (baseTemplate.defaults?.defaultRoundNames ?? []).join(", "),
      supportsRandomizedDraw:
        baseTemplate.capabilities?.supportsRandomizedDraw ?? false,
      supportsHighestLoserProgression:
        baseTemplate.capabilities?.supportsHighestLoserProgression ?? false,
      supportsRoundDeadlines:
        baseTemplate.capabilities?.supportsRoundDeadlines ?? false,
      supportsMatchConfirmation:
        baseTemplate.capabilities?.supportsMatchConfirmation ?? false,
      supportsEligibilityRules:
        baseTemplate.capabilities?.supportsEligibilityRules ?? false,
      supportsHandicapAdjustments:
        baseTemplate.capabilities?.supportsHandicapAdjustments ?? false,
      handicapQualificationRoundsRequired: String(
        baseTemplate.eligibilityRules?.handicapQualificationRoundsRequired ?? 3,
      ),
      qualifyingRoundsRequiredPerKnockoutRound: String(
        baseTemplate.eligibilityRules?.qualifyingRoundsRequiredPerKnockoutRound ?? 1,
      ),
      qualifyingRoundDiscipline:
        baseTemplate.eligibilityRules?.qualifyingRoundDiscipline ?? "indoor",
    });
  };

  const openCreateModal = () => {
    resetCreateForm();
    setIsCreateModalOpen(true);
  };

  const openTemplateModal = (baseTemplateKey?: string) => {
    setError("");
    setMessage("");
    resetTemplateForm(baseTemplateKey);
    setIsTemplateModalOpen(true);
  };

  const closeTemplateModal = () => {
    if (isSavingTemplate) {
      return;
    }

    setIsTemplateModalOpen(false);
    resetTemplateForm();
  };

  useEffect(() => {
    if (!isTemplateModalOpen) {
      return;
    }

    if (
      templateForm.baseTemplateKey &&
      tournamentTemplates.some(
        (template) => template.key === templateForm.baseTemplateKey,
      )
    ) {
      return;
    }

    resetTemplateForm();
  }, [isTemplateModalOpen, templateForm.baseTemplateKey, tournamentTemplates]);

  const closeCreateModal = () => {
    if (isSaving) {
      return;
    }

    setIsCreateModalOpen(false);
    resetCreateForm();
  };

  const handleCreateTournament = async () => {
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.createTournamentUseCase.execute({
        actorUsername,
        form: createForm,
      });

      updateTournamentInState(result.tournament);
      setMessage("Tournament created successfully.");
      setIsCreateModalOpen(false);
      resetCreateForm();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!selectedBaseTemplate) {
      setError("Choose a base template first.");
      return;
    }

    setIsSavingTemplate(true);
    setError("");
    setMessage("");

    try {
      const handicapAllowanceValue = templateForm.handicapAllowancePercent.trim();
      const defaultRoundNames = templateForm.defaultRoundNames
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const result = await tournamentCrud.createTournamentTemplateUseCase.execute({
        actorUsername,
        form: {
          label: templateForm.label,
          description: templateForm.description,
          baseTemplateKey: templateForm.baseTemplateKey,
          defaults: {
            ...selectedBaseTemplate.defaults,
            resultWorkflow: templateForm.resultWorkflow,
            handicapAllowancePercent: handicapAllowanceValue
              ? Number.parseInt(handicapAllowanceValue, 10)
              : null,
            defaultRoundNames,
          },
          capabilities: {
            ...selectedBaseTemplate.capabilities,
            supportsRandomizedDraw: templateForm.supportsRandomizedDraw,
            supportsHighestLoserProgression:
              templateForm.supportsHighestLoserProgression,
            supportsRoundDeadlines: templateForm.supportsRoundDeadlines,
            supportsMatchConfirmation: templateForm.supportsMatchConfirmation,
            supportsEligibilityRules: templateForm.supportsEligibilityRules,
            supportsHandicapAdjustments: templateForm.supportsHandicapAdjustments,
          },
          eligibilityRules: templateForm.supportsEligibilityRules
            ? {
                handicapQualificationRoundsRequired: Number.parseInt(
                  templateForm.handicapQualificationRoundsRequired,
                  10,
                ),
                qualifyingRoundsRequiredPerKnockoutRound: Number.parseInt(
                  templateForm.qualifyingRoundsRequiredPerKnockoutRound,
                  10,
                ),
                qualifyingRoundDiscipline: templateForm.qualifyingRoundDiscipline,
              }
            : null,
        },
      });

      const nextTemplates = result.tournamentTemplates ?? tournamentTemplates;
      const createdTemplateKey = result.tournamentTemplate?.key ?? "";
      setTournamentTemplates(nextTemplates);
      if (createdTemplateKey) {
        setForm((current) => ({ ...current, templateKey: createdTemplateKey }));
        setCreateForm((current) => ({ ...current, templateKey: createdTemplateKey }));
      }
      setMessage(`Template ${result.tournamentTemplate?.label ?? "created"} saved.`);
      setIsTemplateModalOpen(false);
      resetTemplateForm();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleUpdateTournament = async () => {
    if (!selectedTournament) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.updateTournamentUseCase.execute({
        actorUsername,
        tournamentId: selectedTournament.id,
        form,
      });

      updateTournamentInState(result.tournament);
      setMessage("Tournament updated successfully.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTournament = async () => {
    if (!selectedTournament) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedTournament.name}? This will remove its registrations, scores, and bracket progress.`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.deleteTournamentUseCase.execute({
        actorUsername,
        tournamentId: selectedTournament.id,
      });

      let nextSelectedTournamentId = null;

      setTournaments((current) => {
        const remainingTournaments = current.filter(
          (item) => item.id !== result.deletedTournamentId,
        );
        nextSelectedTournamentId = remainingTournaments[0]?.id ?? null;
        return remainingTournaments;
      });
      setSelectedTournamentId(nextSelectedTournamentId);
      resetTournamentForm();
      setMessage(result.message ?? "Tournament deleted successfully.");
      onTournamentActivity?.();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegister = async () => {
    if (!selectedTournament) {
      return;
    }

    if (registrationBowOptions.length > 1 && !selectedRegistrationBowCode) {
      setError("Choose which bow you will be shooting with before you register.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.registerForTournamentUseCase.execute({
        actorUsername,
        bowCode:
          registrationBowOptions.length === 1
            ? registrationBowOptions[0].code
            : selectedRegistrationBowCode,
        tournamentId: selectedTournament.id,
      });

      updateTournamentInState(result.tournament);
      setMessage(`Registered for ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCaptainRegisterAction = async ({
    closeAfterSuccess,
  }: {
    closeAfterSuccess: boolean;
  }) => {
    if (!selectedTournament || !selectedCaptainRegistrationCandidate) {
      setError("Choose a member before adding them.");
      return false;
    }

    if (
      captainRegistrationBowOptions.length > 1 &&
      !selectedCaptainRegistrationBowCode
    ) {
      setError("Choose which bow this member will be shooting with before you add them.");
      return false;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.registerForTournamentUseCase.execute({
        actorUsername,
        bowCode:
          captainRegistrationBowOptions.length === 1
            ? captainRegistrationBowOptions[0].code
            : selectedCaptainRegistrationBowCode ||
              selectedCaptainRegistrationCandidate.suggestedBowCode ||
              undefined,
        memberUsername: selectedCaptainRegistrationCandidate.username,
        tournamentId: selectedTournament.id,
      });

      updateTournamentInState(result.tournament);
      setMessage(
        `Added ${selectedCaptainRegistrationCandidate.fullName} to ${result.tournament.name}.`,
      );
      setSelectedCaptainRegistrationUsername("");
      setSelectedCaptainRegistrationBowCode("");
      if (closeAfterSuccess) {
        setIsCaptainRegistrationModalOpen(false);
        onTournamentActivity?.();
      }
      return true;
    } catch (registerError) {
      setError(registerError.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCaptainRegister = async () =>
    handleCaptainRegisterAction({ closeAfterSuccess: true });

  const handleCaptainRegisterAndContinue = async () =>
    handleCaptainRegisterAction({ closeAfterSuccess: false });

  const openCaptainRegistrationModal = () => {
    setError("");
    setMessage("");
    setSelectedCaptainRegistrationUsername("");
    setSelectedCaptainRegistrationBowCode("");
    setIsCaptainRegistrationModalOpen(true);
  };

  const closeCaptainRegistrationModal = () => {
    setSelectedCaptainRegistrationUsername("");
    setSelectedCaptainRegistrationBowCode("");
    setIsCaptainRegistrationModalOpen(false);
  };

  const handleWithdraw = async () => {
    if (!selectedTournament) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.withdrawFromTournamentUseCase.execute({
        actorUsername,
        tournamentId: selectedTournament.id,
      });

      updateTournamentInState(result.tournament);
      setMessage(`Withdrawn from ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (withdrawError) {
      setError(withdrawError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRedrawTournament = async () => {
    if (!selectedTournament || !canManageTournaments) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.redrawTournamentUseCase.execute({
        actorUsername,
        tournamentId: selectedTournament.id,
      });
      setTournaments((current) =>
        current.map((tournament) =>
          tournament.id === result.tournament?.id ? result.tournament : tournament,
        ),
      );
      setMessage(`Redrew the round 1 pairings for ${result.tournament.name}.`);
    } catch (redrawError) {
      setError(redrawError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCaptainRemoveMember = async () => {
    if (!selectedTournament || !selectedCaptainRemovalUsername) {
      setError("Choose a member before removing them.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const memberLabel =
        removalCandidates.find(
          (candidate) => candidate.username === selectedCaptainRemovalUsername,
        )?.fullName ?? selectedCaptainRemovalUsername;
      const result = await tournamentCrud.withdrawFromTournamentUseCase.execute({
        actorUsername,
        memberUsername: selectedCaptainRemovalUsername,
        tournamentId: selectedTournament.id,
      });

      updateTournamentInState(result.tournament);
      setSelectedCaptainRemovalUsername("");
      setIsCaptainRemovalModalOpen(false);
      setMessage(`Removed ${memberLabel} from ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (withdrawError) {
      setError(withdrawError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openCaptainRemovalModal = () => {
    setError("");
    setMessage("");
    setSelectedCaptainRemovalUsername("");
    setIsCaptainRemovalModalOpen(true);
  };

  const closeCaptainRemovalModal = () => {
    setSelectedCaptainRemovalUsername("");
    setIsCaptainRemovalModalOpen(false);
  };

  const handleMatchRetirementChange = (
    competitor: "competitorA" | "competitorB",
    nextChecked: boolean,
  ) => {
    if (!nextChecked) {
      if (competitor === "competitorA") {
        setMatchCompetitorARetired(false);
      } else {
        setMatchCompetitorBRetired(false);
      }

      return;
    }

    setPendingRetirementConfirmation(competitor);
  };

  const closeRetirementConfirmationModal = () => {
    setPendingRetirementConfirmation(null);
  };

  const confirmRetirementChange = () => {
    if (pendingRetirementConfirmation === "competitorA") {
      setMatchCompetitorARetired(true);
      setMatchScoreAValue("");
    } else if (pendingRetirementConfirmation === "competitorB") {
      setMatchCompetitorBRetired(true);
      setMatchScoreBValue("");
    }

    setPendingRetirementConfirmation(null);
  };

  const handleSubmitScore = async (event) => {
    event.preventDefault();

    if (!selectedTournament) {
      return;
    }

    setIsSubmittingScore(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.submitTournamentScoreUseCase.execute({
        actorUsername,
        tournamentId: selectedTournament.id,
        scoreSubmission: { score: scoreValue },
      });

      updateTournamentInState(result.tournament);
      setMessage(`Score saved for ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleSubmitMatchResult = async (event) => {
    event.preventDefault();

    if (!selectedTournament?.currentMatch) {
      return;
    }

    setIsSubmittingScore(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.submitTournamentMatchResultUseCase.execute({
        actorUsername,
        matchId: String(selectedTournament.currentMatch.id),
        payload: {
          leftRetired: matchCompetitorARetired,
          rightRetired: matchCompetitorBRetired,
          leftScore: matchCompetitorARetired ? "" : matchScoreAValue,
          rightScore: matchCompetitorBRetired ? "" : matchScoreBValue,
        },
      });

      updateTournamentInState(result.tournament);
      setMessage(
        result.match?.workflow?.requiresOpponentConfirmation
          ? `Result submitted for ${result.tournament.name}. It is now waiting for opponent confirmation.`
          : `Result saved for ${result.tournament.name}.`,
      );
      onTournamentActivity?.();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleConfirmMatchResult = async () => {
    if (!selectedTournament?.currentMatch) {
      return;
    }

    setIsSubmittingScore(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.confirmTournamentMatchResultUseCase.execute({
        actorUsername,
        matchId: String(selectedTournament.currentMatch.id),
      });

      updateTournamentInState(result.tournament);
      setMessage(`Result confirmed for ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (confirmError) {
      setError(confirmError.message);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleDisputeMatchResult = async (event) => {
    event.preventDefault();

    if (!selectedTournament?.currentMatch) {
      return;
    }

    setIsSubmittingScore(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.disputeTournamentMatchResultUseCase.execute({
        actorUsername,
        matchId: String(selectedTournament.currentMatch.id),
        payload: {
          reason: matchDisputeReason,
        },
      });

      updateTournamentInState(result.tournament);
      setMessage(
        `Dispute raised for ${result.tournament.name}. This match now needs captain review.`,
      );
      onTournamentActivity?.();
    } catch (disputeError) {
      setError(disputeError.message);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleCaptainMatchDecision = async ({
    action,
    leftScoreOverride = "",
    match,
    rightScoreOverride = "",
    winnerUsername,
  }) => {
    if (!match?.id || !winnerUsername) {
      return;
    }

    const decisionReason = String(captainDecisionNotes[String(match.id)] ?? "").trim();

    if (!decisionReason) {
      setCaptainDecisionErrors((current) => ({
        ...current,
        [String(match.id)]: "Enter a captain decision note before using these actions.",
      }));
      return;
    }

    setIsApplyingCaptainDecision(true);
    setError("");
    setMessage("");
    setCaptainDecisionErrors((current) => ({
      ...current,
      [String(match.id)]: "",
    }));

    try {
      const result = await tournamentCrud.overrideTournamentMatchResultUseCase.execute({
        actorUsername,
        matchId: String(match.id),
        payload: {
          action,
          leftScore:
            action === "override" && String(leftScoreOverride).trim()
              ? leftScoreOverride
              : undefined,
          rightScore:
            action === "override" && String(rightScoreOverride).trim()
              ? rightScoreOverride
              : undefined,
          winnerUsername,
          reason: decisionReason,
        },
      });

      updateTournamentInState(result.tournament);
      setCaptainDecisionNotes((current) => ({
        ...current,
        [String(match.id)]: "",
      }));
      setCaptainDecisionErrors((current) => ({
        ...current,
        [String(match.id)]: "",
      }));
      setMessage(`Captain decision saved for ${result.tournament.name}.`);
      onTournamentActivity?.();
    } catch (decisionError) {
      setError(decisionError.message);
    } finally {
      setIsApplyingCaptainDecision(false);
    }
  };

  const handleSaveCompetitorList = async () => {
    if (!selectedTournament) {
      return;
    }

    const content = buildTournamentCompetitorExport(selectedTournament);
    const suggestedName = `${sanitizeFileNameSegment(selectedTournament.name)}-competitors.txt`;

    try {
      if ("showSaveFilePicker" in window) {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: "Text files",
              accept: {
                "text/plain": [".txt"],
              },
            },
          ],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setMessage("Competitor list saved.");
        setError("");
        return;
      }

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      setMessage(
        "Competitor list downloaded. Your browser did not offer a full Save As location picker.",
      );
      setError("");
    } catch (saveError) {
      if (saveError?.name === "AbortError") {
        return;
      }

      setError("Unable to save the competitor list.");
    }
  };

  const moveToNextSetupStep = ({
    formState,
    selectedTemplate,
    currentStepIndex,
    setStepIndex,
    formRef = null,
  }) => {
    const step = TOURNAMENT_SETUP_STEPS[currentStepIndex];
    const validationMessage = getTournamentSetupValidationMessage({
      form: formState,
      selectedTemplate,
      stepKey: step.key,
      tournamentTypes,
    });

    if (validationMessage) {
      setError(validationMessage);
      setMessage("");
      formRef?.current?.scrollTo?.({ top: 0, behavior: "smooth" });
      return;
    }

    setError("");
    setStepIndex((current) =>
      Math.min(current + 1, TOURNAMENT_SETUP_STEPS.length - 1),
    );
    formRef?.current?.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const moveToPreviousSetupStep = (setStepIndex) => {
    setError("");
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const captainOperationMatches = selectedTournament
    ? [
        ...(selectedTournament.engine?.rounds?.find(
          (round) => round.roundNumber === selectedTournament.currentRoundNumber,
        )?.matches ?? []),
        ...((selectedTournament.engine?.matches ?? []).filter(
          (match) => match.status === "disputed",
        ) ?? []),
      ].filter(
        (match, index, matches) =>
          match.competitorA &&
          match.competitorB &&
          matches.findIndex((candidate) => candidate.id === match.id) === index,
      )
    : [];

  const captainOperationsContent =
    canManageTournaments && captainOperationMatches.length > 0 ? (
      <div className="tournament-registrations-card">
        <details className="tournament-captain-operations-details">
          <summary className="tournament-captain-operations-summary">
            <span>Captain Operations</span>
            <span>{captainOperationMatches.length} match{captainOperationMatches.length === 1 ? "" : "es"}</span>
          </summary>
          <p>
            Resolve active or disputed matches with a recorded reason. Decisions are
            written into the bracket and logged for audit review.
          </p>
          <div className="tournament-captain-operations-list">
            {captainOperationMatches.map((match) => (
              <div key={`captain-op-${match.id}`} className="tournament-score-card">
                {(() => {
                  const handicapSummary = getTournamentMatchHandicapSummary(match);

                  return (
                    <div className="tournament-captain-card-layout">
                      <div className="tournament-captain-editor">
                        <p>
                          <strong>{match.roundTitle}</strong>
                        </p>
                        <p>
                          {formatTournamentParticipantName(match.competitorA)} vs{" "}
                          {formatTournamentParticipantName(match.competitorB)}
                        </p>
                        <p>Status: {formatTournamentMatchStatus(match.status)}</p>
                        {match.submissionDeadline ? (
                          <p>Deadline: {formatDate(match.submissionDeadline)}</p>
                        ) : null}
                        {handicapSummary?.rawScoreText ? (
                          <p>Score: {handicapSummary.rawScoreText}</p>
                        ) : null}
                        {handicapSummary?.handicapScoreText ? (
                          <p>
                            Handicap score
                            {typeof handicapSummary.allowancePercent === "number"
                              ? ` (${handicapSummary.allowancePercent}%)`
                              : ""}
                            : {handicapSummary.handicapScoreText}
                          </p>
                        ) : null}
                        {handicapSummary?.totalScoreText ? (
                          <p>Total score: {handicapSummary.totalScoreText}</p>
                        ) : null}
                        {match.workflow?.disputeReason ? (
                          <p>Member dispute: {match.workflow.disputeReason}</p>
                        ) : null}
                        <div className="tournament-field-group">
                          <label
                            className="tournament-field-label"
                            htmlFor={`captain-decision-note-${match.id}`}
                          >
                            Captain decision note
                          </label>
                          <textarea
                            id={`captain-decision-note-${match.id}`}
                            value={captainDecisionNotes[String(match.id)] ?? ""}
                            onChange={(event) =>
                              {
                                const nextValue = event.target.value;

                                setCaptainDecisionNotes((current) => ({
                                  ...current,
                                  [String(match.id)]: nextValue,
                                }));
                                setCaptainDecisionErrors((current) => ({
                                  ...current,
                                  [String(match.id)]: nextValue.trim()
                                    ? ""
                                    : current[String(match.id)] ?? "",
                                }));
                              }
                            }
                            rows={3}
                            placeholder="Record why this decision was made."
                          />
                        </div>
                        {captainDecisionErrors[String(match.id)] ? (
                          <p className="profile-error">
                            {captainDecisionErrors[String(match.id)]}
                          </p>
                        ) : null}
                        <div className="tournament-captain-score-grid">
                          <label>
                            Override {match.competitorA?.fullName ?? "A"} score
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={captainOverrideScores[String(match.id)]?.leftScore ?? ""}
                              onChange={(event) =>
                                setCaptainOverrideScores((current) => ({
                                  ...current,
                                  [String(match.id)]: {
                                    leftScore: event.target.value,
                                    rightScore:
                                      current[String(match.id)]?.rightScore ??
                                      (typeof match.score?.competitorB === "number"
                                        ? String(match.score.competitorB)
                                        : ""),
                                  },
                                }))
                              }
                              placeholder="Optional for override"
                            />
                          </label>
                          <label>
                            Override {match.competitorB?.fullName ?? "B"} score
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={captainOverrideScores[String(match.id)]?.rightScore ?? ""}
                              onChange={(event) =>
                                setCaptainOverrideScores((current) => ({
                                  ...current,
                                  [String(match.id)]: {
                                    leftScore:
                                      current[String(match.id)]?.leftScore ??
                                      (typeof match.score?.competitorA === "number"
                                        ? String(match.score.competitorA)
                                        : ""),
                                    rightScore: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Optional for override"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="tournament-captain-actions-grid">
                        <div className="tournament-captain-action-group">
                          <p className="tournament-captain-action-group-title">Override winner</p>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "override",
                                leftScoreOverride:
                                  captainOverrideScores[String(match.id)]?.leftScore ?? "",
                                match,
                                rightScoreOverride:
                                  captainOverrideScores[String(match.id)]?.rightScore ?? "",
                                winnerUsername: match.competitorA?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorA?.fullName ?? "A"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "override",
                                leftScoreOverride:
                                  captainOverrideScores[String(match.id)]?.leftScore ?? "",
                                match,
                                rightScoreOverride:
                                  captainOverrideScores[String(match.id)]?.rightScore ?? "",
                                winnerUsername: match.competitorB?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorB?.fullName ?? "B"}
                          </Button>
                        </div>
                        <div className="tournament-captain-action-group">
                          <p className="tournament-captain-action-group-title">Push forward</p>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "walkover",
                                match,
                                winnerUsername: match.competitorA?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorA?.fullName ?? "A"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "walkover",
                                match,
                                winnerUsername: match.competitorB?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorB?.fullName ?? "B"}
                          </Button>
                        </div>
                        <div className="tournament-captain-action-group">
                          <p className="tournament-captain-action-group-title">Disqualify</p>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "disqualify",
                                match,
                                winnerUsername: match.competitorA?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorB?.fullName ?? "B"}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            disabled={
                              isApplyingCaptainDecision ||
                              !String(captainDecisionNotes[String(match.id)] ?? "").trim()
                            }
                            onClick={() => {
                              void handleCaptainMatchDecision({
                                action: "disqualify",
                                match,
                                winnerUsername: match.competitorB?.username ?? "",
                              });
                            }}
                          >
                            {match.competitorA?.fullName ?? "A"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </details>
      </div>
    ) : null;
  const currentMatchHandicapSummary =
    selectedTournament?.currentMatch
      ? getTournamentMatchHandicapSummary(selectedTournament.currentMatch)
      : null;
  const tournamentBowCodeLookup = useMemo(
    () => buildTournamentBowCodeLookup(selectedTournament),
    [selectedTournament],
  );

  const selectedTournamentDetail = selectedTournament ? (
    <>
      <div className="tournament-summary-card">
        <div className="tournament-summary-layout">
          <div className="tournament-summary-copy">
            <h3 className="tournament-summary-title" title={selectedTournament.name}>
              {selectedTournament.name}
            </h3>
            <p>{selectedTournament.typeLabel}</p>
            <p>
              Registration window:{" "}
              {formatDate(selectedTournament.registrationWindow.startDate)} to{" "}
              {formatDate(selectedTournament.registrationWindow.endDate)}
            </p>
            <p>
              Tournament window: {formatDate(selectedTournament.scoreWindow.startDate)} to{" "}
              {formatDate(selectedTournament.scoreWindow.endDate)}
            </p>
            {selectedTournament.roundOneStartDate ? (
              <p>Round 1 starts: {formatDate(selectedTournament.roundOneStartDate)}</p>
            ) : null}
            {typeof selectedTournament.roundWindowDays === "number" ? (
              <p>Each round stays open for {selectedTournament.roundWindowDays} day{selectedTournament.roundWindowDays === 1 ? "" : "s"}.</p>
            ) : null}
            {typeof selectedTournament.roundRestDays === "number" ? (
              <p>Rest window between rounds: {selectedTournament.roundRestDays} day{selectedTournament.roundRestDays === 1 ? "" : "s"}.</p>
            ) : null}
            {selectedTournament.roundSchedule?.length ? (
              <div>
                <p>Automatic round windows:</p>
                <ul>
                  {selectedTournament.roundSchedule.map((round) => (
                    <li key={`summary-round-${round.roundNumber}`}>
                      {round.title}: {round.publishDate ? formatDate(round.publishDate) : "Not set"} to{" "}
                      {round.submissionDeadline ? formatDate(round.submissionDeadline) : "Not set"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p>Registered competitors: {selectedTournament.registrationCount}</p>
            {selectedTournament.bracket.winner ? (
              <p>
                Winner: <strong>{selectedTournament.bracket.winner.fullName}</strong>
              </p>
            ) : null}
            {selectedTournament.needsScoreReminder ? (
              <p className="profile-success">
                Round {selectedTournament.currentRoundNumber} is waiting for your action.
              </p>
            ) : null}
            <p
              className={
                selectedTournament.isRegistered
                  ? "profile-success"
                  : "tournament-registration-note"
              }
            >
              {registrationStatusText}
            </p>
            {actorRegistrationEligibilityReason && !selectedTournament.isRegistered ? (
              <p className="profile-error">{actorRegistrationEligibilityReason}</p>
            ) : null}
            {registrationBowOptions.length > 1 && selectedTournament.canRegister ? (
              <label className="tournament-field-label">
                Shooting bow
                <select
                  value={selectedRegistrationBowCode}
                  onChange={(event) => setSelectedRegistrationBowCode(event.target.value)}
                >
                  <option value="">Choose your bow</option>
                  {registrationBowOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.discipline} ({option.code})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="tournament-summary-actions">
            <div className="tournament-action-grid">
              <Button
                type="button"
                className="tournament-primary-button tournament-action-button"
                onClick={handleRegister}
                disabled={
                  !selectedTournament.canRegister ||
                  isSaving ||
                  (registrationBowOptions.length > 1 && !selectedRegistrationBowCode)
                }
              >
                {isSaving && selectedTournament.canRegister
                  ? "Registering..."
                  : selectedTournament.canRegister
                    ? "Register"
                    : selectedTournament.isRegistered
                      ? "Already registered"
                      : selectedTournament.registrationWindow.isOpen
                        ? "Registration unavailable"
                        : "Registration not open yet"}
              </Button>

              <Button
                type="button"
                className="tournament-secondary-button tournament-action-button"
                onClick={handleWithdraw}
                disabled={!selectedTournament.canWithdraw || isSaving}
                variant="secondary"
              >
                {isSaving && selectedTournament.canWithdraw
                  ? "Updating..."
                  : "Withdraw"}
              </Button>

              {canManageTournaments ? (
                selectedTournament.engine?.template?.capabilities?.supportsRandomizedDraw &&
                selectedTournament.registrationWindow.isClosed ? (
                  <Button
                    type="button"
                    className="tournament-secondary-button tournament-action-button"
                    onClick={() => {
                      void handleRedrawTournament();
                    }}
                    disabled={isSaving || !selectedTournament.draw?.canRedraw}
                    variant="secondary"
                  >
                    Redraw round 1
                  </Button>
                ) : null
              ) : null}

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button tournament-action-button"
                  onClick={openCaptainRegistrationModal}
                  disabled={
                    isSaving ||
                    !selectedTournament.registrationWindow.isOpen ||
                    isLoadingRegistrationCandidates ||
                    registrationCandidates.length === 0
                  }
                  variant="secondary"
                >
                  Add member
                </Button>
              ) : null}

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button tournament-action-button"
                  onClick={openCaptainRemovalModal}
                  disabled={isSaving || removalCandidates.length === 0}
                  variant="secondary"
                >
                  Remove member
                </Button>
              ) : null}

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button tournament-action-button"
                  onClick={handleSaveCompetitorList}
                  variant="secondary"
                >
                  Save competitor list
                </Button>
              ) : null}

              <Button
                type="button"
                className="tournament-secondary-button tournament-action-button"
                onClick={() => {
                  setIsTournamentLineUpOpen(true);
                }}
                variant="secondary"
              >
                Tournament Line Up
              </Button>
            </div>
          </div>
        </div>
      </div>

      {selectedTournament.currentMatch ? (
        <div className="tournament-score-card tournament-current-match-card">
          <div className="tournament-current-match-layout">
            <div className="tournament-current-match-meta">
              <h4>My Current Match</h4>
              <p>
                <strong>{selectedTournament.currentMatch.roundTitle}</strong>
              </p>
              <p>
                {formatTournamentParticipantName(
                  selectedTournament.currentMatch.competitorA,
                  tournamentBowCodeLookup,
                )}{" "}
                vs{" "}
                {formatTournamentParticipantName(
                  selectedTournament.currentMatch.competitorB,
                  tournamentBowCodeLookup,
                )}
              </p>
              <p>
                Status: {formatTournamentMatchStatus(selectedTournament.currentMatch.status)}
              </p>
              {selectedTournament.currentMatch.submissionDeadline ? (
                <p>
                  Deadline: {formatDate(selectedTournament.currentMatch.submissionDeadline)}
                </p>
              ) : null}
              {currentMatchHandicapSummary?.allowancePercent ? (
                <p>
                  Handicap allowance: {currentMatchHandicapSummary.allowancePercent}%
                </p>
              ) : null}
              {selectedTournament.currentMatch.workflow?.submittedByUsername ? (
                <p>
                  Submitted by: {selectedTournament.currentMatch.workflow.submittedByUsername}
                </p>
              ) : null}
              {selectedTournament.currentMatch.workflow?.disputeReason ? (
                <p>
                  Dispute note: {selectedTournament.currentMatch.workflow.disputeReason}
                </p>
              ) : null}
            </div>

            <div className="tournament-current-match-actions">
              {actorRoundEligibilityReason ? (
                <p className="profile-error">{actorRoundEligibilityReason}</p>
              ) : null}

              {selectedTournament.currentMatch.workflow?.canSubmitResult ? (
                <form
                  onSubmit={handleSubmitMatchResult}
                  className="left-align-form tournament-match-action-form"
                >
                  <div className="tournament-match-entry-grid">
                    <div className="tournament-match-entry-row">
                      <div className="tournament-match-entry-columns">
                        <div className="tournament-match-entry-header">
                          <span className="tournament-match-entry-label">
                            {selectedTournament.currentMatch.competitorA?.fullName ?? "Competitor A"} score
                          </span>
                          <span className="tournament-match-entry-label">Retired</span>
                        </div>
                        <div className="tournament-match-entry-controls">
                          <label className="tournament-match-entry-score">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={matchScoreAValue}
                              onChange={(event) => setMatchScoreAValue(event.target.value)}
                              disabled={matchCompetitorARetired}
                              required={!matchCompetitorARetired}
                            />
                          </label>
                          <label className="tournament-match-entry-checkbox">
                            <input
                              type="checkbox"
                              checked={matchCompetitorARetired}
                              onChange={(event) => {
                                handleMatchRetirementChange(
                                  "competitorA",
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="tournament-match-entry-row">
                      <div className="tournament-match-entry-columns">
                        <div className="tournament-match-entry-header">
                          <span className="tournament-match-entry-label">
                            {selectedTournament.currentMatch.competitorB?.fullName ?? "Competitor B"} score
                          </span>
                          <span className="tournament-match-entry-label">Retired</span>
                        </div>
                        <div className="tournament-match-entry-controls">
                          <label className="tournament-match-entry-score">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={matchScoreBValue}
                              onChange={(event) => setMatchScoreBValue(event.target.value)}
                              disabled={matchCompetitorBRetired}
                              required={!matchCompetitorBRetired}
                            />
                          </label>
                          <label className="tournament-match-entry-checkbox">
                            <input
                              type="checkbox"
                              checked={matchCompetitorBRetired}
                              onChange={(event) => {
                                handleMatchRetirementChange(
                                  "competitorB",
                                  event.target.checked,
                                );
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button type="submit" disabled={isSubmittingScore}>
                    {isSubmittingScore ? "Submitting result..." : "Submit result"}
                  </Button>
                </form>
              ) : null}

              {selectedTournament.currentMatch.workflow?.canConfirmResult ? (
                <div className="tournament-action-row">
                  <Button
                    type="button"
                    onClick={() => {
                      void handleConfirmMatchResult();
                    }}
                    disabled={isSubmittingScore}
                  >
                    {isSubmittingScore ? "Saving..." : "Confirm result"}
                  </Button>
                </div>
              ) : null}

              {selectedTournament.currentMatch.workflow?.canDisputeResult ? (
                <form
                  onSubmit={handleDisputeMatchResult}
                  className="left-align-form tournament-match-action-form"
                >
                  <label>
                    Reason for dispute
                    <textarea
                      value={matchDisputeReason}
                      onChange={(event) => setMatchDisputeReason(event.target.value)}
                      rows={3}
                      required
                    />
                  </label>
                  <Button type="submit" variant="secondary" disabled={isSubmittingScore}>
                    {isSubmittingScore ? "Sending..." : "Raise dispute"}
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
          {selectedTournament.currentMatch.handicap ? (
            <div className="tournament-current-match-score-breakdown">
              {renderTournamentMatchScoreBreakdownRow(
                formatTournamentParticipantName(
                  selectedTournament.currentMatch.competitorA,
                  tournamentBowCodeLookup,
                ),
                selectedTournament.currentMatch.score?.competitorA,
                selectedTournament.currentMatch.handicap?.competitorA?.allowancePoints,
                typeof selectedTournament.currentMatch.handicap?.competitorA?.adjustedScore === "number"
                  ? selectedTournament.currentMatch.handicap.competitorA.adjustedScore
                  : typeof selectedTournament.currentMatch.score?.competitorA === "number" &&
                      typeof selectedTournament.currentMatch.handicap?.competitorA?.allowancePoints === "number"
                    ? selectedTournament.currentMatch.score.competitorA +
                      selectedTournament.currentMatch.handicap.competitorA.allowancePoints
                    : selectedTournament.currentMatch.score?.competitorA,
              )}
              {renderTournamentMatchScoreBreakdownRow(
                formatTournamentParticipantName(
                  selectedTournament.currentMatch.competitorB,
                  tournamentBowCodeLookup,
                ),
                selectedTournament.currentMatch.score?.competitorB,
                selectedTournament.currentMatch.handicap?.competitorB?.allowancePoints,
                typeof selectedTournament.currentMatch.handicap?.competitorB?.adjustedScore === "number"
                  ? selectedTournament.currentMatch.handicap.competitorB.adjustedScore
                  : typeof selectedTournament.currentMatch.score?.competitorB === "number" &&
                      typeof selectedTournament.currentMatch.handicap?.competitorB?.allowancePoints === "number"
                    ? selectedTournament.currentMatch.score.competitorB +
                      selectedTournament.currentMatch.handicap.competitorB.allowancePoints
                    : selectedTournament.currentMatch.score?.competitorB,
              )}
            </div>
          ) : null}
        </div>
      ) : selectedTournament.canSubmitScore ? (
        <form
          onSubmit={handleSubmitScore}
          className="left-align-form tournament-score-card"
        >
          <h4>Submit Round {selectedTournament.currentRoundNumber} Score</h4>
          <label>
            Score
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={scoreValue}
              onChange={(event) => setScoreValue(event.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={isSubmittingScore}>
            {isSubmittingScore ? "Saving score..." : "Submit score"}
          </Button>
        </form>
      ) : null}

      {captainOperationsContent}
    </>
  ) : (
    <p>Select a tournament to view the registration list and bracket.</p>
  );

  return (
    <div className="profile-page">
      <p>
        {showSetupForm
          ? "Admins can create, amend, and delete tournaments here while reviewing the current list and bracket."
          : "Registered members can track the live bracket, register during the window, and submit scores during the active score window."}
      </p>

      {showSetupForm && canManageTournaments ? (
        <section className="profile-admin-panel">
          <div className="tournament-setup-header">
            <div>
              <h3 className="profile-section-title">Tournament Setup</h3>
              <p className="tournament-setup-copy">
                {isEditingTournament && selectedTournament
                  ? `Editing ${selectedTournament.name}.`
                  : "Use this form to create a new tournament."}
              </p>
            </div>
          </div>

          {isEditingTournament && selectedTournament ? (
            <form
              ref={editWizardRef}
              onSubmit={(event) => event.preventDefault()}
              className="left-align-form"
            >
              {error ? <p className="profile-error">{error}</p> : null}
              {message ? <p className="profile-success">{message}</p> : null}

              <TournamentSetupStepper currentStepIndex={editSetupStepIndex} />

              {currentEditStep.key === "basics" ? (
                <div className="profile-form-grid tournament-basics-grid">
                  <label className="tournament-basics-field tournament-basics-field--full">
                    Tournament name
                    <input
                      className="tournament-name-input"
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="tournament-basics-field">
                    Template
                    <select
                      value={form.templateKey ?? ""}
                      onChange={(event) =>
                        setForm((current) =>
                          buildTournamentFormWithTemplate(
                            current,
                            tournamentTemplates,
                            event.target.value,
                          ),
                        )
                      }
                    >
                      <option value="">No template</option>
                      {tournamentTemplates.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedEditTemplate ? (
                      <small className="form-helper-text">
                        {selectedEditTemplate.description}
                      </small>
                    ) : null}
                  </label>

                  <label className="tournament-basics-field">
                    Tournament type
                    <select
                      value={form.tournamentType}
                      disabled={Boolean(form.templateKey)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          tournamentType: event.target.value,
                        }))
                      }
                    >
                      {tournamentTypes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedEditTemplate ? (
                      <small className="form-helper-text">
                        Driven by the selected template.
                      </small>
                    ) : null}
                  </label>
                </div>
              ) : null}

              {currentEditStep.key === "windows" ? (
                <div className="profile-form-grid">
                  <label>
                    Registration opens
                    <DatePicker
                      value={form.registrationStartDate}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          registrationStartDate: value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Registration closes
                    <DatePicker
                      value={form.registrationEndDate}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          registrationEndDate: value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Round 1 starts
                    <DatePicker
                      value={form.roundOneStartDate}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          roundOneStartDate: value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}

              {currentEditStep.key === "schedule" ? (
                selectedEditTemplate?.capabilities?.supportsRoundDeadlines ? (
                  <div className="profile-form-grid">
                    <label>
                      Round window in days
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={String(form.roundWindowDays)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            roundWindowDays: Number.parseInt(event.target.value || "0", 10),
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Rest window in days
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={String(form.roundRestDays)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            roundRestDays: Number.parseInt(event.target.value || "0", 10),
                          }))
                        }
                        required
                      />
                    </label>
                    <div className="profile-form-grid-full-width tournament-setup-review-card">
                      <h4>Automatic round creation</h4>
                      <p>
                        Round count will be generated automatically once registration closes,
                        based on the final number of archers in the bracket.
                      </p>
                      <p>
                        Each round will open for {form.roundWindowDays || 0} day
                        {form.roundWindowDays === 1 ? "" : "s"}, starting with round 1 on{" "}
                        {formatDate(form.roundOneStartDate)}.
                      </p>
                      <p>
                        The rest window between rounds is {form.roundRestDays || 0} day
                        {form.roundRestDays === 1 ? "" : "s"}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="tournament-setup-review-card">
                    <h4>Schedule</h4>
                    <p>
                      This tournament does not require a captain-managed round
                      deadline schedule.
                    </p>
                  </div>
                )
              ) : null}

              {currentEditStep.key === "review" ? (
                <TournamentSetupReview
                  form={form}
                  selectedTemplate={selectedEditTemplate}
                  registrationCount={selectedTournament.registrationCount}
                />
              ) : null}

              <div className="tournament-setup-actions">
                {editSetupStepIndex > 0 ? (
                  <Button
                    type="button"
                    className="tournament-setup-button secondary-button"
                    onClick={() => moveToPreviousSetupStep(setEditSetupStepIndex)}
                    disabled={isSaving}
                    variant="secondary"
                  >
                    Back
                  </Button>
                ) : null}
                {currentEditStep.key !== "review" ? (
                  <Button
                    type="button"
                    className="tournament-setup-button tournament-setup-button-save"
                    onClick={() =>
                      moveToNextSetupStep({
                        formState: form,
                        selectedTemplate: selectedEditTemplate,
                        currentStepIndex: editSetupStepIndex,
                        setStepIndex: setEditSetupStepIndex,
                        formRef: editWizardRef,
                      })
                    }
                    disabled={isSaving}
                    variant="ghost"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="tournament-setup-button tournament-setup-button-save"
                    onClick={() => {
                      void handleUpdateTournament();
                    }}
                    disabled={isSaving}
                    variant="ghost"
                  >
                    {isSaving ? "Saving changes..." : "Save changes"}
                  </Button>
                )}
                <Button
                  type="button"
                  className="tournament-setup-button tournament-setup-button-create"
                  onClick={openCreateModal}
                  disabled={isSaving}
                >
                  Create tournament
                </Button>
                <Button
                  type="button"
                  className="tournament-setup-button tournament-template-trigger"
                  onClick={() => openTemplateModal(form.templateKey)}
                  disabled={isSaving}
                  variant="secondary"
                >
                  Create template
                </Button>
                <Button
                  type="button"
                  className="tournament-setup-button event-cancel-button"
                  onClick={handleDeleteTournament}
                  disabled={isSaving}
                  variant="danger"
                >
                  Delete tournament
                </Button>
              </div>
            </form>
          ) : (
            <div className="tournament-setup-actions">
              <Button
                type="button"
                className="tournament-setup-button tournament-setup-button-create"
                onClick={openCreateModal}
                disabled={isSaving}
              >
                Create tournament
              </Button>
              <Button
                type="button"
                className="tournament-setup-button tournament-template-trigger"
                onClick={() => openTemplateModal(form.templateKey)}
                disabled={isSaving}
                variant="secondary"
              >
                Create template
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {showSetupForm && canManageTournaments && isCreateModalOpen ? (
        <div className="tournament-modal-backdrop" role="presentation">
          <div
            className="tournament-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-tournament-title"
          >
            <div className="tournament-modal-header">
              <div>
                <h3 id="create-tournament-title" className="profile-section-title">
                  Create Tournament
                </h3>
                <p className="tournament-setup-copy">
                  Enter the tournament details to create a new draw.
                </p>
              </div>
            </div>

            <form
              ref={createModalFormRef}
              onSubmit={(event) => event.preventDefault()}
              className="left-align-form"
            >
              {error ? <p className="profile-error">{error}</p> : null}
              {message ? <p className="profile-success">{message}</p> : null}

              <TournamentSetupStepper currentStepIndex={createSetupStepIndex} />

              {currentCreateStep.key === "basics" ? (
                <div className="profile-form-grid tournament-basics-grid">
                  <label className="tournament-basics-field tournament-basics-field--full">
                    Tournament name
                    <input
                      className="tournament-name-input"
                      value={createForm.name}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label className="tournament-basics-field">
                    Template
                    <select
                      value={createForm.templateKey ?? ""}
                      onChange={(event) =>
                        setCreateForm((current) =>
                          buildTournamentFormWithTemplate(
                            current,
                            tournamentTemplates,
                            event.target.value,
                          ),
                        )
                      }
                    >
                      <option value="">No template</option>
                      {tournamentTemplates.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedCreateTemplate ? (
                      <small className="form-helper-text">
                        {selectedCreateTemplate.description}
                      </small>
                    ) : null}
                  </label>

                  <label className="tournament-basics-field">
                    Tournament type
                    <select
                      value={createForm.tournamentType}
                      disabled={Boolean(createForm.templateKey)}
                      onChange={(event) =>
                        setCreateForm((current) => ({
                          ...current,
                          tournamentType: event.target.value,
                        }))
                      }
                    >
                      {tournamentTypes.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {selectedCreateTemplate ? (
                      <small className="form-helper-text">
                        Driven by the selected template.
                      </small>
                    ) : null}
                  </label>
                </div>
              ) : null}

              {currentCreateStep.key === "windows" ? (
                <div className="profile-form-grid">
                  <label>
                    Registration opens
                    <DatePicker
                      nativeMode="always"
                      value={createForm.registrationStartDate}
                      onChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          registrationStartDate: value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Registration closes
                    <DatePicker
                      nativeMode="always"
                      value={createForm.registrationEndDate}
                      onChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          registrationEndDate: value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label>
                    Round 1 starts
                    <DatePicker
                      nativeMode="always"
                      value={createForm.roundOneStartDate}
                      onChange={(value) =>
                        setCreateForm((current) => ({
                          ...current,
                          roundOneStartDate: value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}

              {currentCreateStep.key === "schedule" ? (
                selectedCreateTemplate?.capabilities?.supportsRoundDeadlines ? (
                  <div className="profile-form-grid">
                    <label>
                      Round window in days
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={String(createForm.roundWindowDays)}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            roundWindowDays: Number.parseInt(event.target.value || "0", 10),
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Rest window in days
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={String(createForm.roundRestDays)}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            roundRestDays: Number.parseInt(event.target.value || "0", 10),
                          }))
                        }
                        required
                      />
                    </label>
                    <div className="profile-form-grid-full-width tournament-setup-review-card">
                      <h4>Automatic round creation</h4>
                      <p>
                        Registration stays open until {formatDate(createForm.registrationEndDate)}.
                        Once that closes, the app will generate the required number of rounds from
                        the final bracket size automatically.
                      </p>
                      <p>
                        Round 1 will start on {formatDate(createForm.roundOneStartDate)} and each
                        round will stay open for {createForm.roundWindowDays || 0} day
                        {createForm.roundWindowDays === 1 ? "" : "s"}.
                      </p>
                      <p>
                        The rest window between rounds is {createForm.roundRestDays || 0} day
                        {createForm.roundRestDays === 1 ? "" : "s"}.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="tournament-setup-review-card">
                    <h4>Schedule</h4>
                    <p>
                      This tournament does not require a captain-managed round
                      deadline schedule.
                    </p>
                  </div>
                )
              ) : null}

              {currentCreateStep.key === "review" ? (
                <TournamentSetupReview
                  form={createForm}
                  selectedTemplate={selectedCreateTemplate}
                />
              ) : null}

              <div className="tournament-setup-actions">
                {createSetupStepIndex > 0 ? (
                  <Button
                    type="button"
                    className="tournament-setup-button secondary-button"
                    onClick={() => moveToPreviousSetupStep(setCreateSetupStepIndex)}
                    disabled={isSaving}
                    variant="secondary"
                  >
                    Back
                  </Button>
                ) : null}
                {currentCreateStep.key !== "review" ? (
                  <Button
                    type="button"
                    className="tournament-setup-button tournament-setup-button-save"
                    onClick={() =>
                      moveToNextSetupStep({
                        formState: createForm,
                        selectedTemplate: selectedCreateTemplate,
                        currentStepIndex: createSetupStepIndex,
                        setStepIndex: setCreateSetupStepIndex,
                        formRef: createModalFormRef,
                      })
                    }
                    disabled={isSaving}
                    variant="ghost"
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="tournament-setup-button tournament-setup-button-create"
                    onClick={() => {
                      void handleCreateTournament();
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? "Creating tournament..." : "Create tournament"}
                  </Button>
                )}
                <Button
                  type="button"
                  className="tournament-setup-button secondary-button"
                  onClick={closeCreateModal}
                  disabled={isSaving}
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLoading && !hasLoadedTournaments ? <p>Loading tournaments...</p> : null}
      {!isCreateModalOpen && error ? <p className="profile-error">{error}</p> : null}
      {!isCreateModalOpen && message ? <p className="profile-success">{message}</p> : null}

      {hasLoadedTournaments ? (
        isTournamentLineUpOpen && selectedTournament ? (
          <TournamentLineUpPage
            tournament={selectedTournament as TournamentRecord}
            canManageTournaments={canManageTournaments}
            bracketGraphic={
              selectedTournament?.bracket.rounds.length ? (
                <TournamentBracketGraphic tournament={selectedTournament} />
              ) : null
            }
            onBack={() => {
              setIsTournamentLineUpOpen(false);
            }}
          />
        ) : isMobile ? (
          <TournamentsMobileView
            activeTournaments={activeTournaments}
            archivedTournaments={archivedTournaments}
            selectedTournament={selectedTournament as TournamentRecord | null}
            showSetupForm={showSetupForm}
            canManageTournaments={canManageTournaments}
            isSaving={isSaving}
            isSubmittingScore={isSubmittingScore}
            registrationStatusText={registrationStatusText}
            scoreValue={scoreValue}
            matchScoreAValue={matchScoreAValue}
            matchScoreBValue={matchScoreBValue}
            matchCompetitorARetired={matchCompetitorARetired}
            matchCompetitorBRetired={matchCompetitorBRetired}
            matchDisputeReason={matchDisputeReason}
            captainOperationsContent={captainOperationsContent}
            isArchiveExpanded={isArchiveExpanded}
            registrationBowOptions={registrationBowOptions}
            requireRegistrationBowSelection={
              registrationBowOptions.length > 1 && !selectedRegistrationBowCode
            }
            selectedRegistrationBowCode={selectedRegistrationBowCode}
            onSelectTournament={(tournamentId) => {
              setSelectedTournamentId(tournamentId);
              if (showSetupForm && canManageTournaments) {
                setIsEditingTournament(true);
              }
            }}
            onToggleArchive={() => {
              setIsArchiveExpanded((current) => !current);
            }}
            onRegistrationBowCodeChange={setSelectedRegistrationBowCode}
            onOpenCaptainRegistrationModal={openCaptainRegistrationModal}
            onOpenCaptainRemovalModal={openCaptainRemovalModal}
            onOpenTournamentLineUp={() => {
              setIsTournamentLineUpOpen(true);
            }}
            onRegister={handleRegister}
            onWithdraw={handleWithdraw}
            onRedrawTournament={() => {
              void handleRedrawTournament();
            }}
            onSaveCompetitorList={handleSaveCompetitorList}
            onScoreValueChange={setScoreValue}
            onSubmitScore={handleSubmitScore}
            onMatchScoreAValueChange={setMatchScoreAValue}
            onMatchScoreBValueChange={setMatchScoreBValue}
            onMatchCompetitorARetiredChange={(nextValue) => {
              handleMatchRetirementChange("competitorA", nextValue);
            }}
            onMatchCompetitorBRetiredChange={(nextValue) => {
              handleMatchRetirementChange("competitorB", nextValue);
            }}
            onMatchDisputeReasonChange={setMatchDisputeReason}
            onSubmitMatchResult={handleSubmitMatchResult}
            onConfirmMatchResult={() => {
              void handleConfirmMatchResult();
            }}
            onDisputeMatchResult={handleDisputeMatchResult}
          />
        ) : (
          <TournamentsDesktopView
            activeTournaments={activeTournaments}
            archivedTournaments={archivedTournaments}
            selectedTournament={selectedTournament as TournamentRecord | null}
            showSetupForm={showSetupForm}
            canManageTournaments={canManageTournaments}
            detailContent={selectedTournamentDetail}
            isArchiveExpanded={isArchiveExpanded}
            onSelectTournament={(tournamentId) => {
              setSelectedTournamentId(tournamentId);
              if (showSetupForm && canManageTournaments) {
                setIsEditingTournament(true);
              }
            }}
            onToggleArchive={() => {
              setIsArchiveExpanded((current) => !current);
            }}
          />
        )
      ) : null}
      <Modal
        open={isTemplateModalOpen}
        onClose={closeTemplateModal}
        title="Create Tournament Template"
        contentClassName="modal-content--wide tournament-template-modal"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Save a reusable tournament template from the current setup flow.
          </p>
          {error ? <p className="profile-error">{error}</p> : null}
          {message ? <p className="profile-success">{message}</p> : null}
          <div className="tournament-template-form">
            <label>
              Template name
              <input
                value={templateForm.label}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
                disabled={isSavingTemplate}
                required
              />
            </label>
            <label>
              Based on
              <select
                value={templateForm.baseTemplateKey}
                onChange={(event) => resetTemplateForm(event.target.value)}
                disabled={isSavingTemplate}
              >
                {tournamentTemplates.map((template: TournamentTemplateOption) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tournament-template-field--full">
              Description
              <textarea
                value={templateForm.description}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                disabled={isSavingTemplate}
              />
            </label>
            <label>
              Result workflow
              <select
                value={templateForm.resultWorkflow}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    resultWorkflow: event.target.value,
                  }))
                }
                disabled={isSavingTemplate}
              >
                <option value="single-submit">Single submit</option>
                <option value="submit-and-confirm">Submit and confirm</option>
              </select>
            </label>
            <label>
              Handicap allowance %
              <input
                type="number"
                min="0"
                max="100"
                value={templateForm.handicapAllowancePercent}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    handicapAllowancePercent: event.target.value,
                  }))
                }
                disabled={isSavingTemplate}
              />
            </label>
            <label className="tournament-template-field--full">
              Default round names
              <input
                value={templateForm.defaultRoundNames}
                onChange={(event) =>
                  setTemplateForm((current) => ({
                    ...current,
                    defaultRoundNames: event.target.value,
                  }))
                }
                disabled={isSavingTemplate}
                placeholder="Round 1, Quarter-final, Semi-final, Final"
              />
            </label>
            <div className="tournament-template-field--full tournament-template-option-group">
              <strong>Capabilities</strong>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsRandomizedDraw}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsRandomizedDraw: event.target.checked,
                    }))
                  }
                />
                <span>Randomized draw</span>
              </label>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsHighestLoserProgression}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsHighestLoserProgression: event.target.checked,
                    }))
                  }
                />
                <span>Highest loser progression</span>
              </label>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsRoundDeadlines}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsRoundDeadlines: event.target.checked,
                    }))
                  }
                />
                <span>Round deadlines</span>
              </label>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsMatchConfirmation}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsMatchConfirmation: event.target.checked,
                    }))
                  }
                />
                <span>Match confirmation</span>
              </label>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsHandicapAdjustments}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsHandicapAdjustments: event.target.checked,
                    }))
                  }
                />
                <span>Handicap adjustments</span>
              </label>
              <label className="tournament-template-checkbox">
                <input
                  type="checkbox"
                  checked={templateForm.supportsEligibilityRules}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      supportsEligibilityRules: event.target.checked,
                    }))
                  }
                />
                <span>Eligibility rules</span>
              </label>
            </div>
            {templateForm.supportsEligibilityRules ? (
              <div className="tournament-template-field--full tournament-template-eligibility">
                <label>
                  Handicap rounds required
                  <input
                    type="number"
                    min="0"
                    value={templateForm.handicapQualificationRoundsRequired}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        handicapQualificationRoundsRequired: event.target.value,
                      }))
                    }
                    disabled={isSavingTemplate}
                  />
                </label>
                <label>
                  Qualifying rounds per knockout round
                  <input
                    type="number"
                    min="0"
                    value={templateForm.qualifyingRoundsRequiredPerKnockoutRound}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        qualifyingRoundsRequiredPerKnockoutRound: event.target.value,
                      }))
                    }
                    disabled={isSavingTemplate}
                  />
                </label>
                <label>
                  Qualifying discipline
                  <select
                    value={templateForm.qualifyingRoundDiscipline}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        qualifyingRoundDiscipline: event.target.value,
                      }))
                    }
                    disabled={isSavingTemplate}
                  >
                    <option value="indoor">Indoor</option>
                    <option value="outdoor">Outdoor</option>
                  </select>
                </label>
              </div>
            ) : null}
            {selectedBaseTemplate ? (
              <p className="form-helper-text">
                Tournament type: {selectedBaseTemplate.tournamentType}
              </p>
            ) : null}
            <div className="tournament-template-field--full tournament-action-row">
              <Button
                type="button"
                onClick={() => {
                  void handleCreateTemplate();
                }}
                disabled={
                  isSavingTemplate ||
                  !templateForm.label.trim() ||
                  !templateForm.baseTemplateKey
                }
              >
                {isSavingTemplate ? "Saving..." : "Save template"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={closeTemplateModal}
                disabled={isSavingTemplate}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        open={isCaptainRegistrationModalOpen}
        onClose={closeCaptainRegistrationModal}
        title="Add Competing Member"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Add competitors for this tournament without leaving the captain workflow.
          </p>
          {error ? <p className="profile-error">{error}</p> : null}
          {message ? <p className="profile-success">{message}</p> : null}
          {!selectedTournament?.registrationWindow.isOpen ? (
            <p>Registration must be open before you can add competitors.</p>
          ) : isLoadingRegistrationCandidates ? (
            <p>Loading members...</p>
          ) : registrationCandidates.length === 0 ? (
            <p>All available members are already registered.</p>
          ) : (
            <div className="login-form">
              <MemberAutocomplete
                label="Member"
                options={registrationCandidateOptions}
                value={selectedCaptainRegistrationUsername}
                onValueChange={setSelectedCaptainRegistrationUsername}
                disabled={isSaving}
              />
              {selectedCaptainRegistrationCandidate ? (
                <p className="profile-success">
                  Selected member: {selectedCaptainRegistrationCandidate.fullName}
                </p>
              ) : null}

              {selectedCaptainRegistrationCandidate ? (
                <label>
                  Shooting bow
                  <select
                    value={selectedCaptainRegistrationBowCode}
                    onChange={(event) =>
                      setSelectedCaptainRegistrationBowCode(event.target.value)
                    }
                    disabled={
                      isSaving || captainRegistrationBowOptions.length === 1
                    }
                  >
                    <option value="">
                      {captainRegistrationBowOptions.length === 1
                        ? "Bow selected automatically"
                        : "Choose a bow"}
                    </option>
                    {captainRegistrationBowOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.discipline} ({option.code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="tournament-action-row">
                <Button
                  type="button"
                  onClick={() => {
                    void handleCaptainRegister();
                  }}
                  disabled={
                    isSaving ||
                    !selectedCaptainRegistrationUsername ||
                    (captainRegistrationBowOptions.length > 1 &&
                      !selectedCaptainRegistrationBowCode)
                  }
                >
                  {isSaving ? "Saving..." : "Done"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void handleCaptainRegisterAndContinue();
                  }}
                  disabled={
                    isSaving ||
                    !selectedCaptainRegistrationUsername ||
                    (captainRegistrationBowOptions.length > 1 &&
                      !selectedCaptainRegistrationBowCode)
                  }
                >
                  {isSaving ? "Saving..." : "Add another member"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={isCaptainRemovalModalOpen}
        onClose={closeCaptainRemovalModal}
        title="Remove Competing Member"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Remove a competing member from this tournament using the same captain controls.
          </p>
          {error ? <p className="profile-error">{error}</p> : null}
          {message ? <p className="profile-success">{message}</p> : null}
          {removalCandidates.length === 0 ? (
            <p>No registered members are available to remove.</p>
          ) : (
            <div className="login-form">
              <label>
                Member
                <select
                  value={selectedCaptainRemovalUsername}
                  onChange={(event) =>
                    setSelectedCaptainRemovalUsername(event.target.value)
                  }
                  disabled={isSaving}
                >
                  <option value="">Choose a member</option>
                  {removalCandidates.map((candidate) => (
                    <option key={candidate.username} value={candidate.username}>
                      {formatTournamentRegistrationName(candidate)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="tournament-action-row">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    void handleCaptainRemoveMember();
                  }}
                  disabled={isSaving || !selectedCaptainRemovalUsername}
                >
                  {isSaving ? "Removing..." : "Remove member"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={pendingRetirementConfirmation !== null}
        onClose={closeRetirementConfirmationModal}
        title="Confirm Retirement"
      >
        <div className="guest-member-modal">
          <p className="guest-member-modal-copy">
            Mark {pendingRetirementCompetitorName} as retired?
          </p>
          <p>This will record that archer&apos;s score as 0 for this match.</p>
          <div className="tournament-action-row">
            <Button type="button" onClick={confirmRetirementChange}>
              Confirm retirement
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={closeRetirementConfirmationModal}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
