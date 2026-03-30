export class AddMemberUseCase {
  constructor({ memberRepository }) {
    this.memberRepository = memberRepository;
  }

  async execute(member) {
    if (!member?.name || member.name.trim() === "") {
      throw new Error("Member name is required");
    }
    return await this.memberRepository.addMember(member);
  }
}
