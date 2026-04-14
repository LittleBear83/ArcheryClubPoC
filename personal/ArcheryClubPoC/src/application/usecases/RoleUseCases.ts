export class GetRolesSnapshotUseCase {
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  async execute({ actorUsername }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    return this.roleRepository.getRolesSnapshot(actorUsername);
  }
}

export class CreateRoleUseCase {
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  async execute({ actorUsername, roleDefinition }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!roleDefinition?.title?.trim()) {
      throw new Error("Role title is required.");
    }

    return this.roleRepository.createRole(actorUsername, roleDefinition);
  }
}

export class UpdateRoleUseCase {
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  async execute({ actorUsername, roleKey, roleDefinition }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!roleKey?.trim()) {
      throw new Error("A role key is required.");
    }

    return this.roleRepository.updateRole(actorUsername, roleKey, roleDefinition);
  }
}

export class DeleteRoleUseCase {
  constructor({ roleRepository }) {
    this.roleRepository = roleRepository;
  }

  async execute({ actorUsername, roleKey }) {
    if (!actorUsername?.trim()) {
      throw new Error("An authenticated member is required.");
    }

    if (!roleKey?.trim()) {
      throw new Error("A role key is required.");
    }

    return this.roleRepository.deleteRole(actorUsername, roleKey);
  }
}
