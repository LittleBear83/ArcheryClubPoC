import { buildActorHeaders, fetchApi } from "./client";

export class MemberProfileApi {
  async getProfilePageData(actorUsername: string, username: string, signal?: AbortSignal) {
    const headers = buildActorHeaders(actorUsername);
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

  async getProfileOptions(actorUsername: string, signal?: AbortSignal) {
    return fetchApi("/api/profile-options", {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
      signal,
    });
  }

  async createProfile(actorUsername: string, profile: unknown) {
    return fetchApi("/api/user-profiles", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async updateProfile(actorUsername: string, username: string, profile: unknown) {
    return fetchApi(`/api/user-profiles/${username}`, {
      method: "PUT",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async assignRfidTag(actorUsername: string, username: string, rfidTag: string) {
    return fetchApi(`/api/user-profiles/${username}/assign-rfid`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify({ rfidTag }),
    });
  }

  async returnLoanBow(actorUsername: string, username: string, loanBowReturn: unknown) {
    return fetchApi(`/api/loan-bow-profiles/${username}/return`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify({ loanBowReturn }),
    });
  }

  async getUserProfile(actorUsername: string, username: string, signal?: AbortSignal) {
    const result = await fetchApi(`/api/user-profiles/${username}`, {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
      signal,
    });

    return result.userProfile;
  }
}
