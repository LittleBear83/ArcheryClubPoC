import { buildActorHeaders, fetchApi } from "./client";

export class RoleApi {
  async getRolesSnapshot(actorUsername: string) {
    return fetchApi("/api/roles", {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async createRole(actorUsername: string, roleDefinition: unknown) {
    return fetchApi("/api/roles", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(roleDefinition),
    });
  }

  async updateRole(actorUsername: string, roleKey: string, roleDefinition: unknown) {
    return fetchApi(`/api/roles/${roleKey}`, {
      method: "PUT",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(roleDefinition),
    });
  }

  async deleteRole(actorUsername: string, roleKey: string) {
    await fetchApi(`/api/roles/${roleKey}`, {
      method: "DELETE",
      headers: buildActorHeaders(actorUsername),
    });
  }
}
