import { RoleRepository } from "../../domain/repositories/RoleRepository";

export class RoleRepositoryImpl extends RoleRepository {
  constructor({ dataSource }) {
    super();
    this.dataSource = dataSource;
  }

  async getRolesSnapshot(actorUsername) {
    const result = await this.dataSource.getRolesSnapshot(actorUsername);

    return {
      roles: result.roles ?? [],
      permissions: result.permissions ?? [],
    };
  }

  async createRole(actorUsername, roleDefinition) {
    const result = await this.dataSource.createRole(actorUsername, roleDefinition);
    return result.role;
  }

  async updateRole(actorUsername, roleKey, roleDefinition) {
    const result = await this.dataSource.updateRole(actorUsername, roleKey, roleDefinition);
    return result.role;
  }

  async deleteRole(actorUsername, roleKey) {
    await this.dataSource.deleteRole(actorUsername, roleKey);
  }
}
