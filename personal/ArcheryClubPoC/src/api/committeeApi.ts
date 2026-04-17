import { buildActorHeaders, fetchApi, type ActorIdentity } from "./client";

export async function listCommitteeRoles<TResponse>(
  actor: ActorIdentity | string,
) {
  return fetchApi<TResponse & { success: true }>("/api/committee-roles", {
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
  });
}

export async function createCommitteeRole<TRole>(
  actor: ActorIdentity | string,
  draft: Record<string, unknown>,
) {
  return fetchApi<{ success: true; role: TRole }>("/api/committee-roles", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify(draft),
  });
}

export async function updateCommitteeRole<TRole>(
  actor: ActorIdentity | string,
  roleId: string | number,
  draft: Record<string, unknown>,
) {
  return fetchApi<{ success: true; role: TRole }>(`/api/committee-roles/${roleId}`, {
    method: "PUT",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify(draft),
  });
}

export async function deleteCommitteeRole(
  actor: ActorIdentity | string,
  roleId: string | number,
) {
  return fetchApi<{ success: true; deletedRoleId: number }>(
    `/api/committee-roles/${roleId}`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}
