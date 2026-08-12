import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { normalizeMembershipClassification } from "../../utils/memberClassification";
import { hasPermission } from "../../utils/userProfile";

function buildGeneratedUsername(firstName, surname) {
  const normalizedFirstName = String(firstName ?? "").trim();
  const normalizedSurname = String(surname ?? "")
    .replace(/\s+/g, "")
    .trim();

  if (!normalizedFirstName && !normalizedSurname) {
    return "";
  }

  return `${normalizedFirstName.slice(0, 1)}${normalizedSurname}`;
}

const EMPTY_PROFILE = {
  username: "",
  firstName: "",
  surname: "",
  goldenRecordsId: "",
  archeryGbMembershipNumber: "",
  emailAddress: "",
  password: "",
  rfidTag: "",
  activeMember: true,
  affiliateMember: false,
  juniorMember: false,
  membershipFeesDue: new Date().toISOString().slice(0, 10),
  coachingVolunteer: false,
  userType: "general",
  membershipStatus: "member",
  programmeType: "none",
  disciplines: [],
  loanBow: {
    hasLoanBow: false,
    dateLoaned: new Date().toISOString().slice(0, 10),
    riserNumber: "",
    limbsNumber: "",
    arrowCount: 6,
    quiver: false,
    fingerTab: false,
    string: false,
    armGuard: false,
    chestGuard: false,
    sight: false,
    longRod: false,
    pressureButton: false,
  },
};

export function UserCreationPage({ currentUserProfile, memberProfileCrud }) {
  const [editableProfile, setEditableProfile] = useState(EMPTY_PROFILE);
  const [isUsernameManuallyEdited, setIsUsernameManuallyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const canManageMembers = hasPermission(
    currentUserProfile,
    "manage_members",
  );

  const optionsQuery = useQuery({
    queryKey: ["profile-options", actorUsername],
    queryFn: () =>
      memberProfileCrud.getMemberProfileOptionsUseCase.execute({
        actorUsername,
      }),
    enabled: canManageMembers,
  });

  const roleOptions = useMemo(
    () => optionsQuery.data?.userTypes ?? [],
    [optionsQuery.data?.userTypes],
  );
  const disciplineOptions = useMemo(
    () => optionsQuery.data?.disciplines ?? [],
    [optionsQuery.data?.disciplines],
  );
  const membershipStatusOptions = useMemo(
    () => optionsQuery.data?.membershipStatuses ?? ["member", "non-member", "guest"],
    [optionsQuery.data?.membershipStatuses],
  );
  const programmeTypeOptions = useMemo(
    () => optionsQuery.data?.programmeTypes ?? ["none", "beginners", "have-a-go", "taster-session"],
    [optionsQuery.data?.programmeTypes],
  );
  const isLoading = optionsQuery.isLoading;
  const defaultRole = useMemo(
    () =>
      roleOptions.includes("general")
        ? "general"
        : roleOptions[0] ?? "general",
    [roleOptions],
  );
  const effectiveEditableProfile = useMemo(
    () => ({
      ...editableProfile,
      userType: roleOptions.includes(editableProfile.userType)
        ? editableProfile.userType
        : defaultRole,
    }),
    [defaultRole, editableProfile, roleOptions],
  );

  const handleChange = (field) => (event) => {
    const value = event.target.value;

    setEditableProfile((current) => {
      if (field === "username") {
        setIsUsernameManuallyEdited(true);
        return { ...current, username: value };
      }

      if (
        !isUsernameManuallyEdited &&
        (field === "firstName" || field === "surname")
      ) {
        const nextProfile = { ...current, [field]: value };
        return {
          ...nextProfile,
          username: buildGeneratedUsername(
            nextProfile.firstName,
            nextProfile.surname,
          ),
        };
      }

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

  const handleBooleanChange = (field) => (event) => {
    const value = event.target.checked;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBooleanSelectChange = (field, trueValue = "active") => (event) => {
    const value = event.target.value === trueValue;
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

  const createUserMutation = useMutation({
    mutationFn: async () =>
      memberProfileCrud.createMemberProfileUseCase.execute({
        actorUsername,
        profile: {
          ...effectiveEditableProfile,
          ...normalizeMembershipClassification(effectiveEditableProfile),
        },
      }),
    onMutate: () => {
      setIsSaving(true);
      setError("");
      setMessage("");
    },
    onSuccess: async (result) => {
      setMessage(`Member ${result.editableProfile.username} created successfully.`);
      setEditableProfile({
        ...EMPTY_PROFILE,
        userType: defaultRole,
      });
      setIsUsernameManuallyEdited(false);
      await queryClient.invalidateQueries({ queryKey: ["profile-options", actorUsername] });
    },
    onError: (createError: Error) => {
      setError(createError.message);
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const handleCreate = async (event) => {
    event.preventDefault();
    await createUserMutation.mutateAsync();
  };

  if (!canManageMembers) {
    return <p>You do not have permission to create people accounts.</p>;
  }

  return (
    <div className="profile-page">
      <p>Create a new account for a member, non-member participant, or guest.</p>
      <StatusMessagePanel
        error={error}
        loading={isLoading && roleOptions.length === 0}
        loadingLabel="Loading member creation options..."
        success={message}
      />

      {roleOptions.length > 0 ? (
        <MemberProfileForm
          editableProfile={effectiveEditableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
          handleBooleanSelectChange={handleBooleanSelectChange}
          toggleDiscipline={toggleDiscipline}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          membershipStatusOptions={membershipStatusOptions}
          programmeTypeOptions={programmeTypeOptions}
          isAdmin={canManageMembers}
          isCreatingNew
          isSaving={isSaving || isLoading}
          canViewRfidTag={canManageMembers}
          onSubmit={handleCreate}
          submitLabel={isSaving ? "Creating member..." : "Create member"}
        />
      ) : null}
    </div>
  );
}
