import type { FormEvent, ReactNode } from "react";
import { Button } from "../../components/Button";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import { formatDate } from "../../../utils/dateTime";
import type {
  TournamentMatch,
  TournamentRecord,
} from "./tournamentViewTypes";

function getParticipantLabel(participant?: TournamentMatch["leftParticipant"]) {
  if (!participant) {
    return "TBD";
  }

  const bowCode = String(participant.bowCode ?? "").trim().toUpperCase();
  const fullName = bowCode ? `${participant.fullName} (${bowCode})` : participant.fullName;
  return participant.seed ? `(${participant.seed}) ${fullName}` : fullName;
}

function getMatchSummary(match: TournamentMatch) {
  const competitors = `${getParticipantLabel(match.leftParticipant)} vs ${getParticipantLabel(match.rightParticipant)}`;
  const hasScores =
    typeof match.leftScore === "number" || typeof match.rightScore === "number";
  const scoreText = hasScores
    ? `${typeof match.leftScore === "number" ? match.leftScore : "-"} - ${
        typeof match.rightScore === "number" ? match.rightScore : "-"
      }`
    : "Scores pending";
  const winnerText = match.winner ? `Winner: ${match.winner.fullName}` : "Winner pending";

  return { competitors, scoreText, winnerText };
}

function getHandicapSummary(match: TournamentMatch) {
  const handicap = match.handicap;

  if (!handicap) {
    return null;
  }

  const adjustedScoreText =
    typeof handicap.competitorA?.adjustedScore === "number" ||
    typeof handicap.competitorB?.adjustedScore === "number"
      ? `${typeof handicap.competitorA?.adjustedScore === "number" ? handicap.competitorA.adjustedScore : "-"} - ${
          typeof handicap.competitorB?.adjustedScore === "number"
            ? handicap.competitorB.adjustedScore
            : "-"
        }`
      : "";
  const allowanceText =
    typeof handicap.competitorA?.allowancePoints === "number" ||
    typeof handicap.competitorB?.allowancePoints === "number"
      ? `${typeof handicap.competitorA?.allowancePoints === "number" ? handicap.competitorA.allowancePoints : "-"} - ${
          typeof handicap.competitorB?.allowancePoints === "number"
            ? handicap.competitorB.allowancePoints
            : "-"
        }`
      : "";

  if (!adjustedScoreText && !allowanceText) {
    return null;
  }

  return {
    handicapScoreText: allowanceText,
    rawScoreText:
      typeof match.leftScore === "number" || typeof match.rightScore === "number"
        ? `${typeof match.leftScore === "number" ? match.leftScore : "-"} - ${
            typeof match.rightScore === "number" ? match.rightScore : "-"
          }`
        : "",
    totalScoreText: adjustedScoreText,
    allowancePercent: handicap.allowancePercent ?? null,
  };
}

