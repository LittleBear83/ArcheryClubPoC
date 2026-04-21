import { EquipmentApi } from "../api/equipmentApi";
import { MemberProfileApi } from "../api/memberProfileApi";
import { RoleApi } from "../api/roleApi";
import { TournamentCrudApi } from "../api/tournamentCrudApi";
import { MemberProfileRepositoryImpl } from "../data/repositories/MemberProfileRepositoryImpl";
import { RoleRepositoryImpl } from "../data/repositories/RoleRepositoryImpl";
import { TournamentRepositoryImpl } from "../data/repositories/TournamentRepositoryImpl";
import { EquipmentRepositoryImpl } from "../data/repositories/EquipmentRepositoryImpl";
import {
  AssignMemberRfidTagUseCase,
  CreateMemberProfileUseCase,
  GetMemberProfileOptionsUseCase,
  GetMemberProfilePageDataUseCase,
  GetUserProfileUseCase,
  ReturnLoanBowUseCase,
  SignOffMemberDistanceUseCase,
  UpdateMemberProfileUseCase,
} from "../application/usecases/MemberProfileUseCases";
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  GetRolesSnapshotUseCase,
  UpdateRoleUseCase,
} from "../application/usecases/RoleUseCases";
import {
  CreateTournamentUseCase,
  DeleteTournamentUseCase,
  ListTournamentsUseCase,
  RegisterForTournamentUseCase,
  SubmitTournamentScoreUseCase,
  UpdateTournamentUseCase,
  WithdrawFromTournamentUseCase,
} from "../application/usecases/TournamentUseCases";
import {
  AddEquipmentStorageLocationUseCase,
  AddEquipmentItemUseCase,
  AssignEquipmentItemUseCase,
  DecommissionEquipmentItemUseCase,
  GetEquipmentDashboardUseCase,
  RemoveEquipmentStorageLocationUseCase,
  ReturnEquipmentItemUseCase,
  UpdateEquipmentStorageUseCase,
} from "../application/usecases/EquipmentUseCases";

export function createAppDependencies() {
  // Wire the frontend in layers: HTTP APIs -> repositories -> application use
  // cases. Components receive use cases instead of constructing transport code.
  const memberProfileApi = new MemberProfileApi();
  const roleApi = new RoleApi();
  const tournamentCrudApi = new TournamentCrudApi();
  const equipmentApi = new EquipmentApi();
  const memberProfileRepository = new MemberProfileRepositoryImpl({
    dataSource: memberProfileApi,
  });
  const roleRepository = new RoleRepositoryImpl({
    dataSource: roleApi,
  });
  const tournamentRepository = new TournamentRepositoryImpl({
    dataSource: tournamentCrudApi,
  });
  const equipmentRepository = new EquipmentRepositoryImpl({
    dataSource: equipmentApi,
  });

  return {
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
    signOffMemberDistanceUseCase: new SignOffMemberDistanceUseCase({
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
    addEquipmentStorageLocationUseCase: new AddEquipmentStorageLocationUseCase({
      equipmentRepository,
    }),
    removeEquipmentStorageLocationUseCase:
      new RemoveEquipmentStorageLocationUseCase({
        equipmentRepository,
      }),
  };
}

export type AppDependencies = ReturnType<typeof createAppDependencies>;
