export class GetMemberProfilePageDataUseCase {
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, signal }) {
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
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, signal }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.memberProfileRepository.getProfileOptions(actorUsername, signal);
  }
}

export class CreateMemberProfileUseCase {
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, profile }) {
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
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, profile }) {
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
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, rfidTag }) {
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
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, loanBowReturn }) {
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

export class GetUserProfileUseCase {
  constructor({ memberProfileRepository }) {
    this.memberProfileRepository = memberProfileRepository;
  }

  async execute({ actorUsername, username, signal }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!username?.trim()) {
      throw new Error("A member username is required.");
    }

    return this.memberProfileRepository.getUserProfile(actorUsername, username, signal);
  }
}
