import { TournamentRepository } from "../../domain/repositories/TournamentRepository";

type TournamentDataSource = {
  listTournaments(actorUsername: string): Promise<unknown>;
  createTournament(actorUsername: string, form: unknown): Promise<unknown>;
  updateTournament(
    actorUsername: string,
    tournamentId: string | number,
    form: unknown,
  ): Promise<unknown>;
  deleteTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;
  registerForTournament(
    actorUsername: string,
    tournamentId: string | number,
    payload?: { bowCode?: string },
  ): Promise<unknown>;
  withdrawFromTournament(actorUsername: string, tournamentId: string | number): Promise<unknown>;
  submitTournamentScore(
    actorUsername: string,
    tournamentId: string | number,
    scoreSubmission: unknown,
  ): Promise<unknown>;
  submitTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;
  confirmTournamentMatchResult(
    actorUsername: string,
    matchId: string,
  ): Promise<unknown>;
  disputeTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;
  overrideTournamentMatchResult(
    actorUsername: string,
    matchId: string,
    payload: unknown,
  ): Promise<unknown>;
};

// Tournament repository keeps the domain-facing method names stable while the
// API module owns endpoint paths and request formatting.
export class TournamentRepositoryImpl extends TournamentRepository {
  private readonly dataSource: TournamentDataSource;

  constructor({ dataSource }) {
    super();
    this.dataSource = dataSource;
  }

  async listTournaments(actorUsername) {
    return this.dataSource.listTournaments(actorUsername);
  }

  async createTournament(actorUsername, form) {
    return this.dataSource.createTournament(actorUsername, form);
  }

  async updateTournament(actorUsername, tournamentId, form) {
    return this.dataSource.updateTournament(actorUsername, tournamentId, form);
  }

  async deleteTournament(actorUsername, tournamentId) {
    return this.dataSource.deleteTournament(actorUsername, tournamentId);
  }

  async registerForTournament(actorUsername, tournamentId, payload) {
    return this.dataSource.registerForTournament(actorUsername, tournamentId, payload);
  }

  async withdrawFromTournament(actorUsername, tournamentId) {
    return this.dataSource.withdrawFromTournament(actorUsername, tournamentId);
  }

  async submitTournamentScore(actorUsername, tournamentId, scoreSubmission) {
    return this.dataSource.submitTournamentScore(actorUsername, tournamentId, scoreSubmission);
  }

  async submitTournamentMatchResult(actorUsername, matchId, payload) {
    return this.dataSource.submitTournamentMatchResult(actorUsername, matchId, payload);
  }

  async confirmTournamentMatchResult(actorUsername, matchId) {
    return this.dataSource.confirmTournamentMatchResult(actorUsername, matchId);
  }

  async disputeTournamentMatchResult(actorUsername, matchId, payload) {
    return this.dataSource.disputeTournamentMatchResult(actorUsername, matchId, payload);
  }

  async overrideTournamentMatchResult(actorUsername, matchId, payload) {
    return this.dataSource.overrideTournamentMatchResult(actorUsername, matchId, payload);
  }
}
