import type {
  DistanceSignOffInput,
  DistanceSignOffResult,
  MemberProfileFormInput,
  MemberProfilePageData,
  MemberProfileSaveResult,
  ProfileOptions,
  LoanBowReturnPayload,
  LoanBowReturnResult,
} from "../entities/MemberProfile";

export abstract class MemberProfileRepository {
  abstract getProfilePageData(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<MemberProfilePageData>;

  abstract getProfileOptions(
    actorUsername: string,
    signal?: AbortSignal,
  ): Promise<ProfileOptions>;

  abstract createProfile(
    actorUsername: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult>;

  abstract updateProfile(
    actorUsername: string,
    username: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult>;

  abstract assignRfidTag(
    actorUsername: string,
    username: string,
    rfidTag: string,
  ): Promise<MemberProfileSaveResult>;

  abstract returnLoanBow(
    actorUsername: string,
    username: string,
    loanBowReturn: LoanBowReturnPayload,
  ): Promise<LoanBowReturnResult>;

  abstract signOffDistance(
    actorUsername: string,
    username: string,
    signOff: DistanceSignOffInput,
  ): Promise<DistanceSignOffResult>;

  abstract getUserProfile(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
