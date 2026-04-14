export abstract class RoleRepository {
  abstract getRolesSnapshot(actorUsername: string): Promise<unknown>;

  abstract createRole(actorUsername: string, roleDefinition: unknown): Promise<unknown>;

  abstract updateRole(actorUsername: string, roleKey: string, roleDefinition: unknown): Promise<unknown>;

  abstract deleteRole(actorUsername: string, roleKey: string): Promise<void>;
}
