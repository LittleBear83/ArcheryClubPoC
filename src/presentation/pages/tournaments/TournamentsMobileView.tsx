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
  TournamentRound,
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

function TournamentRoundSummary({ round }: { round: TournamentRound }) {
  return (
    <article className="tournament-mobile-round-card">
      <h5>{round.title}</h5>
      <div className="tournament-mobile-round-matches">
        {round.matches.map((match) => {
          const summary = getMatchSummary(match);
          const handicapSummary = getHandicapSummary(match);

          return (
            <div
              key={match.id}
              className={`tournament-mobile-match tournament-mobile-match--${match.status}`}
            >
              <strong>{summary.competitors}</strong>
              <span>Score: {summary.scoreText}</span>
              {handicapSummary?.handicapScoreText ? (
                <span>
                  Handicap score
                  {typeof handicapSummary.allowancePercent === "number"
                    ? ` (${handicapSummary.allowancePercent}%)`
                    : ""}
                  : {handicapSummary.handicapScoreText}
                </span>
              ) : null}
              {handicapSummary?.totalScoreText ? (
                <span>Total score: {handicapSummary.totalScoreText}</span>
              ) : null}
              <span>{summary.winnerText}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function formatMatchStatus(status: string) {
  return String(status ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

type TournamentsMobileViewProps = {
  tournaments: TournamentRecord[];
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
  matchDisputeReason: string;
  bracketGraphic: ReactNode;
  captainOperationsContent?: ReactNode;
  registrationBowOptions: Array<{ code: string; discipline: string }>;
  selectedRegistrationBowCode: string;
  onSelectTournament: (tournamentId: TournamentRecord["id"]) => void;
  onRegistrationBowCodeChange: (nextValue: string) => void;
  onOpenCaptainRegistrationModal: () => void;
  onOpenCaptainRemovalModal: () => void;
  onRegister: () => void;
  onWithdraw: () => void;
  onSaveCompetitorList: () => void;
  onScoreValueChange: (nextValue: string) => void;
  onSubmitScore: (event: FormEvent<HTMLFormElement>) => void;
  onMatchScoreAValueChange: (nextValue: string) => void;
  onMatchScoreBValueChange: (nextValue: string) => void;
  onMatchDisputeReasonChange: (nextValue: string) => void;
  onSubmitMatchResult: (event: FormEvent<HTMLFormElement>) => void;
  onConfirmMatchResult: () => void;
  onDisputeMatchResult: (event: FormEvent<HTMLFormElement>) => void;
};

export function TournamentsMobileView({
  tournaments,
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
  matchDisputeReason,
  bracketGraphic,
  captainOperationsContent,
  registrationBowOptions,
  selectedRegistrationBowCode,
  onSelectTournament,
  onRegistrationBowCodeChange,
  onOpenCaptainRegistrationModal,
  onOpenCaptainRemovalModal,
  onRegister,
  onWithdraw,
  onSaveCompetitorList,
  onScoreValueChange,
  onSubmitScore,
  onMatchScoreAValueChange,
  onMatchScoreBValueChange,
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
            tournaments.length > 0
              ? "Choose a tournament to view registration, scoring, and bracket progress."
              : undefined
          }
        />
        {tournaments.length === 0 ? (
          <MobileEmptyState message="No tournaments have been set up yet." />
        ) : (
          <MobileCardList className="tournament-mobile-selector-list">
            {tournaments.map((tournament) => (
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

          <section className="tournament-registrations-card">
            <MobileSectionHeader
              title="Competing Members"
              description={`${selectedTournament.registrations.length} registered`}
            />
            {selectedTournament.registrations.length > 0 ? (
              <MobileCardList className="tournament-mobile-registration-list">
                {selectedTournament.registrations.map((registration) => (
                  <div key={registration.username} className="tournament-mobile-registration-card">
                    {registration.fullName}
                    {registration.bowCode ? ` (${registration.bowCode})` : ""}
                  </div>
                ))}
              </MobileCardList>
            ) : (
              <MobileEmptyState message="No members have registered yet." />
            )}
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
                    {selectedTournament.currentMatch.competitorA?.fullName ?? "Competitor A"} score
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={matchScoreAValue}
                      onChange={(event) => onMatchScoreAValueChange(event.target.value)}
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
                      onChange={(event) => onMatchScoreBValueChange(event.target.value)}
                      required
                    />
                  </label>
                  <Button type="submit" disabled={isSubmittingScore}>
                    {isSubmittingScore ? "Submitting result..." : "Submit result"}
                  </Button>
                </form>
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

          <section className="tournament-bracket-card tournament-mobile-bracket-card">
            <MobileSectionHeader
              title="Tournament Progress"
              description="Phone view defaults to a simpler round-by-round summary."
            />
            {!selectedTournament.bracketReady ? (
              <p>
                The tournament bracket graphic will be generated once registration
                closes on {formatDate(selectedTournament.registrationWindow.endDate)}.
              </p>
            ) : selectedTournament.bracket.rounds.length === 0 ? (
              <p>The bracket will appear once enough competitors are registered.</p>
            ) : (
              <>
                <MobileCardList className="tournament-mobile-round-list">
                  {selectedTournament.bracket.rounds.map((round) => (
                    <TournamentRoundSummary key={round.roundNumber} round={round} />
                  ))}
                </MobileCardList>
                <details className="tournament-mobile-bracket-details">
                  <summary>Show full bracket graphic</summary>
                  <div className="tournament-mobile-bracket-graphic">{bracketGraphic}</div>
                </details>
              </>
            )}
          </section>

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
