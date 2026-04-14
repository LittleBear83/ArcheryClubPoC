import { EquipmentRepository } from "../../domain/repositories/EquipmentRepository";

export class EquipmentRepositoryImpl extends EquipmentRepository {
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
}
