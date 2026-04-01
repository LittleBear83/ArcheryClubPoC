import { useEffect, useEffectEvent, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";

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
  const [editableProfile, setEditableProfile] = useState(EMPTY_PROFILE);
  const [disciplineOptions, setDisciplineOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = currentUserProfile?.membership?.role === "admin";

  const loadOptions = useEffectEvent(async (signal) => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
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

      setRoleOptions(result.userTypes ?? []);
      setDisciplineOptions(result.disciplines ?? []);
      setEditableProfile({
        ...EMPTY_PROFILE,
        userType:
          result.userTypes?.includes("general")
            ? "general"
            : result.userTypes?.[0] ?? "general",
      });
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
  }, [currentUserProfile, isAdmin, loadOptions]);

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

  if (!isAdmin) {
    return <p>Only admin users can create new member accounts.</p>;
  }

  return (
    <div className="profile-page">
      <p>Create a new member account for the system.</p>
      {isLoading ? <p>Loading user creation options...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isLoading ? (
        <MemberProfileForm
          editableProfile={editableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
          toggleDiscipline={toggleDiscipline}
          handleLoanBowFieldChange={handleLoanBowFieldChange}
          toggleLoanBowField={toggleLoanBowField}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          isAdmin
          isCreatingNew
          isSaving={isSaving}
          onSubmit={handleCreate}
          submitLabel={isSaving ? "Creating member..." : "Create member"}
        />
      ) : null}
    </div>
  );
}
