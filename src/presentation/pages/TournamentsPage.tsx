import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";

const BRACKET_MATCH_HEIGHT = 92;
const BRACKET_BASE_GAP = 18;
const BRACKET_WINNER_CARD_HEIGHT = 72;
type TournamentCssVars = CSSProperties & Record<string, string>;

function createEmptyTournamentForm(today, defaultTournamentType = "portsmouth") {
  return {
    name: "",
    tournamentType: defaultTournamentType,
    registrationStartDate: today,
    registrationEndDate: today,
    scoreSubmissionStartDate: today,
    scoreSubmissionEndDate: today,
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

export function TournamentsPage({
  currentUserProfile,
  onTournamentActivity,
  showSetupForm = false,
  tournamentCrud,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentTypes, setTournamentTypes] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [scoreValue, setScoreValue] = useState("");
  const [form, setForm] = useState(createEmptyTournamentForm(today));
  const [createForm, setCreateForm] = useState(createEmptyTournamentForm(today));
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTournaments, setHasLoadedTournaments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isEditingTournament, setIsEditingTournament] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
      setForm((current) => {
        const nextDefaultType = result.tournamentTypes?.[0]?.value ?? "portsmouth";

        return {
          ...current,
          tournamentType:
            result.tournamentTypes?.some(
              (option) => option.value === current.tournamentType,
            )
              ? current.tournamentType
              : nextDefaultType,
        };
      });
      setCreateForm((current) => {
        const nextDefaultType = result.tournamentTypes?.[0]?.value ?? "portsmouth";

        return {
          ...current,
          tournamentType:
            result.tournamentTypes?.some(
              (option) => option.value === current.tournamentType,
            )
              ? current.tournamentType
              : nextDefaultType,
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

  const selectedTournament = useMemo(
    () =>
      tournaments.find((tournament) => tournament.id === selectedTournamentId) ??
      tournaments[0] ??
      null,
    [selectedTournamentId, tournaments],
  );

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
    }
  }, [selectedTournament]);

  useEffect(() => {
    if (!showSetupForm || !canManageTournaments) {
      return;
    }

    if (isEditingTournament && selectedTournament) {
      setForm({
        name: selectedTournament.name,
        tournamentType: selectedTournament.type,
        registrationStartDate: selectedTournament.registrationWindow.startDate,
        registrationEndDate: selectedTournament.registrationWindow.endDate,
        scoreSubmissionStartDate: selectedTournament.scoreWindow.startDate,
        scoreSubmissionEndDate: selectedTournament.scoreWindow.endDate,
      });
      return;
    }

    setForm(
      createEmptyTournamentForm(today, tournamentTypes[0]?.value ?? "portsmouth"),
    );
  }, [
    canManageTournaments,
    isEditingTournament,
    selectedTournament,
    showSetupForm,
    today,
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
      createEmptyTournamentForm(today, tournamentTypes[0]?.value ?? "portsmouth"),
    );
  };

  const resetCreateForm = () => {
    setCreateForm(
      createEmptyTournamentForm(today, tournamentTypes[0]?.value ?? "portsmouth"),
    );
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

  const handleCreateTournament = async (event) => {
    event.preventDefault();
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
      window.dispatchEvent(new Event("tournament-data-updated"));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTournament = async (event) => {
    event.preventDefault();

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
      window.dispatchEvent(new Event("tournament-data-updated"));
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
      window.dispatchEvent(new Event("tournament-data-updated"));
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
      window.dispatchEvent(new Event("tournament-data-updated"));
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
      window.dispatchEvent(new Event("tournament-data-updated"));
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
      window.dispatchEvent(new Event("tournament-data-updated"));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmittingScore(false);
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
            <form onSubmit={handleUpdateTournament} className="left-align-form">
              <div className="profile-form-grid">
                <label>
                  Tournament name
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  Tournament type
                  <select
                    value={form.tournamentType}
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
                </label>

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
                  Score submission opens
                  <DatePicker
                    value={form.scoreSubmissionStartDate}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        scoreSubmissionStartDate: value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission closes
                  <DatePicker
                    value={form.scoreSubmissionEndDate}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        scoreSubmissionEndDate: value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

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
                  type="submit"
                  className="tournament-setup-button tournament-setup-button-save"
                  disabled={isSaving}
                  variant="ghost"
                >
                  {isSaving ? "Saving changes..." : "Save changes"}
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

            <form onSubmit={handleCreateTournament} className="left-align-form">
              <div className="profile-form-grid">
                <label>
                  Tournament name
                  <input
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

                <label>
                  Tournament type
                  <select
                    value={createForm.tournamentType}
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
                </label>

                <label>
                  Registration opens
                  <DatePicker
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
                  Score submission opens
                  <DatePicker
                    value={createForm.scoreSubmissionStartDate}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        scoreSubmissionStartDate: value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission closes
                  <DatePicker
                    value={createForm.scoreSubmissionEndDate}
                    onChange={(value) =>
                      setCreateForm((current) => ({
                        ...current,
                        scoreSubmissionEndDate: value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="tournament-setup-actions">
                <Button
                  type="submit"
                  className="tournament-setup-button tournament-setup-button-create"
                  disabled={isSaving}
                >
                  {isSaving ? "Creating tournament..." : "Create tournament"}
                </Button>
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
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {hasLoadedTournaments ? (
        <section className="tournament-layout">
          <div className="tournament-list-panel">
            <h3 className="profile-section-title">Tournaments</h3>
            {tournaments.length === 0 ? (
              <p>No tournaments have been set up yet.</p>
            ) : (
              <div className="tournament-list">
                {tournaments.map((tournament) => (
                  <Button
                    key={tournament.id}
                    className={`tournament-list-item ${
                      tournament.id === selectedTournament?.id ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedTournamentId(tournament.id);
                      if (showSetupForm && canManageTournaments) {
                        setIsEditingTournament(true);
                      }
                    }}
                    variant="unstyled"
                  >
                    <strong>{tournament.name}</strong>
                    <span>{tournament.typeLabel}</span>
                    <span>
                      Registration: {formatDate(tournament.registrationWindow.startDate)} to{" "}
                      {formatDate(tournament.registrationWindow.endDate)}
                    </span>
                    {showSetupForm && canManageTournaments ? (
                      <span className="tournament-admin-hint">Select to amend or delete</span>
                    ) : null}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="tournament-detail-panel">
            {selectedTournament ? (
              <>
                <div className="tournament-summary-card">
                  <h3>{selectedTournament.name}</h3>
                  <p>{selectedTournament.typeLabel}</p>
                  <p>
                    Registration window:{" "}
                    {formatDate(selectedTournament.registrationWindow.startDate)} to{" "}
                    {formatDate(selectedTournament.registrationWindow.endDate)}
                  </p>
                  <p>
                    Score window: {formatDate(selectedTournament.scoreWindow.startDate)} to{" "}
                    {formatDate(selectedTournament.scoreWindow.endDate)}
                  </p>
                  <p>
                    Registered competitors: {selectedTournament.registrationCount}
                  </p>
                  {selectedTournament.bracket.winner ? (
                    <p>
                      Winner: <strong>{selectedTournament.bracket.winner.fullName}</strong>
                    </p>
                  ) : null}
                  {selectedTournament.needsScoreReminder ? (
                    <p className="profile-success">
                      Round {selectedTournament.currentRoundNumber} is waiting for your
                      score.
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

                {selectedTournament.canSubmitScore ? (
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
              </>
            ) : (
              <p>Select a tournament to view the registration list and bracket.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
