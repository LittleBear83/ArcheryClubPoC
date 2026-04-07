import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { hasPermission } from "../../utils/userProfile";

const EMPTY_PROFILE = {
  username: "",
  firstName: "",
  surname: "",
  password: "",
  rfidTag: "",
  activeMember: true,
  membershipFeesDue: new Date().toISOString().slice(0, 10),
  userType: "general",
  disciplines: [],
  loanBow: {
    hasLoanBow: false,
    dateLoaned: new Date().toISOString().slice(0, 10),
    riserNumber: "",
    limbsNumber: "",
    arrowCount: 6,
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
  const hasLoadedOptionsRef = useRef(false);
  const [editableProfile, setEditableProfile] = useState(EMPTY_PROFILE);
  const [disciplineOptions, setDisciplineOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const canManageMembers = hasPermission(
    currentUserProfile,
    "manage_members",
  );

  const loadOptions = useEffectEvent(async (signal) => {
    if (!canManageMembers) {
      setIsLoading(false);
      return;
    }

    if (!hasLoadedOptionsRef.current) {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/profile-options", {
        headers: buildHeaders(currentUserProfile),
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load user creation options.");
      }

      if (signal?.aborted) {
        return;
      }

      const nextRoleOptions = result.userTypes ?? [];
      const defaultRole = nextRoleOptions.includes("general")
        ? "general"
        : nextRoleOptions[0] ?? "general";

      setRoleOptions(nextRoleOptions);
      setDisciplineOptions(result.disciplines ?? []);
      setEditableProfile((current) => ({
        ...current,
        userType: nextRoleOptions.includes(current.userType)
          ? current.userType
          : defaultRole,
      }));
      hasLoadedOptionsRef.current = true;
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadOptions(abortController.signal);

    refresh();
    window.addEventListener("profile-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [actorUsername, canManageMembers]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
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

  const handleCreate = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/user-profiles", {
        method: "POST",
        headers: buildHeaders(currentUserProfile),
        body: JSON.stringify(editableProfile),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to create member.");
      }

      setMessage(`Member ${result.editableProfile.username} created successfully.`);
      setEditableProfile({
        ...EMPTY_PROFILE,
        userType: roleOptions.includes("general") ? "general" : roleOptions[0] ?? "general",
      });
      window.dispatchEvent(new Event("profile-data-updated"));
    } catch (createError) {
      setError(createError.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!canManageMembers) {
    return <p>You do not have permission to create member accounts.</p>;
  }

  return (
    <div className="profile-page">
      <p>Create a new member account for the system.</p>
      {isLoading && roleOptions.length === 0 ? (
        <p>Loading user creation options...</p>
      ) : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {roleOptions.length > 0 ? (
        <MemberProfileForm
          editableProfile={editableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
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
