export abstract class TournamentRepository {
  abstract listTournaments(actorUsername: string): Promise<unknown>;

  abstract createTournament(actorUsername: string, form: unknown): Promise<unknown>;

  abstract createTournamentTemplate(actorUsername: string, form: unknown): Promise<unknown>;

  abstract updateTournament(actorUsername: string, tournamentId: string | number, form: unknown): Promise<unknown>;

  abstract deleteTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;

  abstract registerForTournament(
    actorUsername: string,
    tournamentId: string | number,
    payload?: { bowCode?: string; memberUsername?: string },
  ): Promise<unknown>;

  abstract withdrawFromTournament(
    actorUsername: string,
    tournamentId: string | number,
    payload?: { memberUsername?: string },
  ): Promise<unknown>;

  abstract redrawTournament(
    actorUsername: string,
    tournamentId: string | number,
  ): Promise<unknown>;

  abstract submitTournamentScore(
    actorUsername: string,
    tournamentId: string | number,
    scoreSubmission: unknown,
  ): Promise<unknown>;

  abstract submitTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;

  abstract confirmTournamentMatchResult(
    actorUsername: string,
    matchId: string,
  ): Promise<unknown>;

  abstract disputeTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;

  abstract overrideTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;
}
