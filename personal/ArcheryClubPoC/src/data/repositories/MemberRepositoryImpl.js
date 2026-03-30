import { MemberRepository } from "../../domain/repositories/MemberRepository";
import { MemberModel } from "../models/MemberModel";

export class MemberRepositoryImpl extends MemberRepository {
  constructor({ dataSource }) {
    super();
    this.dataSource = dataSource;
  }

  async getAllMembers() {
    const rawList = await this.dataSource.getAll();
    return rawList.map((raw) => MemberModel.toEntity(raw));
  }

  async addMember(member) {
    const newMember = await this.dataSource.add(member);
    return MemberModel.toEntity(newMember);
  }
}
