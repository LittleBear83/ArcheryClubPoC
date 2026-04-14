export class ListTournamentsUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.tournamentRepository.listTournaments(actorUsername);
  }
}

export class CreateTournamentUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, form }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!form?.name?.trim()) {
      throw new Error("Tournament name is required.");
    }

    return this.tournamentRepository.createTournament(actorUsername, form);
  }
}

export class UpdateTournamentUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, tournamentId, form }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!tournamentId) {
      throw new Error("A tournament id is required.");
    }

    return this.tournamentRepository.updateTournament(actorUsername, tournamentId, form);
  }
}

export class DeleteTournamentUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, tournamentId }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!tournamentId) {
      throw new Error("A tournament id is required.");
    }

    return this.tournamentRepository.deleteTournament(actorUsername, tournamentId);
  }
}

export class RegisterForTournamentUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, tournamentId }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!tournamentId) {
      throw new Error("A tournament id is required.");
    }

    return this.tournamentRepository.registerForTournament(actorUsername, tournamentId);
  }
}

export class WithdrawFromTournamentUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, tournamentId }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!tournamentId) {
      throw new Error("A tournament id is required.");
    }

    return this.tournamentRepository.withdrawFromTournament(actorUsername, tournamentId);
  }
}

export class SubmitTournamentScoreUseCase {
  constructor({ tournamentRepository }) {
    this.tournamentRepository = tournamentRepository;
  }

  async execute({ actorUsername, tournamentId, scoreSubmission }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!tournamentId) {
      throw new Error("A tournament id is required.");
    }

    return this.tournamentRepository.submitTournamentScore(
      actorUsername,
      tournamentId,
      scoreSubmission,
    );
  }
}
