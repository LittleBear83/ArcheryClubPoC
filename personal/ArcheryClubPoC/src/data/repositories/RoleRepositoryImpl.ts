import { RoleRepository } from "../../domain/repositories/RoleRepository";

type RoleDataSource = {
  getRolesSnapshot(actorUsername: string): Promise<{
    roles?: unknown[];
    permissions?: unknown[];
  }>;
  createRole(actorUsername: string, roleDefinition: unknown): Promise<{ role: unknown }>;
  updateRole(
    actorUsername: string,
    roleKey: string,
    roleDefinition: unknown,
  ): Promise<{ role: unknown }>;
  deleteRole(actorUsername: string, roleKey: string): Promise<void>;
};

export class RoleRepositoryImpl extends RoleRepository {
  private readonly dataSource: RoleDataSource;

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
