import { buildActorHeaders, fetchApi } from "./client";

export class TournamentCrudApi {
  async listTournaments(actorUsername: string) {
    return fetchApi("/api/tournaments", {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async createTournament(actorUsername: string, form: unknown) {
    return fetchApi("/api/tournaments", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(form),
    });
  }

  async updateTournament(
    actorUsername: string,
    tournamentId: string | number,
    form: unknown,
  ) {
    return fetchApi(`/api/tournaments/${tournamentId}`, {
      method: "PUT",
      headers: buildActorHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(form),
    });
  }

  async deleteTournament(actorUsername: string, tournamentId: string | number) {
    return fetchApi(`/api/tournaments/${tournamentId}`, {
      method: "DELETE",
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async registerForTournament(actorUsername: string, tournamentId: string | number) {
    return fetchApi(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      cache: "no-store",
    });
  }

  async withdrawFromTournament(actorUsername: string, tournamentId: string | number) {
    return fetchApi(`/api/tournaments/${tournamentId}/register`, {
      method: "DELETE",
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async submitTournamentScore(
    actorUsername: string,
    tournamentId: string | number,
    scoreSubmission: unknown,
  ) {
    return fetchApi(`/api/tournaments/${tournamentId}/score`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(scoreSubmission),
    });
  }
}
