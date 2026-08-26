import { useMemo, useState } from "react";
import { normalizeMembershipClassification } from "../../../utils/memberClassification";
import { hasPermission } from "../../../utils/userProfile";
import type { LoanBowReturnPayload } from "../../../domain/entities/MemberProfile";
import { useProfilePageDataState } from "./useProfilePageDataState";
import {
  useProfileOutdoorTableState,
} from "./useProfileOutdoorTableState";
import { useProfileMemberActionsState } from "./useProfileMemberActionsState";
import {
  type OutdoorAchievementDateFieldKey,
  type Outdoor252SignOffFieldKey,
} from "./outdoorTableProfileUtils";

export function useProfilePageState({
  currentUserProfile,
  memberProfileCrud,
  onCurrentUserProfileUpdate,
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  const canManageMembers = hasPermission(
    currentUserProfile,
    "manage_members",
  );
  const canSignOffDistances = hasPermission(
    currentUserProfile,
    "sign_off_distances",
  );
  const canManageMemberDisciplines =
    canManageMembers ||
    hasPermission(currentUserProfile, "manage_member_disciplines");
  const canSelectMembers = canManageMembers || canSignOffDistances;
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const isGuest = currentUserProfile?.accountType === "guest";
  const profileDataState = useProfilePageDataState({
    actorUsername,
    canSelectMembers,
    currentUserProfile,
    isGuest,
    memberProfileCrud,
  });
  const {
    activeUsername,
    disciplineOptions,
    editableProfile,
    equipmentLoans,
    error,
    hasLoadedProfileRef,
    isInitialLoading,
    isRefreshingProfile,
    loadProfile,
    memberOptions,
    membershipStatusOptions,
    message,
    programmeTypeOptions,
    roleOptions,
    selectedUsername,
    setEditableProfile,
    setEquipmentLoans,
    setError,
    setMemberOptions,
    setMessage,
    setSelectedUsername,
  } = profileDataState;
  const canEditCurrentProfile =
    canManageMembers ||
    editableProfile?.username === currentUserProfile?.auth?.username;
  const canSignOffSelectedMember =
    canSignOffDistances &&
    Boolean(editableProfile?.username) &&
    editableProfile.username !== actorUsername;
  const canManageOutdoorAchievements =
    canManageMembers &&
    Boolean(editableProfile?.username) &&
    editableProfile.username !== actorUsername;
  const distanceSignOffDisciplines = useMemo(
    () =>
      editableProfile?.distanceSignOffs
        ?.filter((disciplineGroup) =>
          disciplineGroup.distances.some((distance) => !distance.signOff),
        )
        .map((disciplineGroup) => disciplineGroup.discipline) ?? [],
    [editableProfile?.distanceSignOffs],
  );
  const submitLabel = isSaving
    ? "Saving profile..."
    : isRefreshingProfile
      ? "Refreshing profile..."
      : "Save profile";

  const outdoorTableState = useProfileOutdoorTableState({
    activeUsername,
    actorUsername,
    canManageOutdoorAchievements,
    currentUserProfile,
    editableProfile,
    hasLoadedProfileRef,
    isGuest,
    loadProfile,
    memberProfileCrud,
    onClearMessages: () => {
      setError("");
      setMessage("");
    },
    onMessage: setMessage,
  });
  const memberActionsState = useProfileMemberActionsState({
    actorUsername,
    canManageMembers,
    canSignOffSelectedMember,
    currentUserProfile,
    distanceSignOffDisciplines,
    editableProfile,
    memberOptions,
    memberProfileCrud,
    onCurrentUserProfileUpdate,
    onProfileCleared: () => {
      setEditableProfile(null);
      setEquipmentLoans([]);
      outdoorTableState.resetOutdoorTableState();
    },
    onProfileUpdated: setEditableProfile,
    onClearMessages: () => {
      setError("");
      setMessage("");
    },
    onError: setError,
    onMessage: setMessage,
    setMemberOptions,
    setSelectedUsername,
  });

  const handleSelectMember = (nextSelection) => {
    setSelectedUsername(
      typeof nextSelection === "string"
        ? nextSelection
        : nextSelection?.target?.value ?? "",
    );
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setEditableProfile((current) => {
      const nextProfile = { ...current, [field]: value };

      if (field === "membershipStatus" || field === "programmeType") {
        return {
          ...nextProfile,
          ...normalizeMembershipClassification(nextProfile, field),
        };
      }

      return nextProfile;
    });
  };

  const handleBooleanSelectChange = (field, trueValue = "active") => (event) => {
    const value = event.target.value === trueValue;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBooleanChange = (field) => (event) => {
    const value = event.target.checked;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const toggleDiscipline = (discipline) => {
    setEditableProfile((current) => {
      const alreadySelected = current.disciplines.includes(discipline);

      return {
        ...current,
        disciplines: alreadySelected
          ? current.disciplines.filter((item) => item !== discipline)
          : [...current.disciplines, discipline],
      };
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    const requestBody = {
      firstName: editableProfile.firstName,
      surname: editableProfile.surname,
      goldenRecordsId: editableProfile.goldenRecordsId,
      archeryGbMembershipNumber: editableProfile.archeryGbMembershipNumber,
      emailAddress: editableProfile.emailAddress,
      password: editableProfile.password,
      rfidTag: canManageMembers ? editableProfile.rfidTag : undefined,
      activeMember: editableProfile.activeMember,
      affiliateMember: editableProfile.affiliateMember,
      juniorMember: editableProfile.juniorMember,
      membershipFeesDue: editableProfile.membershipFeesDue,
      coachingVolunteer: editableProfile.coachingVolunteer,
      userType: editableProfile.userType,
      membershipStatus: editableProfile.membershipStatus,
      programmeType: editableProfile.programmeType,
      disciplines: editableProfile.disciplines,
      loanBow: editableProfile.loanBow,
    };
    const normalizedRequestBody = {
      ...requestBody,
      ...normalizeMembershipClassification(requestBody),
    };

    const isSelfProfile =
      editableProfile.username === currentUserProfile?.auth?.username;

    try {
      const result = await memberProfileCrud.updateMemberProfileUseCase.execute({
        actorUsername,
        username: editableProfile.username,
        profile: normalizedRequestBody,
      });

      setEditableProfile(result.editableProfile);
      setMessage("Profile updated successfully.");

      if (canManageMembers) {
        const nextOptions = memberOptions.map((member) =>
          member.username === result.editableProfile.username
            ? {
                ...member,
                fullName: `${result.editableProfile.firstName} ${result.editableProfile.surname}`,
                userType: result.editableProfile.userType,
              }
            : member,
        );

        setMemberOptions(
          [...nextOptions].sort((left, right) =>
            left.fullName.localeCompare(right.fullName),
          ),
        );
      }

      if (isSelfProfile && onCurrentUserProfileUpdate) {
        onCurrentUserProfileUpdate(result.userProfile);
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnLoanBow = async (loanBowReturn: LoanBowReturnPayload) => {
    if (!editableProfile) {
      return;
    }

    setIsSavingReturn(true);
    setReturnError("");
    setError("");
    setMessage("");

    try {
      const result = await memberProfileCrud.returnLoanBowUseCase.execute({
        actorUsername,
        username: editableProfile.username,
        loanBowReturn,
      });

      setEditableProfile((current) => ({
        ...current,
        loanBow: result.loanBow,
      }));
      setMessage(`Loan bow return saved for ${result.member.fullName}.`);
      setIsReturnModalOpen(false);
    } catch (saveError) {
      setReturnError(saveError.message);
    } finally {
      setIsSavingReturn(false);
    }
  };

  const handleCloseReturnModal = () => {
    if (!isSavingReturn) {
      setIsReturnModalOpen(false);
      setReturnError("");
    }
  };

  return {
    canEditCurrentProfile,
    canManageMemberDisciplines,
    canManageMembers,
    canManageOutdoorAchievements,
    canSelectMembers,
    canSignOffSelectedMember,
    canSignOffDistances,
    cardIssueError: memberActionsState.cardIssueError,
    cardIssueStatus: memberActionsState.cardIssueStatus,
    cardIssueSuccess: memberActionsState.cardIssueSuccess,
    deleteConfirmationUsername: memberActionsState.deleteConfirmationUsername,
    deleteError: memberActionsState.deleteError,
    currentUserProfile,
    availableDistanceSignOffOptions: memberActionsState.availableDistanceSignOffOptions,
    disciplineOptions,
    distanceSignOffDisciplines,
    distanceSignOffForm: memberActionsState.distanceSignOffForm,
    distanceSignOffError: memberActionsState.distanceSignOffError,
    distanceSignOffOptions: memberActionsState.distanceSignOffOptions,
    editableProfile,
    equipmentLoans,
    error,
    goldenRecordsCandidateMatches: outdoorTableState.goldenRecordsCandidateMatches,
    goldenRecordsFetchedAt: outdoorTableState.goldenRecordsFetchedAt,
    goldenRecordsMatchError: outdoorTableState.goldenRecordsMatchError,
    goldenRecordsMatchSource: outdoorTableState.goldenRecordsMatchSource,
    goldenRecordsOutdoorHandicapsByBowType:
      outdoorTableState.goldenRecordsOutdoorHandicapsByBowType,
    goldenRecordsIndoorHandicapsByBowType:
      outdoorTableState.goldenRecordsIndoorHandicapsByBowType,
    handleAssignGoldenRecordsMatch: outdoorTableState.handleAssignGoldenRecordsMatch,
    handleBooleanChange,
    handleBooleanSelectChange,
    handleChange,
    handleCloseCardModal: memberActionsState.handleCloseCardModal,
    handleCloseDeleteModal: memberActionsState.handleCloseDeleteModal,
    handleCloseDistanceSignOffModal:
      memberActionsState.handleCloseDistanceSignOffModal,
    handleCloseGoldenRecordsMatchConfirmModal:
      outdoorTableState.handleCloseGoldenRecordsMatchConfirmModal,
    handleCloseGoldenRecordsMatchModal:
      outdoorTableState.handleCloseGoldenRecordsMatchModal,
    handleCloseReturnModal,
    handleDeleteConfirmationUsernameChange:
      memberActionsState.handleDeleteConfirmationUsernameChange,
    handleDeleteMember: memberActionsState.handleDeleteMember,
    handleDistanceSignOffChange: memberActionsState.handleDistanceSignOffChange,
    handleGoldenRecordsCandidateSelectionChange:
      outdoorTableState.handleGoldenRecordsCandidateSelectionChange,
    handleContinueGoldenRecordsMatchAssignment:
      outdoorTableState.handleContinueGoldenRecordsMatchAssignment,
    handleOpenCardModal: memberActionsState.handleOpenCardModal,
    handleOpenDeleteModal: memberActionsState.handleOpenDeleteModal,
    handleOpenDistanceSignOffModal:
      memberActionsState.handleOpenDistanceSignOffModal,
    handleOpenGoldenRecordsMatchModal:
      outdoorTableState.handleOpenGoldenRecordsMatchModal,
    handleOutdoorTableAward252SignOffDateChange:
      outdoorTableState.handleOutdoorTableAward252SignOffDateChange,
    handleOutdoorTableAchievementDateChange:
      outdoorTableState.handleOutdoorTableAchievementDateChange,
    handleOutdoorTableHandicapChange:
      outdoorTableState.handleOutdoorTableHandicapChange,
    handleRefreshGoldenRecordsHandicap:
      outdoorTableState.handleRefreshGoldenRecordsHandicap,
    handleReturnLoanBow,
    handleSave,
    handleSaveOutdoorTableEntry: outdoorTableState.handleSaveOutdoorTableEntry,
    handleSelectMember,
    handleSignOffDistance: memberActionsState.handleSignOffDistance,
    isCardModalOpen: memberActionsState.isCardModalOpen,
    isDeleteModalOpen: memberActionsState.isDeleteModalOpen,
    isDistanceSignOffModalOpen: memberActionsState.isDistanceSignOffModalOpen,
    isGuest,
    isInitialLoading,
    isDeletingMember: memberActionsState.isDeletingMember,
    isGoldenRecordsMatchConfirmModalOpen:
      outdoorTableState.isGoldenRecordsMatchConfirmModalOpen,
    isGoldenRecordsMatchModalOpen: outdoorTableState.isGoldenRecordsMatchModalOpen,
    isIssuingCard: memberActionsState.isIssuingCard,
    isRefreshingGoldenRecordsHandicap:
      outdoorTableState.isRefreshingGoldenRecordsHandicap,
    isRefreshingProfile,
    isReturnModalOpen,
    isSaving,
    isSavingDistanceSignOff: memberActionsState.isSavingDistanceSignOff,
    isSavingGoldenRecordsMatch: outdoorTableState.isSavingGoldenRecordsMatch,
    isSavingOutdoorTableByBowType: outdoorTableState.isSavingOutdoorTableByBowType,
    isSavingReturn,
    memberOptions,
    message,
    membershipStatusOptions,
    outdoorTableBowEntries: outdoorTableState.outdoorTableBowEntries,
    outdoorTableError: outdoorTableState.outdoorTableError,
    programmeTypeOptions,
    returnError,
    roleOptions,
    selectedGoldenRecordsCandidate: outdoorTableState.selectedGoldenRecordsCandidate,
    selectedGoldenRecordsCandidateId: outdoorTableState.selectedGoldenRecordsCandidateId,
    selectedUsername,
    submitLabel,
    toggleDiscipline,
    isLoadingOutdoorTable: outdoorTableState.isLoadingOutdoorTable,
  };
}
