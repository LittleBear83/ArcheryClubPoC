export class GetMembersUseCase {
  constructor({ memberRepository }) {
    this.memberRepository = memberRepository;
  }

  async execute() {
    return await this.memberRepository.getAllMembers();
  }
}
