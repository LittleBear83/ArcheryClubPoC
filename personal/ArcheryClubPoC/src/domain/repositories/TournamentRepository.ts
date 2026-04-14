export abstract class TournamentRepository {
  abstract listTournaments(actorUsername: string): Promise<unknown>;

  abstract createTournament(actorUsername: string, form: unknown): Promise<unknown>;

  abstract updateTournament(actorUsername: string, tournamentId: string | number, form: unknown): Promise<unknown>;

  abstract deleteTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;

  abstract registerForTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;

  abstract withdrawFromTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;

  abstract submitTournamentScore(
    actorUsername: string,
    tournamentId: string | number,
    scoreSubmission: unknown,
  ): Promise<unknown>;
}
