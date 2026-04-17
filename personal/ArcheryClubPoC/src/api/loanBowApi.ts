import { buildActorHeaders, fetchApi, type ActorIdentity } from "./client";

export async function listLoanBowOptions<TMember>(actor: ActorIdentity | string) {
  return fetchApi<{ success: true; members?: TMember[] }>("/api/loan-bow-options", {
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
  });
}

export async function getLoanBowProfile(
  actor: ActorIdentity | string,
  username: string,
) {
  return fetchApi<{ success: true; loanBow: Record<string, unknown> | null }>(
    `/api/loan-bow-profiles/${username}`,
    {
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function updateLoanBowProfile(
  actor: ActorIdentity | string,
  username: string,
  loanBow: Record<string, unknown> | null,
) {
  return fetchApi<{
    success: true;
    loanBow: Record<string, unknown> | null;
    member: { fullName: string };
  }>(`/api/loan-bow-profiles/${username}`, {
    method: "PUT",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify({ loanBow }),
    cache: "no-store",
  });
}

export async function returnLoanBowProfile(
  actor: ActorIdentity | string,
  username: string,
  loanBowReturn: Record<string, unknown>,
) {
  return fetchApi<{
    success: true;
    loanBow: Record<string, unknown> | null;
    member: { fullName: string };
  }>(`/api/loan-bow-profiles/${username}/return`, {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify({ loanBowReturn }),
    cache: "no-store",
  });
}
