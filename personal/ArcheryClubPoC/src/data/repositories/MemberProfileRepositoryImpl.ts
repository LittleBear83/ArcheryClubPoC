import { MemberProfileRepository } from "../../domain/repositories/MemberProfileRepository";

type MemberProfileDataSource = {
  getProfilePageData(actorUsername: string, username: string, signal?: AbortSignal): Promise<unknown>;
  getProfileOptions(actorUsername: string, signal?: AbortSignal): Promise<unknown>;
  createProfile(actorUsername: string, profile: unknown): Promise<unknown>;
  updateProfile(actorUsername: string, username: string, profile: unknown): Promise<unknown>;
  assignRfidTag(actorUsername: string, username: string, rfidTag: string): Promise<unknown>;
  returnLoanBow(actorUsername: string, username: string, loanBowReturn: unknown): Promise<unknown>;
  getUserProfile(actorUsername: string, username: string, signal?: AbortSignal): Promise<unknown>;
};

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

  async assignRfidTag(actorUsername, username, rfidTag) {
    return this.dataSource.assignRfidTag(actorUsername, username, rfidTag);
  }

  async returnLoanBow(actorUsername, username, loanBowReturn) {
    return this.dataSource.returnLoanBow(actorUsername, username, loanBowReturn);
  }

  async getUserProfile(actorUsername, username, signal) {
    return this.dataSource.getUserProfile(actorUsername, username, signal);
  }
}
