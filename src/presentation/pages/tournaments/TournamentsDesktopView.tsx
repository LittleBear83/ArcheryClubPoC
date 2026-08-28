import type { ReactNode } from "react";
import { Button } from "../../components/Button";
import { formatDate } from "../../../utils/dateTime";
import type { TournamentRecord } from "./tournamentViewTypes";

type TournamentsDesktopViewProps = {
  activeTournaments: TournamentRecord[];
  archivedTournaments: TournamentRecord[];
  selectedTournament: TournamentRecord | null;
  showSetupForm: boolean;
  canManageTournaments: boolean;
  detailContent: ReactNode;
  isArchiveExpanded: boolean;
  onSelectTournament: (tournamentId: TournamentRecord["id"]) => void;
  onToggleArchive: () => void;
};

export function TournamentsDesktopView({
  activeTournaments,
  archivedTournaments,
  selectedTournament,
  showSetupForm,
  canManageTournaments,
  detailContent,
  isArchiveExpanded,
  onSelectTournament,
  onToggleArchive,
}: TournamentsDesktopViewProps) {
  return (
    <section className="tournament-layout">
      <div className="tournament-list-panel">
        <h3 className="profile-section-title">Tournaments</h3>
        {activeTournaments.length === 0 && archivedTournaments.length === 0 ? (
          <p>No tournaments have been set up yet.</p>
        ) : (
          <>
            {activeTournaments.length > 0 ? (
              <div className="tournament-list">
                {activeTournaments.map((tournament) => (
                  <Button
                    key={tournament.id}
                    className={`tournament-list-item ${
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
                        Select to amend or delete
                      </span>
                    ) : null}
                  </Button>
                ))}
              </div>
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
                  <div className="tournament-list tournament-list--archived">
                    {archivedTournaments.map((tournament) => (
                      <Button
                        key={tournament.id}
                        className={`tournament-list-item tournament-list-item--archived ${
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
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>

      <div className="tournament-detail-panel">{detailContent}</div>
    </section>
  );
}
