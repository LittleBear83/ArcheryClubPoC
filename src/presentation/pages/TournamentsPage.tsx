import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { useIsMobile } from "../hooks/useIsMobile";
import { formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { subscribeToServerEvent } from "../../lib/serverEvents";
import { useSseFallbackPolling } from "../state/useSseFallbackPolling";
import { TournamentsDesktopView } from "./tournaments/TournamentsDesktopView";
import { TournamentsMobileView } from "./tournaments/TournamentsMobileView";
import type { TournamentRecord } from "./tournaments/tournamentViewTypes";

const BRACKET_MATCH_HEIGHT = 92;
const BRACKET_BASE_GAP = 18;
const BRACKET_WINNER_CARD_HEIGHT = 72;
const TOURNAMENT_SETUP_STEPS = [
  { key: "basics", label: "Basics" },
  { key: "windows", label: "Windows" },
  { key: "schedule", label: "Schedule" },
  { key: "review", label: "Review" },
];
type TournamentCssVars = CSSProperties & Record<string, string>;

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
          (registration, index) => `${index + 1}. ${registration.fullName}`,
        )
      : ["No registered competitors."]),
  ];

  return `${lines.join("\n")}\n`;
}

function getBracketRoundMetrics(roundIndex) {
  const unit = BRACKET_MATCH_HEIGHT + BRACKET_BASE_GAP;

  return {
    gap: unit * 2 ** roundIndex - BRACKET_MATCH_HEIGHT,
    padding: (unit * (2 ** roundIndex - 1)) / 2,
  };
}

function BracketParticipant({ participant, score, isWinner = false }) {
  return (
    <div className={`tournament-bracket-player ${isWinner ? "winner" : ""}`}>
      <span className="tournament-bracket-seed">
        {participant?.seed ? `(${participant.seed})` : ""}
      </span>
      <span className="tournament-bracket-name">
        {participant?.fullName ?? "TBD"}
      </span>
      <span className="tournament-bracket-score">
        {typeof score === "number" ? score : ""}
      </span>
    </div>
  );
}

