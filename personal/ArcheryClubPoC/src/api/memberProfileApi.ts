import { buildActorHeaders, fetchApi } from "./client";
import type { ApiEnvelope } from "./client";
import type {
  DistanceSignOffInput,
  DistanceSignOffResult,
  EquipmentLoan,
  LoanBowReturnPayload,
  LoanBowReturnResult,
  MemberProfileApiProfileResult,
  MemberProfileFormInput,
  MemberProfilePageData,
  MemberProfileSaveResult,
  ProfileOptions,
} from "../domain/entities/MemberProfile";

type MemberProfileEnvelope = ApiEnvelope & MemberProfileApiProfileResult;
type EquipmentLoansEnvelope = ApiEnvelope & { loans?: EquipmentLoan[] };
type ProfileOptionsEnvelope = ApiEnvelope & ProfileOptions;
type MemberProfileSaveEnvelope = ApiEnvelope & MemberProfileSaveResult;
type LoanBowReturnEnvelope = ApiEnvelope & LoanBowReturnResult;
type DistanceSignOffEnvelope = ApiEnvelope & DistanceSignOffResult;
type UserProfileEnvelope = ApiEnvelope & { userProfile?: unknown };

export class MemberProfileApi {
  async getProfilePageData(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<MemberProfilePageData> {
    const headers = buildActorHeaders(actorUsername);
    const [profileResult, loansResult] = await Promise.all([
      fetchApi<MemberProfileEnvelope>(`/api/user-profiles/${username}`, {
        headers,
        cache: "no-store",
        signal,
      }),
      fetchApi<EquipmentLoansEnvelope>(`/api/member-equipment-loans/${username}`, {
        headers,
        cache: "no-store",
        signal,
      }),
    ]);

    return {
      editableProfile: profileResult.editableProfile,
      userProfile: profileResult.userProfile,
      equipmentLoans: loansResult.loans ?? [],
      disciplines: profileResult.disciplines ?? [],
      userTypes: profileResult.userTypes ?? [],
    };
  }

  async getProfileOptions(
    actorUsername: string,
    signal?: AbortSignal,
  ): Promise<ProfileOptions> {
    return fetchApi<ProfileOptionsEnvelope>("/api/profile-options", {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
      signal,
    });
  }

  async createProfile(
    actorUsername: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult> {
    return fetchApi<MemberProfileSaveEnvelope>("/api/user-profiles", {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async updateProfile(
    actorUsername: string,
    username: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult> {
    return fetchApi<MemberProfileSaveEnvelope>(`/api/user-profiles/${username}`, {
      method: "PUT",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(profile),
    });
  }

  async assignRfidTag(
    actorUsername: string,
    username: string,
    rfidTag: string,
  ): Promise<MemberProfileSaveResult> {
    return fetchApi<MemberProfileSaveEnvelope>(`/api/user-profiles/${username}/assign-rfid`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify({ rfidTag }),
    });
  }

  async returnLoanBow(
    actorUsername: string,
    username: string,
    loanBowReturn: LoanBowReturnPayload,
  ): Promise<LoanBowReturnResult> {
    return fetchApi<LoanBowReturnEnvelope>(`/api/loan-bow-profiles/${username}/return`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify({ loanBowReturn }),
    });
  }

  async signOffDistance(
    actorUsername: string,
    username: string,
    signOff: DistanceSignOffInput,
  ): Promise<DistanceSignOffResult> {
    return fetchApi<DistanceSignOffEnvelope>(`/api/user-profiles/${username}/distance-sign-offs`, {
      method: "POST",
      headers: buildActorHeaders(actorUsername, true),
      body: JSON.stringify(signOff),
    });
  }

  async getUserProfile(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const result = await fetchApi<UserProfileEnvelope>(`/api/user-profiles/${username}`, {
      headers: buildActorHeaders(actorUsername),
      cache: "no-store",
      signal,
    });

    return result.userProfile;
  }
}
