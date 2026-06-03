import type { ReactNode } from "react";
import { Button } from "../../components/Button";
import { formatDate } from "../../../utils/dateTime";
import type { TournamentRecord } from "./tournamentViewTypes";

type TournamentsDesktopViewProps = {
  tournaments: TournamentRecord[];
  selectedTournament: TournamentRecord | null;
  showSetupForm: boolean;
  canManageTournaments: boolean;
  detailContent: ReactNode;
  onSelectTournament: (tournamentId: TournamentRecord["id"]) => void;
};

export function TournamentsDesktopView({
  tournaments,
  selectedTournament,
  showSetupForm,
  canManageTournaments,
  detailContent,
  onSelectTournament,
}: TournamentsDesktopViewProps) {
  return (
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
        )}
      </div>

      <div className="tournament-detail-panel">{detailContent}</div>
    </section>
  );
}
