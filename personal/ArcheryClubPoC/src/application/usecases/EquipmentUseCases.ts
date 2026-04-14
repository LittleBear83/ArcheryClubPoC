export class GetEquipmentDashboardUseCase {
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
