import { fetchApi } from "../../lib/api";

function buildHeaders(actorUsername, includeContentType = false) {
  const headers = {
    "x-actor-username": actorUsername ?? "",
  };

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export class ClubApiDataSource {
  async getProfilePageData(actorUsername, username, signal) {
    const headers = buildHeaders(actorUsername);
    const [profileResult, loansResult] = await Promise.all([
      fetchApi(`/api/user-profiles/${username}`, {
        headers,
        cache: "no-store",
        signal,
      }),
      fetchApi(`/api/member-equipment-loans/${username}`, {
        headers,
        cache: "no-store",
        signal,
      }),
    ]);

    return {
      editableProfile: profileResult.editableProfile,
      userProfile: profileResult.userProfile,
      equipmentLoans: loansResult.loans ?? [],
    };
  }

  async getProfileOptions(actorUsername, signal) {
    return fetchApi("/api/profile-options", {
      headers: buildHeaders(actorUsername),
      cache: "no-store",
      signal,
    });
  }

  async createProfile(actorUsername, profile) {
    return fetchApi("/api/user-profiles", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async updateProfile(actorUsername, username, profile) {
    return fetchApi(`/api/user-profiles/${username}`, {
      method: "PUT",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async assignRfidTag(actorUsername, username, rfidTag) {
    return fetchApi(`/api/user-profiles/${username}/assign-rfid`, {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify({ rfidTag }),
    });
  }

  async returnLoanBow(actorUsername, username, loanBowReturn) {
    return fetchApi(`/api/loan-bow-profiles/${username}/return`, {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify({ loanBowReturn }),
    });
  }

  async getUserProfile(actorUsername, username, signal) {
    const result = await fetchApi(`/api/user-profiles/${username}`, {
      headers: buildHeaders(actorUsername),
      cache: "no-store",
      signal,
    });

    return result.userProfile;
  }

  async getRolesSnapshot(actorUsername) {
    return fetchApi("/api/roles", {
      headers: buildHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async createRole(actorUsername, roleDefinition) {
    return fetchApi("/api/roles", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(roleDefinition),
    });
  }

  async updateRole(actorUsername, roleKey, roleDefinition) {
    return fetchApi(`/api/roles/${roleKey}`, {
      method: "PUT",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(roleDefinition),
    });
  }

  async deleteRole(actorUsername, roleKey) {
    await fetchApi(`/api/roles/${roleKey}`, {
      method: "DELETE",
      headers: buildHeaders(actorUsername),
    });
  }

  async listTournaments(actorUsername) {
    return fetchApi("/api/tournaments", {
      headers: buildHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async createTournament(actorUsername, form) {
    return fetchApi("/api/tournaments", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(form),
    });
  }

  async updateTournament(actorUsername, tournamentId, form) {
    return fetchApi(`/api/tournaments/${tournamentId}`, {
      method: "PUT",
      headers: buildHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(form),
    });
  }

  async deleteTournament(actorUsername, tournamentId) {
    return fetchApi(`/api/tournaments/${tournamentId}`, {
      method: "DELETE",
      headers: buildHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async registerForTournament(actorUsername, tournamentId) {
    return fetchApi(`/api/tournaments/${tournamentId}/register`, {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      cache: "no-store",
    });
  }

  async withdrawFromTournament(actorUsername, tournamentId) {
    return fetchApi(`/api/tournaments/${tournamentId}/register`, {
      method: "DELETE",
      headers: buildHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async submitTournamentScore(actorUsername, tournamentId, scoreSubmission) {
    return fetchApi(`/api/tournaments/${tournamentId}/score`, {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      cache: "no-store",
      body: JSON.stringify(scoreSubmission),
    });
  }

  async getEquipmentDashboard(actorUsername) {
    return fetchApi("/api/equipment/dashboard", {
      headers: buildHeaders(actorUsername),
      cache: "no-store",
    });
  }

  async addEquipmentItem(actorUsername, payload) {
    return fetchApi("/api/equipment/items", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async decommissionEquipmentItem(actorUsername, itemId, payload) {
    return fetchApi(`/api/equipment/items/${itemId}/decommission`, {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async assignEquipmentItem(actorUsername, payload) {
    return fetchApi("/api/equipment/assignments", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async returnEquipmentItem(actorUsername, payload) {
    return fetchApi("/api/equipment/returns", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }

  async updateEquipmentStorage(actorUsername, payload) {
    return fetchApi("/api/equipment/storage", {
      method: "POST",
      headers: buildHeaders(actorUsername, true),
      body: JSON.stringify(payload),
    });
  }
}