function formatTournamentMatchStatus(status) {
  return String(status ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTournamentParticipantName(participant) {
  if (!participant) {
    return "TBD";
  }

  return participant.seed
    ? `(${participant.seed}) ${participant.fullName}`
    : participant.fullName;
}

function TournamentBracketGraphic({ tournament }) {
  const finalRoundMetrics = getBracketRoundMetrics(
    Math.max(tournament.bracket.rounds.length - 1, 0),
  );
  const winnerOffset = Math.max(
    finalRoundMetrics.padding +
      BRACKET_MATCH_HEIGHT / 2 -
      BRACKET_WINNER_CARD_HEIGHT / 2,
    0,
  );

  return (
    <div className="tournament-bracket-graphic">
      {tournament.bracket.rounds.map((round, roundIndex) => (
        <div key={round.roundNumber} className="tournament-bracket-column">
          <h5>{round.title}</h5>
          <div
            className="tournament-bracket-column-matches"
            style={{
              "--tournament-match-gap": `${getBracketRoundMetrics(roundIndex).gap}px`,
              "--tournament-column-padding": `${getBracketRoundMetrics(roundIndex).padding}px`,
            } as TournamentCssVars}
          >
            {round.matches.map((match) => (
              <div
                key={match.id}
                className={`tournament-bracket-match tournament-match-${match.status}`}
              >
                <BracketParticipant
                  participant={match.leftParticipant}
                  score={match.leftScore}
                  isWinner={match.winner?.username === match.leftParticipant?.username}
                />
                <BracketParticipant
                  participant={match.rightParticipant}
                  score={match.rightScore}
                  isWinner={match.winner?.username === match.rightParticipant?.username}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div
        className="tournament-bracket-column tournament-bracket-winner-column"
        style={{ "--tournament-winner-offset": `${winnerOffset}px` } as TournamentCssVars}
      >
        <h5>Winner</h5>
        <div className="tournament-bracket-winner-card">
          {tournament.bracket.winner ? (
            <>
              <span className="tournament-bracket-seed">
                ({tournament.bracket.winner.seed})
              </span>
              <strong>{tournament.bracket.winner.fullName}</strong>
            </>
          ) : (
            <span>TBD</span>
          )}
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
  const [tournamentTemplates, setTournamentTemplates] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [scoreValue, setScoreValue] = useState("");
  const [matchScoreAValue, setMatchScoreAValue] = useState("");
  const [matchScoreBValue, setMatchScoreBValue] = useState("");
  const [matchDisputeReason, setMatchDisputeReason] = useState("");
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isEditingTournament, setIsEditingTournament] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editSetupStepIndex, setEditSetupStepIndex] = useState(0);
  const [createSetupStepIndex, setCreateSetupStepIndex] = useState(0);
  const createModalFormRef = useRef<HTMLFormElement | null>(null);
  const editWizardRef = useRef<HTMLFormElement | null>(null);

  const canManageTournaments = hasPermission(
    currentUserProfile,
    "manage_tournaments",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";

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

  const selectedTournament = useMemo(
    () =>
      tournaments.find((tournament) => tournament.id === selectedTournamentId) ??
      tournaments[0] ??
      null,
    [selectedTournamentId, tournaments],
  );
  const selectedEditTemplate = useMemo(
    () => getTemplateForKey(tournamentTemplates, form.templateKey),
    [form.templateKey, tournamentTemplates],
  );
  const selectedCreateTemplate = useMemo(
    () => getTemplateForKey(tournamentTemplates, createForm.templateKey),
    [createForm.templateKey, tournamentTemplates],
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

  const openCreateModal = () => {
    resetCreateForm();
    setIsCreateModalOpen(true);
  };

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

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await tournamentCrud.registerForTournamentUseCase.execute({
        actorUsername,
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
          leftScore: matchScoreAValue,
          rightScore: matchScoreBValue,
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
        <h4>Captain Operations</h4>
        <p>
          Resolve active or disputed matches with a recorded reason. Decisions are
          written into the bracket and logged for audit review.
        </p>
        <div className="tournament-captain-operations-list">
          {captainOperationMatches.map((match) => (
            <div key={`captain-op-${match.id}`} className="tournament-score-card">
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
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const selectedTournamentDetail = selectedTournament ? (
    <>
      <div className="tournament-summary-card">
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

        <div className="tournament-action-row">
          <Button
            type="button"
            className="tournament-primary-button"
            onClick={handleRegister}
            disabled={!selectedTournament.canRegister || isSaving}
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
            className="tournament-secondary-button"
            onClick={handleWithdraw}
            disabled={!selectedTournament.canWithdraw || isSaving}
            variant="secondary"
          >
            {isSaving && selectedTournament.canWithdraw
              ? "Updating..."
              : "Withdraw"}
          </Button>

          {canManageTournaments ? (
            <Button
              type="button"
              className="tournament-secondary-button"
              onClick={handleSaveCompetitorList}
              variant="secondary"
            >
              Save competitor list
            </Button>
          ) : null}
        </div>
      </div>

      <div className="tournament-registrations-card">
        <h4>Competing Members</h4>
        {selectedTournament.registrations.length > 0 ? (
          <ul className="event-summary-list">
            {selectedTournament.registrations.map((registration) => (
              <li key={registration.username}>{registration.fullName}</li>
            ))}
          </ul>
        ) : (
          <p>No members have registered yet.</p>
        )}
      </div>

      {selectedTournament.currentMatch ? (
        <div className="tournament-score-card">
          <h4>My Current Match</h4>
          <p>
            <strong>{selectedTournament.currentMatch.roundTitle}</strong>
          </p>
          <p>
            {formatTournamentParticipantName(selectedTournament.currentMatch.competitorA)} vs{" "}
            {formatTournamentParticipantName(selectedTournament.currentMatch.competitorB)}
          </p>
          <p>
            Status: {formatTournamentMatchStatus(selectedTournament.currentMatch.status)}
          </p>
          {selectedTournament.currentMatch.submissionDeadline ? (
            <p>
              Deadline: {formatDate(selectedTournament.currentMatch.submissionDeadline)}
            </p>
          ) : null}
          {(typeof selectedTournament.currentMatch.score?.competitorA === "number" ||
            typeof selectedTournament.currentMatch.score?.competitorB === "number") ? (
            <p>
              Submitted score:{" "}
              {typeof selectedTournament.currentMatch.score?.competitorA === "number"
                ? selectedTournament.currentMatch.score.competitorA
                : "-"}{" "}
              -{" "}
              {typeof selectedTournament.currentMatch.score?.competitorB === "number"
                ? selectedTournament.currentMatch.score.competitorB
                : "-"}
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

          {selectedTournament.currentMatch.workflow?.canSubmitResult ? (
            <form
              onSubmit={handleSubmitMatchResult}
              className="left-align-form tournament-match-action-form"
            >
              <div className="profile-form-grid">
                <label>
                  {selectedTournament.currentMatch.competitorA?.fullName ?? "Competitor A"} score
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={matchScoreAValue}
                    onChange={(event) => setMatchScoreAValue(event.target.value)}
                    required
                  />
                </label>
                <label>
                  {selectedTournament.currentMatch.competitorB?.fullName ?? "Competitor B"} score
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={matchScoreBValue}
                    onChange={(event) => setMatchScoreBValue(event.target.value)}
                    required
                  />
                </label>
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

      <div className="tournament-bracket-card">
        <h4>Tournament Line Up</h4>
        {!selectedTournament.bracketReady ? (
          <p>
            The tournament bracket graphic will be generated once
            registration closes on{" "}
            {formatDate(selectedTournament.registrationWindow.endDate)}.
          </p>
        ) : selectedTournament.bracket.rounds.length === 0 ? (
          <p>The bracket will appear once enough competitors are registered.</p>
        ) : (
          <TournamentBracketGraphic tournament={selectedTournament} />
        )}
      </div>

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
        isMobile ? (
          <TournamentsMobileView
            tournaments={tournaments as TournamentRecord[]}
            selectedTournament={selectedTournament as TournamentRecord | null}
            showSetupForm={showSetupForm}
            canManageTournaments={canManageTournaments}
            isSaving={isSaving}
            isSubmittingScore={isSubmittingScore}
            registrationStatusText={registrationStatusText}
            scoreValue={scoreValue}
            matchScoreAValue={matchScoreAValue}
            matchScoreBValue={matchScoreBValue}
            matchDisputeReason={matchDisputeReason}
            bracketGraphic={
              selectedTournament?.bracket.rounds.length ? (
                <TournamentBracketGraphic tournament={selectedTournament} />
              ) : null
            }
            captainOperationsContent={captainOperationsContent}
            onSelectTournament={(tournamentId) => {
              setSelectedTournamentId(tournamentId);
              if (showSetupForm && canManageTournaments) {
                setIsEditingTournament(true);
              }
            }}
            onRegister={handleRegister}
            onWithdraw={handleWithdraw}
            onSaveCompetitorList={handleSaveCompetitorList}
            onScoreValueChange={setScoreValue}
            onSubmitScore={handleSubmitScore}
            onMatchScoreAValueChange={setMatchScoreAValue}
            onMatchScoreBValueChange={setMatchScoreBValue}
            onMatchDisputeReasonChange={setMatchDisputeReason}
            onSubmitMatchResult={handleSubmitMatchResult}
            onConfirmMatchResult={() => {
              void handleConfirmMatchResult();
            }}
            onDisputeMatchResult={handleDisputeMatchResult}
          />
        ) : (
          <TournamentsDesktopView
            tournaments={tournaments as TournamentRecord[]}
            selectedTournament={selectedTournament as TournamentRecord | null}
            showSetupForm={showSetupForm}
            canManageTournaments={canManageTournaments}
            detailContent={selectedTournamentDetail}
            onSelectTournament={(tournamentId) => {
              setSelectedTournamentId(tournamentId);
              if (showSetupForm && canManageTournaments) {
                setIsEditingTournament(true);
              }
            }}
          />
        )
      ) : null}
    </div>
  );
}
