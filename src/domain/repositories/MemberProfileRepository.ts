import type {
  DistanceSignOffInput,
  DistanceSignOffResult,
  GoldenRecordsHandicapRefreshResult,
  GoldenRecordsMatchAssignResult,
  MemberProfileFormInput,
  MemberProfileDeleteResult,
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

  abstract deleteProfile(
    actorUsername: string,
    username: string,
    confirmationUsername: string,
  ): Promise<MemberProfileDeleteResult>;

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

  abstract refreshGoldenRecordsHandicap(
    actorUsername: string,
    username: string,
  ): Promise<GoldenRecordsHandicapRefreshResult>;

  abstract assignGoldenRecordsMatch(
    actorUsername: string,
    username: string,
    goldenRecordsId: string,
  ): Promise<GoldenRecordsMatchAssignResult>;

  abstract getUserProfile(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
