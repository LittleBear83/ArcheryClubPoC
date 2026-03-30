import { Member } from "../../domain/entities/Member";

const initialMembers = [
  new Member({ id: "1", name: "Alice", role: "Coach", joinedAt: "2024-01-10" }),
  new Member({ id: "2", name: "Bob", role: "Archer", joinedAt: "2024-02-05" }),
];

export class InMemoryMemberDataSource {
  constructor() {
    this.members = [...initialMembers];
  }

  async getAll() {
    return [...this.members];
  }

  async add(member) {
    this.members.push(member);
    return member;
  }
}
