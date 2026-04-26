import { buildActorHeaders, fetchApi } from "./client";

export async function listTournaments<TTournament>(actorUsername: string) {
  return fetchApi<{ success: true; tournaments?: TTournament[] }>("/api/tournaments", {
    headers: buildActorHeaders(actorUsername),
    cache: "no-store",
  });
}
