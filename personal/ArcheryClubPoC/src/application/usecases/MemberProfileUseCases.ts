import type { MemberProfileRepository } from "../../domain/repositories/MemberProfileRepository";
import type {
  DistanceSignOffInput,
  DistanceSignOffResult,
  LoanBowReturnPayload,
  LoanBowReturnResult,
  MemberProfileFormInput,
  MemberProfilePageData,
  MemberProfileSaveResult,
  ProfileOptions,
} from "../../domain/entities/MemberProfile";

type ActorUsernameInput = {
  actorUsername: string;
};

type ProfileTargetInput = ActorUsernameInput & {
  username: string;
  signal?: AbortSignal;
};

// Use cases are intentionally thin: they validate page-level intent before
// delegating persistence and transport details to the repository layer.
export class GetMemberProfilePageDataUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    username,
    signal,
  }: ProfileTargetInput): Promise<MemberProfilePageData> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    return this.memberProfileRepository.getProfilePageData(
      actorUsername,
      username,
      signal,
    );
  }
}

export class GetMemberProfileOptionsUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    signal,
  }: ActorUsernameInput & { signal?: AbortSignal }): Promise<ProfileOptions> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.memberProfileRepository.getProfileOptions(actorUsername, signal);
  }
}

export class CreateMemberProfileUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    profile,
  }: ActorUsernameInput & {
    profile: MemberProfileFormInput;
  }): Promise<MemberProfileSaveResult> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!profile?.username?.trim()) {
      throw new Error("Username is required.");
    }

    if (!profile?.firstName?.trim() || !profile?.surname?.trim()) {
      throw new Error("First name and surname are required.");
    }

    return this.memberProfileRepository.createProfile(actorUsername, profile);
  }
}

export class UpdateMemberProfileUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    username,
    profile,
  }: ActorUsernameInput & {
    username: string;
    profile: MemberProfileFormInput;
  }): Promise<MemberProfileSaveResult> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    return this.memberProfileRepository.updateProfile(actorUsername, username, profile);
  }
}

export class AssignMemberRfidTagUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    username,
    rfidTag,
  }: ActorUsernameInput & {
    username: string;
    rfidTag: string;
  }): Promise<MemberProfileSaveResult> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    if (!rfidTag?.trim()) {
      throw new Error("An RFID tag is required.");
    }

    return this.memberProfileRepository.assignRfidTag(
      actorUsername,
      username,
      rfidTag,
    );
  }
}

export class ReturnLoanBowUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    username,
    loanBowReturn,
  }: ActorUsernameInput & {
    username: string;
    loanBowReturn: LoanBowReturnPayload;
  }): Promise<LoanBowReturnResult> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    return this.memberProfileRepository.returnLoanBow(
      actorUsername,
      username,
      loanBowReturn,
    );
  }
}

export class SignOffMemberDistanceUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({
    actorUsername,
    username,
    signOff,
  }: ActorUsernameInput & {
    username: string;
    signOff: DistanceSignOffInput;
  }): Promise<DistanceSignOffResult> {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    if (!signOff?.discipline?.trim()) {
      throw new Error("Choose a discipline.");
    }

    if (!signOff?.distanceYards) {
      throw new Error("Choose a distance.");
    }

    if (!signOff?.memberUsernameConfirmation?.trim()) {
      throw new Error("The member must enter their username to confirm.");
    }

    return this.memberProfileRepository.signOffDistance(
      actorUsername,
      username,
      signOff,
    );
  }
}

export class GetUserProfileUseCase {
  private readonly memberProfileRepository: MemberProfileRepository;

  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, signal }: ProfileTargetInput) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    return this.memberProfileRepository.getUserProfile(actorUsername, username, signal);
  }
}
