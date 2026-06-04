import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasPermission } from "../../../utils/userProfile";
import { subscribeToRfidScans } from "../../../utils/rfidScanHub";
import type { LoanBowReturnPayload } from "../../../domain/entities/MemberProfile";

type LoadProfileOptions = {
  signal?: AbortSignal;
  isBackgroundRefresh?: boolean;
};

export function useProfilePageState({
  currentUserProfile,
  memberProfileCrud,
  onCurrentUserProfileUpdate,
}) {
  const hasLoadedProfileRef = useRef(false);
  const isIssuingCardRef = useRef(false);
  const [editableProfile, setEditableProfile] = useState(null);
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState(
    currentUserProfile?.auth?.username ?? "",
  );
  const [disciplineOptions, setDisciplineOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [cardIssueError, setCardIssueError] = useState("");
  const [cardIssueStatus, setCardIssueStatus] = useState("");
  const [cardIssueSuccess, setCardIssueSuccess] = useState("");
  const [isIssuingCard, setIsIssuingCard] = useState(false);
  const [equipmentLoans, setEquipmentLoans] = useState([]);
  const [isDistanceSignOffModalOpen, setIsDistanceSignOffModalOpen] =
    useState(false);
  const [distanceSignOffForm, setDistanceSignOffForm] = useState({
    discipline: "",
    distanceYards: "20",
    memberPasswordConfirmation: "",
  });
  const [distanceSignOffError, setDistanceSignOffError] = useState("");
  const [isSavingDistanceSignOff, setIsSavingDistanceSignOff] = useState(false);

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
  const activeUsername = useMemo(() => {
    if (isGuest) {
      return "";
    }

    return canSelectMembers
      ? selectedUsername || currentUserProfile?.auth?.username || ""
      : currentUserProfile?.auth?.username || "";
  }, [canSelectMembers, currentUserProfile, isGuest, selectedUsername]);
  const canEditCurrentProfile =
    canManageMembers ||
    editableProfile?.username === currentUserProfile?.auth?.username;
  const distanceSignOffDisciplines = useMemo(
    () =>
      editableProfile?.distanceSignOffs
        ?.filter((disciplineGroup) =>
          disciplineGroup.distances.some((distance) => !distance.signOff),
        )
        .map((disciplineGroup) => disciplineGroup.discipline) ?? [],
    [editableProfile?.distanceSignOffs],
  );
  const distanceSignOffOptions = useMemo(
    () =>
      editableProfile?.distanceSignOffs?.[0]?.distances.map(
        (distance) => distance.distanceYards,
      ) ?? [],
    [editableProfile?.distanceSignOffs],
  );
  const availableDistanceSignOffOptions = useMemo(() => {
    const selectedDisciplineGroup = editableProfile?.distanceSignOffs?.find(
      (disciplineGroup) =>
        disciplineGroup.discipline === distanceSignOffForm.discipline,
    );

    return selectedDisciplineGroup?.distances
      .filter((distance) => !distance.signOff)
      .map((distance) => distance.distanceYards) ?? [];
  }, [distanceSignOffForm.discipline, editableProfile?.distanceSignOffs]);
  const submitLabel = isSaving
    ? "Saving profile..."
    : isRefreshingProfile
      ? "Refreshing profile..."
      : "Save profile";

  useEffect(() => {
    hasLoadedProfileRef.current = false;
    setEditableProfile(null);
    setMemberOptions([]);
    setSelectedUsername(currentUserProfile?.auth?.username ?? "");
    setIsInitialLoading(true);
    setIsRefreshingProfile(false);
    setError("");
    setMessage("");
    setIsCardModalOpen(false);
    setEquipmentLoans([]);
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
    setIsIssuingCard(false);
    setIsDistanceSignOffModalOpen(false);
    setDistanceSignOffError("");
    setIsSavingDistanceSignOff(false);
  }, [currentUserProfile?.auth?.username]);

  useEffect(() => {
    isIssuingCardRef.current = isIssuingCard;
  }, [isIssuingCard]);

  const loadProfile = useCallback(
    async (
      username,
      { signal, isBackgroundRefresh = false }: LoadProfileOptions = {},
    ) => {
      if (isGuest || !username) {
        setIsInitialLoading(false);
        return;
      }

      if (isBackgroundRefresh) {
        setIsRefreshingProfile(true);
      } else {
        setIsInitialLoading(true);
      }

      setError("");

      try {
        const result =
          await memberProfileCrud.getMemberProfilePageDataUseCase.execute({
            actorUsername,
            username,
            signal,
          });

        if (signal?.aborted) {
          return;
        }

        setEditableProfile(result.editableProfile);
        setEquipmentLoans(result.equipmentLoans ?? []);
        setDisciplineOptions(result.disciplines ?? []);
        setRoleOptions(result.userTypes ?? []);
        setMessage("");
        hasLoadedProfileRef.current = true;
      } catch (loadError) {
        if (!signal?.aborted) {
          setError(loadError.message);
        }
      } finally {
        if (!signal?.aborted) {
          setIsInitialLoading(false);
          setIsRefreshingProfile(false);
        }
      }
    },
    [actorUsername, isGuest, memberProfileCrud],
  );

  const loadProfileOptions = useCallback(
    async (signal) => {
      if (!canSelectMembers || isGuest) {
        return;
      }

      try {
        const result =
          await memberProfileCrud.getMemberProfileOptionsUseCase.execute({
            actorUsername,
            signal,
          });

        if (signal?.aborted) {
          return;
        }

        setMemberOptions(result.members ?? []);
        setRoleOptions(result.userTypes ?? []);
        setDisciplineOptions(result.disciplines ?? []);
      } catch (loadError) {
        if (!signal?.aborted) {
          setError(loadError.message);
        }
      }
    },
    [actorUsername, canSelectMembers, isGuest, memberProfileCrud],
  );

  useEffect(() => {
    if (!canSelectMembers || isGuest) {
      return undefined;
    }

    const abortController = new AbortController();
    const refreshOptions = () => {
      loadProfileOptions(abortController.signal);
    };

    refreshOptions();
    window.addEventListener("profile-data-updated", refreshOptions);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refreshOptions);
    };
  }, [canSelectMembers, isGuest, loadProfileOptions]);

  useEffect(() => {
    if (!activeUsername) {
      return undefined;
    }

    const abortController = new AbortController();
    const refreshProfile = () => {
      loadProfile(activeUsername, {
        signal: abortController.signal,
        isBackgroundRefresh: hasLoadedProfileRef.current,
      });
    };

    refreshProfile();
    window.addEventListener("profile-data-updated", refreshProfile);
    window.addEventListener("loan-bow-data-updated", refreshProfile);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refreshProfile);
      window.removeEventListener("loan-bow-data-updated", refreshProfile);
    };
  }, [activeUsername, loadProfile]);

  useEffect(() => {
    if (!isCardModalOpen || !canManageMembers || !editableProfile?.username) {
      return undefined;
    }

    let isActive = true;

    const assignPresentedTag = async (rfidTag) => {
      if (!rfidTag || !isActive) {
        return;
      }

      setIsIssuingCard(true);
      setCardIssueError("");
      setCardIssueSuccess("");
      setCardIssueStatus(
        `Registering tag ${rfidTag} to ${editableProfile.firstName} ${editableProfile.surname}...`,
      );

      try {
        const result = await memberProfileCrud.assignMemberRfidTagUseCase.execute(
          {
            actorUsername,
            username: editableProfile.username,
            rfidTag,
          },
        );

        if (!isActive) {
          return;
        }

        setEditableProfile(result.editableProfile);
        setMemberOptions((current) =>
          current.map((member) =>
            member.username === result.editableProfile.username
              ? {
                  ...member,
                  fullName: `${result.editableProfile.firstName} ${result.editableProfile.surname}`,
                  userType: result.editableProfile.userType,
                }
              : member,
          ),
        );
        setMessage(
          `Card ${result.editableProfile.rfidTag} registered to ${result.editableProfile.firstName} ${result.editableProfile.surname}.`,
        );
        setCardIssueStatus("");
        setCardIssueSuccess(
          `Tag ${result.editableProfile.rfidTag} registered to ${result.editableProfile.firstName} ${result.editableProfile.surname}.`,
        );

        if (
          result.editableProfile.username === currentUserProfile?.auth?.username &&
          onCurrentUserProfileUpdate
        ) {
          onCurrentUserProfileUpdate(result.userProfile);
        }

        window.dispatchEvent(new Event("profile-data-updated"));
      } catch (assignError) {
        if (isActive) {
          setCardIssueError(assignError.message);
          setCardIssueSuccess("");
          setCardIssueStatus("Present a tag to try again.");
        }
      } finally {
        if (isActive) {
          setIsIssuingCard(false);
        }
      }
    };

    setCardIssueError("");
    setCardIssueStatus("Waiting for a card to be presented...");

    return subscribeToRfidScans(async (scan) => {
      if (!isActive || isIssuingCardRef.current || !scan?.rfidTag) {
        return;
      }

      try {
        await assignPresentedTag(scan.rfidTag);
      } catch {
        if (isActive) {
          setCardIssueStatus("Waiting for a card to be presented...");
        }
      }
    });
  }, [
    actorUsername,
    canManageMembers,
    currentUserProfile?.auth?.username,
    editableProfile,
    isCardModalOpen,
    memberProfileCrud,
    onCurrentUserProfileUpdate,
  ]);

  const handleSelectMember = (event) => {
    setSelectedUsername(event.target.value);
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBooleanSelectChange = (field) => (event) => {
    const value = event.target.value === "active";
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
      password: editableProfile.password,
      rfidTag: canManageMembers ? editableProfile.rfidTag : undefined,
      activeMember: editableProfile.activeMember,
      membershipFeesDue: editableProfile.membershipFeesDue,
      coachingVolunteer: editableProfile.coachingVolunteer,
      userType: editableProfile.userType,
      disciplines: editableProfile.disciplines,
      loanBow: editableProfile.loanBow,
    };

    const isSelfProfile =
      editableProfile.username === currentUserProfile?.auth?.username;

    try {
      const result = await memberProfileCrud.updateMemberProfileUseCase.execute({
        actorUsername,
        username: editableProfile.username,
        profile: requestBody,
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

      window.dispatchEvent(new Event("profile-data-updated"));
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
      window.dispatchEvent(new Event("loan-bow-data-updated"));
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

  const handleOpenCardModal = () => {
    setError("");
    setMessage("");
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
    setIsIssuingCard(false);
    setIsCardModalOpen(true);
  };

  const handleCloseCardModal = () => {
    setIsCardModalOpen(false);
    setIsIssuingCard(false);
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
  };

  const handleOpenDistanceSignOffModal = (nextSelection?: {
    discipline?: string;
    distanceYards?: number;
  }) => {
    if (!editableProfile?.disciplines?.length) {
      setError("Add at least one discipline before signing off a distance.");
      return;
    }

    if (!distanceSignOffDisciplines.length) {
      setError("All available distances are already signed off for this member.");
      return;
    }

    const selectedDiscipline =
      nextSelection?.discipline &&
      distanceSignOffDisciplines.includes(nextSelection.discipline)
        ? nextSelection.discipline
        : distanceSignOffDisciplines[0];
    const selectedDisciplineGroup = editableProfile.distanceSignOffs?.find(
      (disciplineGroup) => disciplineGroup.discipline === selectedDiscipline,
    );
    const unsignedDistances =
      selectedDisciplineGroup?.distances
        .filter((distance) => !distance.signOff)
        .map((distance) => distance.distanceYards) ?? [];
    const selectedDistance =
      nextSelection?.distanceYards &&
      unsignedDistances.includes(nextSelection.distanceYards)
        ? nextSelection.distanceYards
        : unsignedDistances[0];

    setError("");
    setMessage("");
    setDistanceSignOffError("");
    setDistanceSignOffForm({
      discipline: selectedDiscipline,
      distanceYards: String(selectedDistance ?? ""),
      memberPasswordConfirmation: "",
    });
    setIsDistanceSignOffModalOpen(true);
  };

  const handleCloseDistanceSignOffModal = () => {
    if (!isSavingDistanceSignOff) {
      setIsDistanceSignOffModalOpen(false);
      setDistanceSignOffError("");
    }
  };

  const handleDistanceSignOffChange = (field) => (event) => {
    const nextValue = event.target.value;

    setDistanceSignOffForm((current) => {
      if (field !== "discipline") {
        return {
          ...current,
          [field]: nextValue,
        };
      }

      const nextDisciplineGroup = editableProfile?.distanceSignOffs?.find(
        (disciplineGroup) => disciplineGroup.discipline === nextValue,
      );
      const nextUnsignedDistance =
        nextDisciplineGroup?.distances.find((distance) => !distance.signOff)
          ?.distanceYards ?? "";

      return {
        ...current,
        discipline: nextValue,
        distanceYards: String(nextUnsignedDistance),
      };
    });
  };

  const handleSignOffDistance = async (event) => {
    event.preventDefault();

    if (!editableProfile) {
      return;
    }

    setIsSavingDistanceSignOff(true);
    setDistanceSignOffError("");
    setError("");
    setMessage("");

    try {
      const result =
        await memberProfileCrud.signOffMemberDistanceUseCase.execute({
          actorUsername,
          username: editableProfile.username,
          signOff: {
            discipline: distanceSignOffForm.discipline,
            distanceYards: Number.parseInt(
              distanceSignOffForm.distanceYards,
              10,
            ),
            memberPasswordConfirmation:
              distanceSignOffForm.memberPasswordConfirmation,
          },
        });

      setEditableProfile(result.editableProfile);
      setMessage(result.message ?? "Distance signed off successfully.");
      setIsDistanceSignOffModalOpen(false);
      window.dispatchEvent(new Event("profile-data-updated"));
    } catch (signOffError) {
      setDistanceSignOffError(signOffError.message);
    } finally {
      setIsSavingDistanceSignOff(false);
    }
  };

  return {
    canEditCurrentProfile,
    canManageMemberDisciplines,
    canManageMembers,
    canSelectMembers,
    canSignOffDistances,
    cardIssueError,
    cardIssueStatus,
    cardIssueSuccess,
    currentUserProfile,
    availableDistanceSignOffOptions,
    disciplineOptions,
    distanceSignOffDisciplines,
    distanceSignOffForm,
    distanceSignOffError,
    distanceSignOffOptions,
    editableProfile,
    equipmentLoans,
    error,
    handleBooleanChange,
    handleBooleanSelectChange,
    handleChange,
    handleCloseCardModal,
    handleCloseDistanceSignOffModal,
    handleCloseReturnModal,
    handleDistanceSignOffChange,
    handleOpenCardModal,
    handleOpenDistanceSignOffModal,
    handleReturnLoanBow,
    handleSave,
    handleSelectMember,
    handleSignOffDistance,
    isCardModalOpen,
    isDistanceSignOffModalOpen,
    isGuest,
    isInitialLoading,
    isIssuingCard,
    isRefreshingProfile,
    isReturnModalOpen,
    isSaving,
    isSavingDistanceSignOff,
    isSavingReturn,
    memberOptions,
    message,
    returnError,
    roleOptions,
    selectedUsername,
    submitLabel,
    toggleDiscipline,
  };
}
