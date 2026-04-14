export abstract class MemberProfileRepository {
  abstract getProfilePageData(actorUsername: string, username: string, signal?: AbortSignal): Promise<unknown>;

  abstract getProfileOptions(actorUsername: string, signal?: AbortSignal): Promise<unknown>;

  abstract createProfile(actorUsername: string, profile: unknown): Promise<unknown>;

  abstract updateProfile(actorUsername: string, username: string, profile: unknown): Promise<unknown>;

  abstract assignRfidTag(actorUsername: string, username: string, rfidTag: string): Promise<unknown>;

  abstract returnLoanBow(actorUsername: string, username: string, loanBowReturn: unknown): Promise<unknown>;

  abstract getUserProfile(actorUsername: string, username: string, signal?: AbortSignal): Promise<unknown>;
}