function formatMatchStatus(status: string) {
  return String(status ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type TournamentsMobileViewProps = {
  activeTournaments: TournamentRecord[];
  archivedTournaments: TournamentRecord[];
  selectedTournament: TournamentRecord | null;
  showSetupForm: boolean;
  canManageTournaments: boolean;
  isSaving: boolean;
  isSubmittingScore: boolean;
  registrationStatusText: string;
  requireRegistrationBowSelection?: boolean;
  scoreValue: string;
  matchScoreAValue: string;
  matchScoreBValue: string;
  matchCompetitorARetired: boolean;
  matchCompetitorBRetired: boolean;
  matchDisputeReason: string;
  captainOperationsContent?: ReactNode;
  isArchiveExpanded: boolean;
  registrationBowOptions: Array<{ code: string; discipline: string }>;
  selectedRegistrationBowCode: string;
  onSelectTournament: (tournamentId: TournamentRecord["id"]) => void;
  onToggleArchive: () => void;
  onRegistrationBowCodeChange: (nextValue: string) => void;
  onOpenCaptainRegistrationModal: () => void;
  onOpenCaptainRemovalModal: () => void;
  onOpenTournamentLineUp: () => void;
  onRegister: () => void;
  onWithdraw: () => void;
  onRedrawTournament: () => void;
  onSaveCompetitorList: () => void;
  onScoreValueChange: (nextValue: string) => void;
  onSubmitScore: (event: FormEvent<HTMLFormElement>) => void;
  onMatchScoreAValueChange: (nextValue: string) => void;
  onMatchScoreBValueChange: (nextValue: string) => void;
  onMatchCompetitorARetiredChange: (nextValue: boolean) => void;
  onMatchCompetitorBRetiredChange: (nextValue: boolean) => void;
  onMatchDisputeReasonChange: (nextValue: string) => void;
  onSubmitMatchResult: (event: FormEvent<HTMLFormElement>) => void;
  onConfirmMatchResult: () => void;
  onDisputeMatchResult: (event: FormEvent<HTMLFormElement>) => void;
};

export function TournamentsMobileView({
  activeTournaments,
  archivedTournaments,
  selectedTournament,
  showSetupForm,
  canManageTournaments,
  isSaving,
  isSubmittingScore,
  registrationStatusText,
  requireRegistrationBowSelection = false,
  scoreValue,
  matchScoreAValue,
  matchScoreBValue,
  matchCompetitorARetired,
  matchCompetitorBRetired,
  matchDisputeReason,
  captainOperationsContent,
  isArchiveExpanded,
  registrationBowOptions,
  selectedRegistrationBowCode,
  onSelectTournament,
  onToggleArchive,
  onRegistrationBowCodeChange,
  onOpenCaptainRegistrationModal,
  onOpenCaptainRemovalModal,
  onOpenTournamentLineUp,
  onRegister,
  onWithdraw,
  onRedrawTournament,
  onSaveCompetitorList,
  onScoreValueChange,
  onSubmitScore,
  onMatchScoreAValueChange,
  onMatchScoreBValueChange,
  onMatchCompetitorARetiredChange,
  onMatchCompetitorBRetiredChange,
  onMatchDisputeReasonChange,
  onSubmitMatchResult,
  onConfirmMatchResult,
  onDisputeMatchResult,
}: TournamentsMobileViewProps) {
  return (
    <section className="tournament-mobile-layout">
      <section className="tournament-list-panel tournament-mobile-list-panel">
        <MobileSectionHeader
          title="Tournaments"
          description={
            activeTournaments.length > 0 || archivedTournaments.length > 0
              ? "Choose a tournament to view registration, scoring, and bracket progress."
              : undefined
          }
        />
        {activeTournaments.length === 0 && archivedTournaments.length === 0 ? (
          <MobileEmptyState message="No tournaments have been set up yet." />
        ) : (
          <>
            {activeTournaments.length > 0 ? (
              <MobileCardList className="tournament-mobile-selector-list">
                {activeTournaments.map((tournament) => (
                  <Button
                    key={tournament.id}
                    type="button"
                    className={`tournament-list-item tournament-mobile-selector ${
                      tournament.id === selectedTournament?.id ? "active" : ""
                    }`}
                    onClick={() => onSelectTournament(tournament.id)}
                    variant="unstyled"
                  >
                    <strong>{tournament.name}</strong>
                    <span>{tournament.typeLabel}</span>
                    <span>
                      Registration: {formatDate(tournament.registrationWindow.startDate)} to{" "}
                      {formatDate(tournament.registrationWindow.endDate)}
                    </span>
                    {showSetupForm && canManageTournaments ? (
                      <span className="tournament-admin-hint">
                        Tap to amend or delete
                      </span>
                    ) : null}
                  </Button>
                ))}
              </MobileCardList>
            ) : (
              <p className="tournament-archive-empty">
                All current tournaments are in the archive.
              </p>
            )}

            {archivedTournaments.length > 0 ? (
              <section className="tournament-archive-panel">
                <Button
                  type="button"
                  className="tournament-archive-toggle"
                  onClick={onToggleArchive}
                  variant="unstyled"
                >
                  <strong>Archive</strong>
                  <span>
                    {archivedTournaments.length} tournament
                    {archivedTournaments.length === 1 ? "" : "s"}
                  </span>
                  <span>{isArchiveExpanded ? "Hide" : "Show"}</span>
                </Button>
                {isArchiveExpanded ? (
                  <MobileCardList className="tournament-mobile-selector-list tournament-list--archived">
                    {archivedTournaments.map((tournament) => (
                      <Button
                        key={tournament.id}
                        type="button"
                        className={`tournament-list-item tournament-mobile-selector tournament-list-item--archived ${
                          tournament.id === selectedTournament?.id ? "active" : ""
                        }`}
                        onClick={() => onSelectTournament(tournament.id)}
                        variant="unstyled"
                      >
                        <strong>{tournament.name}</strong>
                        <span>{tournament.typeLabel}</span>
                        <span>
                          Registration: {formatDate(tournament.registrationWindow.startDate)} to{" "}
                          {formatDate(tournament.registrationWindow.endDate)}
                        </span>
                      </Button>
                    ))}
                  </MobileCardList>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </section>

      {selectedTournament ? (
        <div className="tournament-mobile-detail">
          <section className="tournament-summary-card tournament-mobile-summary-card">
            <MobileSectionHeader
              title={selectedTournament.name}
              description={selectedTournament.typeLabel}
            />
            <MobileKeyValueList
              items={[
                {
                  label: "Registration",
                  value: `${formatDate(selectedTournament.registrationWindow.startDate)} to ${formatDate(selectedTournament.registrationWindow.endDate)}`,
                },
                {
                  label: "Score window",
                  value: `${formatDate(selectedTournament.scoreWindow.startDate)} to ${formatDate(selectedTournament.scoreWindow.endDate)}`,
                },
                {
                  label: "Competitors",
                  value: String(selectedTournament.registrationCount),
                },
                ...(selectedTournament.bracket.winner
                  ? [
                      {
                        label: "Winner",
                        value: selectedTournament.bracket.winner.fullName,
                      },
                    ]
                  : []),
              ]}
            />
            {selectedTournament.needsScoreReminder ? (
              <p className="profile-success tournament-mobile-status-note">
                Round {selectedTournament.currentRoundNumber} is waiting for your score.
              </p>
            ) : null}
            <p
              className={
                selectedTournament.isRegistered
                  ? "profile-success tournament-mobile-status-note"
                  : "tournament-registration-note tournament-mobile-status-note"
              }
            >
              {registrationStatusText}
            </p>
            {selectedTournament.eligibility?.actor?.registration?.isEligible === false &&
            !selectedTournament.isRegistered ? (
              <p className="profile-error tournament-mobile-status-note">
                {selectedTournament.eligibility.actor.registration.reason}
              </p>
            ) : null}

            <div className="tournament-action-row tournament-mobile-action-row">
              <Button
                type="button"
                className="tournament-primary-button"
                onClick={onRegister}
                disabled={
                  !selectedTournament.canRegister ||
                  isSaving ||
                  requireRegistrationBowSelection
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
                className="tournament-secondary-button"
                onClick={onWithdraw}
                disabled={!selectedTournament.canWithdraw || isSaving}
                variant="secondary"
              >
                {isSaving && selectedTournament.canWithdraw ? "Updating..." : "Withdraw"}
              </Button>

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button"
                  onClick={onOpenCaptainRegistrationModal}
                  disabled={
                    isSaving ||
                    !selectedTournament.registrationWindow.isOpen
                  }
                  variant="secondary"
                >
                  Add member
                </Button>
              ) : null}

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button"
                  onClick={onOpenCaptainRemovalModal}
                  disabled={isSaving || selectedTournament.registrations.length === 0}
                  variant="secondary"
                >
                  Remove member
                </Button>
              ) : null}

              {canManageTournaments &&
              selectedTournament.engine?.template?.capabilities?.supportsRandomizedDraw &&
              selectedTournament.registrationWindow.isClosed ? (
                <Button
                  type="button"
                  className="tournament-secondary-button"
                  onClick={onRedrawTournament}
                  disabled={isSaving || !selectedTournament.draw?.canRedraw}
                  variant="secondary"
                >
                  Redraw round 1
                </Button>
              ) : null}

              {canManageTournaments ? (
                <Button
                  type="button"
                  className="tournament-secondary-button"
                  onClick={onSaveCompetitorList}
                  variant="secondary"
                >
                  Save competitor list
                </Button>
              ) : null}

              <Button
                type="button"
                className="tournament-secondary-button"
                onClick={onOpenTournamentLineUp}
                variant="secondary"
              >
                Tournament Line Up
              </Button>

            </div>
            {registrationBowOptions.length > 1 && selectedTournament.canRegister ? (
              <label>
                Shooting bow
                <select
                  value={selectedRegistrationBowCode}
                  onChange={(event) => onRegistrationBowCodeChange(event.target.value)}
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
          </section>

          {selectedTournament.currentMatch ? (
            <section className="tournament-score-card tournament-mobile-score-card">
              {(() => {
                const handicapSummary = getHandicapSummary(selectedTournament.currentMatch);

                return (
                  <>
              <MobileSectionHeader title="My Current Match" />
              <p>
                <strong>{selectedTournament.currentMatch.roundTitle}</strong>
              </p>
              <p>
                {getParticipantLabel(selectedTournament.currentMatch.competitorA)} vs{" "}
                {getParticipantLabel(selectedTournament.currentMatch.competitorB)}
              </p>
              <p>Status: {formatMatchStatus(selectedTournament.currentMatch.status)}</p>
              {selectedTournament.currentMatch.submissionDeadline ? (
                <p>
                  Deadline: {formatDate(selectedTournament.currentMatch.submissionDeadline)}
                </p>
              ) : null}
              {handicapSummary?.rawScoreText ? (
                <p>
                  Score: {handicapSummary.rawScoreText}
                </p>
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

              {selectedTournament.currentMatch.workflow?.canSubmitResult ? (
                <form
                  onSubmit={onSubmitMatchResult}
                  className="left-align-form tournament-match-action-form"
                >
                  <label>
                    Retired{" "}
                    <input
                      type="checkbox"
                      checked={matchCompetitorARetired}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;

                        if (
                          nextChecked &&
                          !window.confirm(
                            `Mark ${
                              selectedTournament.currentMatch.competitorA?.fullName ??
                              "this archer"
                            } as retired? Their score will be recorded as 0.`,
                          )
                        ) {
                          return;
                        }

                        onMatchCompetitorARetiredChange(nextChecked);
                        if (nextChecked) {
                          onMatchScoreAValueChange("");
                        }
                      }}
                    />
                  </label>
                  <label>
                    {selectedTournament.currentMatch.competitorA?.fullName ?? "Competitor A"} score
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={matchScoreAValue}
                      onChange={(event) => onMatchScoreAValueChange(event.target.value)}
                      disabled={matchCompetitorARetired}
                      required={!matchCompetitorARetired}
                    />
                  </label>
                  <label>
                    Retired{" "}
                    <input
                      type="checkbox"
                      checked={matchCompetitorBRetired}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;

                        if (
                          nextChecked &&
                          !window.confirm(
                            `Mark ${
                              selectedTournament.currentMatch.competitorB?.fullName ??
                              "this archer"
                            } as retired? Their score will be recorded as 0.`,
                          )
                        ) {
                          return;
                        }

                        onMatchCompetitorBRetiredChange(nextChecked);
                        if (nextChecked) {
                          onMatchScoreBValueChange("");
                        }
                      }}
                    />
                  </label>
                  <label>
                    {selectedTournament.currentMatch.competitorB?.fullName ?? "Competitor B"} score
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={matchScoreBValue}
                      onChange={(event) => onMatchScoreBValueChange(event.target.value)}
                      disabled={matchCompetitorBRetired}
                      required={!matchCompetitorBRetired}
                    />
                  </label>
                  <Button type="submit" disabled={isSubmittingScore}>
                    {isSubmittingScore ? "Submitting result..." : "Submit result"}
                  </Button>
                </form>
              ) : null}
              {selectedTournament.eligibility?.actor?.currentRound?.isEligible === false ? (
                <p className="profile-error">
                  {selectedTournament.eligibility.actor.currentRound.reason}
                </p>
              ) : null}

              {selectedTournament.currentMatch.workflow?.canConfirmResult ? (
                <Button type="button" onClick={onConfirmMatchResult} disabled={isSubmittingScore}>
                  {isSubmittingScore ? "Saving..." : "Confirm result"}
                </Button>
              ) : null}

              {selectedTournament.currentMatch.workflow?.canDisputeResult ? (
                <form
                  onSubmit={onDisputeMatchResult}
                  className="left-align-form tournament-match-action-form"
                >
                  <label>
                    Reason for dispute
                    <textarea
                      value={matchDisputeReason}
                      onChange={(event) => onMatchDisputeReasonChange(event.target.value)}
                      rows={3}
                      required
                    />
                  </label>
                  <Button type="submit" variant="secondary" disabled={isSubmittingScore}>
                    {isSubmittingScore ? "Sending..." : "Raise dispute"}
                  </Button>
                </form>
              ) : null}
                  </>
                );
              })()}
            </section>
          ) : selectedTournament.canSubmitScore ? (
            <form
              onSubmit={onSubmitScore}
              className="left-align-form tournament-score-card tournament-mobile-score-card"
            >
              <MobileSectionHeader
                title={`Submit Round ${selectedTournament.currentRoundNumber} Score`}
              />
              <label>
                Score
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={scoreValue}
                  onChange={(event) => onScoreValueChange(event.target.value)}
                  required
                />
              </label>
              <Button type="submit" disabled={isSubmittingScore}>
                {isSubmittingScore ? "Saving score..." : "Submit score"}
              </Button>
            </form>
          ) : null}

          {captainOperationsContent}
        </div>
      ) : (
        <section className="tournament-summary-card">
          <MobileEmptyState message="Choose a tournament to view registration, scoring, and bracket details." />
        </section>
      )}
    </section>
  );
}
