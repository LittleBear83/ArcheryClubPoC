import { EquipmentRepository } from "../../domain/repositories/EquipmentRepository";

type EquipmentDataSource = {
  getEquipmentDashboard(actorUsername: string): Promise<unknown>;
  addEquipmentItem(actorUsername: string, payload: unknown): Promise<unknown>;
  decommissionEquipmentItem(
    actorUsername: string,
    itemId: string | number,
    payload: unknown,
  ): Promise<unknown>;
  assignEquipmentItem(actorUsername: string, payload: unknown): Promise<unknown>;
  returnEquipmentItem(actorUsername: string, payload: unknown): Promise<unknown>;
  updateEquipmentStorage(actorUsername: string, payload: unknown): Promise<unknown>;
  addStorageLocation(actorUsername: string, payload: unknown): Promise<unknown>;
  removeStorageLocation(
    actorUsername: string,
    locationLabel: string,
  ): Promise<unknown>;
};

// Equipment repository groups inventory actions behind one domain contract so
// pages do not need to know which HTTP endpoints back each action.
export class EquipmentRepositoryImpl extends EquipmentRepository {
  private readonly dataSource: EquipmentDataSource;

  constructor({ dataSource }) {
    super();
    this.dataSource = dataSource;
  }

  async getDashboard(actorUsername) {
    return this.dataSource.getEquipmentDashboard(actorUsername);
  }

  async addItem(actorUsername, payload) {
    return this.dataSource.addEquipmentItem(actorUsername, payload);
  }

  async decommissionItem(actorUsername, itemId, payload) {
    return this.dataSource.decommissionEquipmentItem(actorUsername, itemId, payload);
  }

  async assignItem(actorUsername, payload) {
    return this.dataSource.assignEquipmentItem(actorUsername, payload);
  }

  async returnItem(actorUsername, payload) {
    return this.dataSource.returnEquipmentItem(actorUsername, payload);
  }

  async updateStorage(actorUsername, payload) {
    return this.dataSource.updateEquipmentStorage(actorUsername, payload);
  }

  async addStorageLocation(actorUsername, payload) {
    return this.dataSource.addStorageLocation(actorUsername, payload);
  }

  async removeStorageLocation(actorUsername, locationLabel) {
    return this.dataSource.removeStorageLocation(actorUsername, locationLabel);
  }
}
