import type { RoleRepository } from "../../domain/repositories/RoleRepository";

// Role use cases keep role-management screens from calling repositories with
// missing actor or role identifiers.
export class GetRolesSnapshotUseCase {
  private readonly roleRepository: RoleRepository;

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
  private readonly roleRepository: RoleRepository;

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
  private readonly roleRepository: RoleRepository;

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
  private readonly roleRepository: RoleRepository;

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
