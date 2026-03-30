import { Member } from "../../domain/entities/Member";

export class MemberModel {
  static fromEntity(member) {
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      joinedAt: member.joinedAt,
    };
  }

  static toEntity(raw) {
    return new Member({
      id: raw.id,
      name: raw.name,
      role: raw.role,
      joinedAt: raw.joinedAt,
    });
  }
}
