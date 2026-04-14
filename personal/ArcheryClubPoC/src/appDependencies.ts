import { ClubApiDataSource } from "./data/sources/ClubApiDataSource";
import { MemberProfileRepositoryImpl } from "./data/repositories/MemberProfileRepositoryImpl";
import { RoleRepositoryImpl } from "./data/repositories/RoleRepositoryImpl";
import { TournamentRepositoryImpl } from "./data/repositories/TournamentRepositoryImpl";
import { EquipmentRepositoryImpl } from "./data/repositories/EquipmentRepositoryImpl";
import {
  AssignMemberRfidTagUseCase,
  CreateMemberProfileUseCase,
  GetMemberProfileOptionsUseCase,
  GetMemberProfilePageDataUseCase,
  GetUserProfileUseCase,
  ReturnLoanBowUseCase,
  UpdateMemberProfileUseCase,
} from "./application/usecases/MemberProfileUseCases";
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  GetRolesSnapshotUseCase,
  UpdateRoleUseCase,
} from "./application/usecases/RoleUseCases";
import {
  CreateTournamentUseCase,
  DeleteTournamentUseCase,
  ListTournamentsUseCase,
  RegisterForTournamentUseCase,
  SubmitTournamentScoreUseCase,
  UpdateTournamentUseCase,
  WithdrawFromTournamentUseCase,
} from "./application/usecases/TournamentUseCases";
import {
  AddEquipmentItemUseCase,
  AssignEquipmentItemUseCase,
  DecommissionEquipmentItemUseCase,
  GetEquipmentDashboardUseCase,
  ReturnEquipmentItemUseCase,
  UpdateEquipmentStorageUseCase,
} from "./application/usecases/EquipmentUseCases";

const clubApiDataSource = new ClubApiDataSource();
const memberProfileRepository = new MemberProfileRepositoryImpl({
  dataSource: clubApiDataSource,
});
const roleRepository = new RoleRepositoryImpl({
  dataSource: clubApiDataSource,
});
const tournamentRepository = new TournamentRepositoryImpl({
  dataSource: clubApiDataSource,
});
const equipmentRepository = new EquipmentRepositoryImpl({
  dataSource: clubApiDataSource,
});

export const appDependencies = {
  getMemberProfilePageDataUseCase: new GetMemberProfilePageDataUseCase({
    memberProfileRepository,
  }),
  getMemberProfileOptionsUseCase: new GetMemberProfileOptionsUseCase({
    memberProfileRepository,
  }),
  createMemberProfileUseCase: new CreateMemberProfileUseCase({
    memberProfileRepository,
  }),
  updateMemberProfileUseCase: new UpdateMemberProfileUseCase({
    memberProfileRepository,
  }),
  assignMemberRfidTagUseCase: new AssignMemberRfidTagUseCase({
    memberProfileRepository,
  }),
  returnLoanBowUseCase: new ReturnLoanBowUseCase({
    memberProfileRepository,
  }),
  getUserProfileUseCase: new GetUserProfileUseCase({
    memberProfileRepository,
  }),
  getRolesSnapshotUseCase: new GetRolesSnapshotUseCase({
    roleRepository,
  }),
  createRoleUseCase: new CreateRoleUseCase({
    roleRepository,
  }),
  updateRoleUseCase: new UpdateRoleUseCase({
    roleRepository,
  }),
  deleteRoleUseCase: new DeleteRoleUseCase({
    roleRepository,
  }),
  listTournamentsUseCase: new ListTournamentsUseCase({
    tournamentRepository,
  }),
  createTournamentUseCase: new CreateTournamentUseCase({
    tournamentRepository,
  }),
  updateTournamentUseCase: new UpdateTournamentUseCase({
    tournamentRepository,
  }),
  deleteTournamentUseCase: new DeleteTournamentUseCase({
    tournamentRepository,
  }),
  registerForTournamentUseCase: new RegisterForTournamentUseCase({
    tournamentRepository,
  }),
  withdrawFromTournamentUseCase: new WithdrawFromTournamentUseCase({
    tournamentRepository,
  }),
  submitTournamentScoreUseCase: new SubmitTournamentScoreUseCase({
    tournamentRepository,
  }),
  getEquipmentDashboardUseCase: new GetEquipmentDashboardUseCase({
    equipmentRepository,
  }),
  addEquipmentItemUseCase: new AddEquipmentItemUseCase({
    equipmentRepository,
  }),
  decommissionEquipmentItemUseCase: new DecommissionEquipmentItemUseCase({
    equipmentRepository,
  }),
  assignEquipmentItemUseCase: new AssignEquipmentItemUseCase({
    equipmentRepository,
  }),
  returnEquipmentItemUseCase: new ReturnEquipmentItemUseCase({
    equipmentRepository,
  }),
  updateEquipmentStorageUseCase: new UpdateEquipmentStorageUseCase({
    equipmentRepository,
  }),
};
