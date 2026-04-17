import { buildActorHeaders, fetchApi } from "./client";

export class EquipmentApi {
  async getEquipmentDashboard(actorUsername: string) {
    return fetchApi("/api/equipment/dashboard", {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async addEquipmentItem(actorUsername: string, payload: unknown) {
    return fetchApi("/api/equipment/items", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async decommissionEquipmentItem(
    actorUsername: string,
    itemId: string | number,
    payload: unknown,
  ) {
    return fetchApi(`/api/equipment/items/${itemId}/decommission`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async assignEquipmentItem(actorUsername: string, payload: unknown) {
    return fetchApi("/api/equipment/assignments", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async returnEquipmentItem(actorUsername: string, payload: unknown) {
    return fetchApi("/api/equipment/returns", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async updateEquipmentStorage(actorUsername: string, payload: unknown) {
    return fetchApi("/api/equipment/storage", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async addStorageLocation(actorUsername: string, payload: unknown) {
    return fetchApi("/api/equipment/storage-locations", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async removeStorageLocation(actorUsername: string, locationLabel: string) {
    return fetchApi(
      `/api/equipment/storage-locations/${encodeURIComponent(locationLabel)}`,
      {
        method: "DELETE",
        headers: buildActorHeaders(actorUsername),
      },
    );
  }
}
