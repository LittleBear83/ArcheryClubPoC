import type { EquipmentRepository } from "../../domain/repositories/EquipmentRepository";

// Equipment use cases centralise permission-neutral validation before the API
// layer performs the server-side permission checks and database updates.
export class GetEquipmentDashboardUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.equipmentRepository.getDashboard(actorUsername);
  }
}

export class AddEquipmentItemUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, payload }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.equipmentRepository.addItem(actorUsername, payload);
  }
}

export class DecommissionEquipmentItemUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, itemId, payload }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!itemId) {
      throw new Error("An equipment item id is required.");
    }

    return this.equipmentRepository.decommissionItem(actorUsername, itemId, payload);
  }
}

export class AssignEquipmentItemUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, payload }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.equipmentRepository.assignItem(actorUsername, payload);
  }
}

export class ReturnEquipmentItemUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, payload }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.equipmentRepository.returnItem(actorUsername, payload);
  }
}

export class UpdateEquipmentStorageUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, payload }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.equipmentRepository.updateStorage(actorUsername, payload);
  }
}

export class AddEquipmentStorageLocationUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, locationLabel }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!locationLabel?.trim()) {
      throw new Error("Enter a storage location name.");
    }

    return this.equipmentRepository.addStorageLocation(actorUsername, {
      locationLabel,
    });
  }
}

export class RemoveEquipmentStorageLocationUseCase {
  private readonly equipmentRepository: EquipmentRepository;

  constructor({ equipmentRepository }) {
    this.equipmentRepository = equipmentRepository;
  }

  async execute({ actorUsername, locationLabel }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!locationLabel?.trim()) {
      throw new Error("Choose a storage location to remove.");
    }

    return this.equipmentRepository.removeStorageLocation(
      actorUsername,
      locationLabel,
    );
  }
}
