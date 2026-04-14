export abstract class EquipmentRepository {
  abstract getDashboard(actorUsername: string): Promise<unknown>;

  abstract addItem(actorUsername: string, payload: unknown): Promise<unknown>;

  abstract decommissionItem(
    actorUsername: string,
    itemId: string | number,
    payload: unknown,
  ): Promise<unknown>;

  abstract assignItem(actorUsername: string, payload: unknown): Promise<unknown>;

  abstract returnItem(actorUsername: string, payload: unknown): Promise<unknown>;

  abstract updateStorage(actorUsername: string, payload: unknown): Promise<unknown>;
}
