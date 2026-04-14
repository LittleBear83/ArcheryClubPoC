import { MemberProfileRepository } from "../../domain/repositories/MemberProfileRepository";

export class MemberProfileRepositoryImpl extends MemberProfileRepository {
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
