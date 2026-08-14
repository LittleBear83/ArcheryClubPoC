import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToRfidScans } from "../../../utils/rfidScanHub";

export function useProfileMemberActionsState({
  actorUsername,
  canManageMembers,
  canSignOffSelectedMember,
  currentUserProfile,
  distanceSignOffDisciplines,
  editableProfile,
  memberOptions,
  memberProfileCrud,
  onCurrentUserProfileUpdate,
  onProfileCleared,
  onProfileUpdated,
  onClearMessages,
  onError,
  onMessage,
  setMemberOptions,
  setSelectedUsername,
}: {
  actorUsername: string;
  canManageMembers: boolean;
  canSignOffSelectedMember: boolean;
  currentUserProfile: any;
  distanceSignOffDisciplines: string[];
  editableProfile: any;
  memberOptions: any[];
  memberProfileCrud: any;
  onCurrentUserProfileUpdate?: (userProfile: unknown) => void;
  onProfileCleared: () => void;
  onProfileUpdated: (editableProfile: any) => void;
  onClearMessages: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  setMemberOptions: React.Dispatch<React.SetStateAction<any[]>>;
  setSelectedUsername: React.Dispatch<React.SetStateAction<string>>;
}) {
  const isIssuingCardRef = useRef(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [cardIssueError, setCardIssueError] = useState("");
  const [cardIssueStatus, setCardIssueStatus] = useState("");
  const [cardIssueSuccess, setCardIssueSuccess] = useState("");
  const [isIssuingCard, setIsIssuingCard] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationUsername, setDeleteConfirmationUsername] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [isDistanceSignOffModalOpen, setIsDistanceSignOffModalOpen] = useState(false);
  const [distanceSignOffForm, setDistanceSignOffForm] = useState({
    discipline: "",
    distanceYards: "20",
    memberPasswordConfirmation: "",
  });
  const [distanceSignOffError, setDistanceSignOffError] = useState("");
  const [isSavingDistanceSignOff, setIsSavingDistanceSignOff] = useState(false);

  const distanceSignOffOptions = useMemo(
    () =>
      editableProfile?.distanceSignOffs?.[0]?.distances.map(
        (distance) => distance.distanceYards,
      ) ?? [],
    [editableProfile?.distanceSignOffs],
  );
  const availableDistanceSignOffOptions = useMemo(() => {
    const selectedDisciplineGroup = editableProfile?.distanceSignOffs?.find(
      (disciplineGroup) => disciplineGroup.discipline === distanceSignOffForm.discipline,
    );

    return selectedDisciplineGroup?.distances
      .filter((distance) => !distance.signOff)
      .map((distance) => distance.distanceYards) ?? [];
  }, [distanceSignOffForm.discipline, editableProfile?.distanceSignOffs]);

  useEffect(() => {
    isIssuingCardRef.current = isIssuingCard;
  }, [isIssuingCard]);

  useEffect(() => {
    setIsCardModalOpen(false);
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
    setIsIssuingCard(false);
    setIsDeleteModalOpen(false);
    setDeleteConfirmationUsername("");
    setDeleteError("");
    setIsDeletingMember(false);
    setIsDistanceSignOffModalOpen(false);
    setDistanceSignOffError("");
    setIsSavingDistanceSignOff(false);
  }, [currentUserProfile?.auth?.username]);

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
        const result = await memberProfileCrud.assignMemberRfidTagUseCase.execute({
          actorUsername,
          username: editableProfile.username,
          rfidTag,
        });

        if (!isActive) {
          return;
        }

        onProfileUpdated(result.editableProfile);
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
        onMessage(
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
    onMessage,
    onProfileUpdated,
    setMemberOptions,
  ]);

  const handleOpenCardModal = () => {
    onClearMessages();
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

  const handleOpenDeleteModal = () => {
    onClearMessages();
    setDeleteError("");
    setDeleteConfirmationUsername("");
    setIsDeleteModalOpen(true);
  };

  const handleCloseDeleteModal = () => {
    if (!isDeletingMember) {
      setIsDeleteModalOpen(false);
      setDeleteConfirmationUsername("");
      setDeleteError("");
    }
  };

  const handleDeleteConfirmationUsernameChange = (event) => {
    setDeleteConfirmationUsername(event.target.value);
  };

  const handleDeleteMember = async () => {
    if (!editableProfile?.username) {
      return;
    }

    setIsDeletingMember(true);
    setDeleteError("");
    onClearMessages();

    try {
      const result = await memberProfileCrud.deleteMemberProfileUseCase.execute({
        actorUsername,
        username: editableProfile.username,
        confirmationUsername: deleteConfirmationUsername,
      });
      const remainingMembers = memberOptions.filter(
        (member) => member.username !== result.deletedUsername,
      );

      setMemberOptions(remainingMembers);
      onProfileCleared();
      setSelectedUsername(
        remainingMembers[0]?.username ?? currentUserProfile?.auth?.username ?? "",
      );
      onMessage(result.message ?? `${result.deletedUsername} deleted successfully.`);
      setIsDeleteModalOpen(false);
      setDeleteConfirmationUsername("");
    } catch (deleteMemberError) {
      setDeleteError(deleteMemberError.message);
    } finally {
      setIsDeletingMember(false);
    }
  };

  const handleOpenDistanceSignOffModal = (nextSelection?: {
    discipline?: string;
    distanceYards?: number;
  }) => {
    if (!canSignOffSelectedMember) {
      onError(
        "Members cannot sign themselves off. Another authorised member must complete the sign-off.",
      );
      return;
    }

    if (!editableProfile?.disciplines?.length) {
      onError("Add at least one discipline before signing off a distance.");
      return;
    }

    if (!distanceSignOffDisciplines.length) {
      onError("All available distances are already signed off for this member.");
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

    onClearMessages();
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
        nextDisciplineGroup?.distances.find((distance) => !distance.signOff)?.distanceYards ?? "";

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
    onClearMessages();

    try {
      const result = await memberProfileCrud.signOffMemberDistanceUseCase.execute({
        actorUsername,
        username: editableProfile.username,
        signOff: {
          discipline: distanceSignOffForm.discipline,
          distanceYards: Number.parseInt(distanceSignOffForm.distanceYards, 10),
          memberPasswordConfirmation: distanceSignOffForm.memberPasswordConfirmation,
        },
      });

      onProfileUpdated(result.editableProfile);
      onMessage(result.message ?? "Distance signed off successfully.");
      setIsDistanceSignOffModalOpen(false);
    } catch (signOffError) {
      setDistanceSignOffError(signOffError.message);
    } finally {
      setIsSavingDistanceSignOff(false);
    }
  };

  return {
    availableDistanceSignOffOptions,
    cardIssueError,
    cardIssueStatus,
    cardIssueSuccess,
    deleteConfirmationUsername,
    deleteError,
    distanceSignOffForm,
    distanceSignOffError,
    distanceSignOffOptions,
    handleCloseCardModal,
    handleCloseDeleteModal,
    handleCloseDistanceSignOffModal,
    handleDeleteConfirmationUsernameChange,
    handleDeleteMember,
    handleDistanceSignOffChange,
    handleOpenCardModal,
    handleOpenDeleteModal,
    handleOpenDistanceSignOffModal,
    handleSignOffDistance,
    isCardModalOpen,
    isDeleteModalOpen,
    isDeletingMember,
    isDistanceSignOffModalOpen,
    isIssuingCard,
    isSavingDistanceSignOff,
  };
}
