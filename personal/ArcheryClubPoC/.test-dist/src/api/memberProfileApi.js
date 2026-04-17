import { buildActorHeaders, fetchApi } from "./client.js";
export class MemberProfileApi {
    async getProfilePageData(actorUsername, username, signal) {
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
    async getProfileOptions(actorUsername, signal) {
        return fetchApi("/api/profile-options", {
            headers: buildActorHeaders(actorUsername),
            cache: "no-store",
            signal,
        });
    }
    async createProfile(actorUsername, profile) {
        return fetchApi("/api/user-profiles", {
            method: "POST",
            headers: buildActorHeaders(actorUsername, true),
            body: JSON.stringify(profile),
        });
    }
    async updateProfile(actorUsername, username, profile) {
        return fetchApi(`/api/user-profiles/${username}`, {
            method: "PUT",
            headers: buildActorHeaders(actorUsername, true),
            body: JSON.stringify(profile),
        });
    }
    async assignRfidTag(actorUsername, username, rfidTag) {
        return fetchApi(`/api/user-profiles/${username}/assign-rfid`, {
            method: "POST",
            headers: buildActorHeaders(actorUsername, true),
            body: JSON.stringify({ rfidTag }),
        });
    }
    async returnLoanBow(actorUsername, username, loanBowReturn) {
        return fetchApi(`/api/loan-bow-profiles/${username}/return`, {
            method: "POST",
            headers: buildActorHeaders(actorUsername, true),
            body: JSON.stringify({ loanBowReturn }),
        });
    }
    async getUserProfile(actorUsername, username, signal) {
        const result = await fetchApi(`/api/user-profiles/${username}`, {
            headers: buildActorHeaders(actorUsername),
            cache: "no-store",
            signal,
        });
        return result.userProfile;
    }
}
