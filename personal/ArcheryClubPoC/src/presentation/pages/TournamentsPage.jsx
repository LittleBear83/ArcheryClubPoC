import { useEffect, useMemo, useState } from "react";
import { formatDate } from "../../utils/dateTime";

const BRACKET_MATCH_HEIGHT = 92;
const BRACKET_BASE_GAP = 18;
const BRACKET_WINNER_CARD_HEIGHT = 72;

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

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const responseText = await response.text();

  if (responseText.trim().startsWith("<!DOCTYPE")) {
    throw new Error(
      `${fallbackMessage} If the server was already running, restart it and try again.`,
    );
  }

  throw new Error(fallbackMessage);
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
            }}
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
        style={{ "--tournament-winner-offset": `${winnerOffset}px` }}
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
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentTypes, setTournamentTypes] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [scoreValue, setScoreValue] = useState("");
  const [form, setForm] = useState(createEmptyTournamentForm(today));
  const [createForm, setCreateForm] = useState(createEmptyTournamentForm(today));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isEditingTournament, setIsEditingTournament] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const isAdmin = currentUserProfile?.membership?.role === "admin";

  const loadTournaments = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tournaments", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      });
      const result = await readJsonResponse(
        response,
        "Unable to load tournaments.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load tournaments.");
      }

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
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTournaments();
  }, [currentUserProfile?.auth?.username]);

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
    if (!showSetupForm || !isAdmin) {
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
    isAdmin,
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
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        body: JSON.stringify(createForm),
      });
      const result = await readJsonResponse(
        response,
        "Unable to create tournament.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to create tournament.");
      }

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
      const response = await fetch(`/api/tournaments/${selectedTournament.id}`, {
        method: "PUT",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        body: JSON.stringify(form),
      });
      const result = await readJsonResponse(
        response,
        "Unable to update tournament.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to update tournament.");
      }

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
      const response = await fetch(`/api/tournaments/${selectedTournament.id}`, {
        method: "DELETE",
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
      });
      const result = await readJsonResponse(
        response,
        "Unable to delete tournament.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to delete tournament.");
      }

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
      const response = await fetch(
        `/api/tournaments/${selectedTournament.id}/register`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to register for the tournament.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to register for the tournament.");
      }

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
      const response = await fetch(
        `/api/tournaments/${selectedTournament.id}/register`,
        {
          method: "DELETE",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to withdraw from the tournament.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to withdraw from the tournament.");
      }

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
      const response = await fetch(
        `/api/tournaments/${selectedTournament.id}/score`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
          body: JSON.stringify({ score: scoreValue }),
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to submit score.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to submit score.");
      }

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

  return (
    <div className="profile-page">
      <p>
        {showSetupForm
          ? "Admins can create, amend, and delete tournaments here while reviewing the current list and bracket."
          : "Registered members can track the live bracket, register during the window, and submit scores during the active score window."}
      </p>

      {showSetupForm && isAdmin ? (
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
                  <input
                    type="date"
                    value={form.registrationStartDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        registrationStartDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Registration closes
                  <input
                    type="date"
                    value={form.registrationEndDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        registrationEndDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission opens
                  <input
                    type="date"
                    value={form.scoreSubmissionStartDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scoreSubmissionStartDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission closes
                  <input
                    type="date"
                    value={form.scoreSubmissionEndDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        scoreSubmissionEndDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="tournament-setup-actions">
                <button
                  type="button"
                  className="tournament-setup-button tournament-setup-button-create"
                  onClick={openCreateModal}
                  disabled={isSaving}
                >
                  Create tournament
                </button>
                <button
                  type="submit"
                  className="tournament-setup-button tournament-setup-button-save"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving changes..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="tournament-setup-button event-cancel-button"
                  onClick={handleDeleteTournament}
                  disabled={isSaving}
                >
                  Delete tournament
                </button>
              </div>
            </form>
          ) : (
            <div className="tournament-setup-actions">
              <button
                type="button"
                className="tournament-setup-button tournament-setup-button-create"
                onClick={openCreateModal}
                disabled={isSaving}
              >
                Create tournament
              </button>
            </div>
          )}
        </section>
      ) : null}

      {showSetupForm && isAdmin && isCreateModalOpen ? (
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
                  <input
                    type="date"
                    value={createForm.registrationStartDate}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        registrationStartDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Registration closes
                  <input
                    type="date"
                    value={createForm.registrationEndDate}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        registrationEndDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission opens
                  <input
                    type="date"
                    value={createForm.scoreSubmissionStartDate}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        scoreSubmissionStartDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label>
                  Score submission closes
                  <input
                    type="date"
                    value={createForm.scoreSubmissionEndDate}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        scoreSubmissionEndDate: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="tournament-setup-actions">
                <button
                  type="submit"
                  className="tournament-setup-button tournament-setup-button-create"
                  disabled={isSaving}
                >
                  {isSaving ? "Creating tournament..." : "Create tournament"}
                </button>
                <button
                  type="button"
                  className="tournament-setup-button secondary-button"
                  onClick={closeCreateModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLoading ? <p>Loading tournaments...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isLoading ? (
        <section className="tournament-layout">
          <div className="tournament-list-panel">
            <h3 className="profile-section-title">Tournaments</h3>
            {tournaments.length === 0 ? (
              <p>No tournaments have been set up yet.</p>
            ) : (
              <div className="tournament-list">
                {tournaments.map((tournament) => (
                  <button
                    key={tournament.id}
                    type="button"
                    className={`tournament-list-item ${
                      tournament.id === selectedTournament?.id ? "active" : ""
                    }`}
                    onClick={() => {
                      setSelectedTournamentId(tournament.id);
                      if (showSetupForm && isAdmin) {
                        setIsEditingTournament(true);
                      }
                    }}
                  >
                    <strong>{tournament.name}</strong>
                    <span>{tournament.typeLabel}</span>
                    <span>
                      Registration: {formatDate(tournament.registrationWindow.startDate)} to{" "}
                      {formatDate(tournament.registrationWindow.endDate)}
                    </span>
                    {showSetupForm && isAdmin ? (
                      <span className="tournament-admin-hint">Select to amend or delete</span>
                    ) : null}
                  </button>
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
                    <button
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
                    </button>

                    <button
                      type="button"
                      className="tournament-secondary-button"
                      onClick={handleWithdraw}
                      disabled={!selectedTournament.canWithdraw || isSaving}
                    >
                      {isSaving && selectedTournament.canWithdraw
                        ? "Updating..."
                        : "Withdraw"}
                    </button>
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
                    <button type="submit" disabled={isSubmittingScore}>
                      {isSubmittingScore ? "Saving score..." : "Submit score"}
                    </button>
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
