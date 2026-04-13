import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";

const EMPTY_PROFILE = {
  username: "",
  firstName: "",
  surname: "",
  password: "",
  rfidTag: "",
  activeMember: true,
  membershipFeesDue: new Date().toISOString().slice(0, 10),
  coachingVolunteer: false,
  userType: "general",
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

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

export function UserCreationPage({ currentUserProfile }) {
  const [editableProfile, setEditableProfile] = useState(EMPTY_PROFILE);
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
      fetchApi<{
        success: true;
        disciplines?: string[];
        userTypes?: string[];
      }>("/api/profile-options", {
        headers: buildHeaders(currentUserProfile),
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

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["profile-options", actorUsername] });
    };

    window.addEventListener("profile-data-updated", refresh);

    return () => {
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [actorUsername, queryClient]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBooleanChange = (field) => (event) => {
    const value = event.target.checked;
    setEditableProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBooleanSelectChange = (field) => (event) => {
    const value = event.target.value === "active";
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

  const handleLoanBowFieldChange = (field) => (event) => {
    const value = event.target.value;
    setEditableProfile((current) => ({
      ...current,
      loanBow: {
        ...current.loanBow,
        [field]: field === "arrowCount" ? Number.parseInt(value, 10) || value : value,
      },
    }));
  };

  const toggleLoanBowField = (field) => {
    setEditableProfile((current) => ({
      ...current,
      loanBow: {
        ...current.loanBow,
        [field]: !current.loanBow[field],
      },
    }));
  };

  const createUserMutation = useMutation({
    mutationFn: async () =>
      fetchApi<{ success: true; editableProfile: { username: string } }>(
        "/api/user-profiles",
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify(effectiveEditableProfile),
        },
      ),
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
      await queryClient.invalidateQueries({ queryKey: ["profile-options", actorUsername] });
      window.dispatchEvent(new Event("profile-data-updated"));
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
    return <p>You do not have permission to create member accounts.</p>;
  }

  return (
    <div className="profile-page">
      <p>Create a new member account for the system.</p>
      <StatusMessagePanel
        error={error}
        loading={isLoading && roleOptions.length === 0}
        loadingLabel="Loading user creation options..."
        success={message}
      />

      {roleOptions.length > 0 ? (
        <MemberProfileForm
          editableProfile={effectiveEditableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
          handleBooleanSelectChange={handleBooleanSelectChange}
          toggleDiscipline={toggleDiscipline}
          handleLoanBowFieldChange={handleLoanBowFieldChange}
          toggleLoanBowField={toggleLoanBowField}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          isAdmin={canManageMembers}
          isCreatingNew
          isSaving={isSaving || isLoading}
          onSubmit={handleCreate}
          submitLabel={isSaving ? "Creating member..." : "Create member"}
        />
      ) : null}
    </div>
  );
}
