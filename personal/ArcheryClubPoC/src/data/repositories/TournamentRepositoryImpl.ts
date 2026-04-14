import { TournamentRepository } from "../../domain/repositories/TournamentRepository";

export class TournamentRepositoryImpl extends TournamentRepository {
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

  async registerForTournament(actorUsername, tournamentId) {
    return this.dataSource.registerForTournament(actorUsername, tournamentId);
  }

  async withdrawFromTournament(actorUsername, tournamentId) {
    return this.dataSource.withdrawFromTournament(actorUsername, tournamentId);
  }

  async submitTournamentScore(actorUsername, tournamentId, scoreSubmission) {
    return this.dataSource.submitTournamentScore(actorUsername, tournamentId, scoreSubmission);
  }
}
