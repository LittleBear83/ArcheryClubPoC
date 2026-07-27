import { MemberProfileRepository } from "../../domain/repositories/MemberProfileRepository";
import type {
  DistanceSignOffInput,
  DistanceSignOffResult,
  GoldenRecordsHandicapRefreshResult,
  GoldenRecordsMatchAssignResult,
  LoanBowReturnPayload,
  LoanBowReturnResult,
  MemberProfileDeleteResult,
  MemberProfileFormInput,
  MemberProfilePageData,
  MemberProfileSaveResult,
  ProfileOptions,
} from "../../domain/entities/MemberProfile";

type MemberProfileDataSource = {
  getProfilePageData(
    actorUsername: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<MemberProfilePageData>;
  getProfileOptions(
    actorUsername: string,
    signal?: AbortSignal,
  ): Promise<ProfileOptions>;
  createProfile(
    actorUsername: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult>;
  updateProfile(
    actorUsername: string,
    username: string,
    profile: MemberProfileFormInput,
  ): Promise<MemberProfileSaveResult>;
  deleteProfile(
    actorUsername: string,
    username: string,
    confirmationUsername: string,
  ): Promise<MemberProfileDeleteResult>;
  assignRfidTag(
    actorUsername: string,
    username: string,
    rfidTag: string,
  ): Promise<MemberProfileSaveResult>;
  returnLoanBow(
    actorUsername: string,
    username: string,
    loanBowReturn: LoanBowReturnPayload,
  ): Promise<LoanBowReturnResult>;
  signOffDistance(
    actorUsername: string,
    username: string,
    signOff: DistanceSignOffInput,
  ): Promise<DistanceSignOffResult>;
  refreshGoldenRecordsHandicap(
    actorUsername: string,
    username: string,
  ): Promise<GoldenRecordsHandicapRefreshResult>;
  assignGoldenRecordsMatch(
    actorUsername: string,
    username: string,
    goldenRecordsId: string,
  ): Promise<GoldenRecordsMatchAssignResult>;
  getUserProfile(actorUsername: string, username: string, signal?: AbortSignal): Promise<unknown>;
};

// Repository implementations adapt domain contracts to the current data source.
// They are pass-through today, but keep pages insulated from transport changes.
export class MemberProfileRepositoryImpl extends MemberProfileRepository {
  private readonly dataSource: MemberProfileDataSource;

  constructor({ dataSource }) {
    super();
    this.dataSource = dataSource;
  }

  async getProfilePageData(actorUsername, username, signal) {
    return this.dataSource.getProfilePageData(actorUsername, username, signal);
  }

  async getProfileOptions(actorUsername, signal) {
    return this.dataSource.getProfileOptions(actorUsername, signal);
  }

  async createProfile(actorUsername, profile) {
    return this.dataSource.createProfile(actorUsername, profile);
  }

  async updateProfile(actorUsername, username, profile) {
    return this.dataSource.updateProfile(actorUsername, username, profile);
  }

  async deleteProfile(actorUsername, username, confirmationUsername) {
    return this.dataSource.deleteProfile(
      actorUsername,
      username,
      confirmationUsername,
    );
  }

  async assignRfidTag(actorUsername, username, rfidTag) {
    return this.dataSource.assignRfidTag(actorUsername, username, rfidTag);
  }

  async returnLoanBow(actorUsername, username, loanBowReturn) {
    return this.dataSource.returnLoanBow(actorUsername, username, loanBowReturn);
  }

  async signOffDistance(actorUsername, username, signOff) {
    return this.dataSource.signOffDistance(actorUsername, username, signOff);
  }

  async refreshGoldenRecordsHandicap(actorUsername, username) {
    return this.dataSource.refreshGoldenRecordsHandicap(actorUsername, username);
  }

  async assignGoldenRecordsMatch(actorUsername, username, goldenRecordsId) {
    return this.dataSource.assignGoldenRecordsMatch(
      actorUsername,
      username,
      goldenRecordsId,
    );
  }

  async getUserProfile(actorUsername, username, signal) {
    return this.dataSource.getUserProfile(actorUsername, username, signal);
  }
}
