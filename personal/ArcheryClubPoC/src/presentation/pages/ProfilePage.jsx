import { useEffect, useEffectEvent, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

export function ProfilePage({ currentUserProfile, onCurrentUserProfileUpdate }) {
  const [editableProfile, setEditableProfile] = useState(null);
  const [memberOptions, setMemberOptions] = useState([]);
  const [selectedUsername, setSelectedUsername] = useState(
    currentUserProfile?.auth?.username ?? "",
  );
  const [disciplineOptions, setDisciplineOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnError, setReturnError] = useState("");
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  const isAdmin = currentUserProfile?.membership?.role === "admin";
  const isGuest = currentUserProfile?.accountType === "guest";

  const loadInitialData = useEffectEvent(async (signal) => {
    if (isGuest) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const profileResponse = await fetch(
        `/api/user-profiles/${currentUserProfile.auth.username}`,
        {
          headers: buildHeaders(currentUserProfile),
          signal,
        },
      );
      const profileResult = await profileResponse.json();

      if (!profileResponse.ok || !profileResult.success) {
        throw new Error(profileResult.message ?? "Unable to load your profile.");
      }

      if (signal?.aborted) {
        return;
      }

      setEditableProfile(profileResult.editableProfile);
      setRoleOptions(profileResult.userTypes ?? []);
      setDisciplineOptions(profileResult.disciplines ?? []);

      if (!isAdmin) {
        setSelectedUsername(profileResult.editableProfile.username);
        setIsLoading(false);
        return;
      }

      const optionsResponse = await fetch("/api/profile-options", {
        headers: buildHeaders(currentUserProfile),
        signal,
      });
      const optionsResult = await optionsResponse.json();

      if (!optionsResponse.ok || !optionsResult.success) {
        throw new Error(optionsResult.message ?? "Unable to load member options.");
      }

      if (signal?.aborted) {
        return;
      }

      setMemberOptions(optionsResult.members ?? []);
      setRoleOptions(optionsResult.userTypes ?? profileResult.userTypes ?? []);
      setDisciplineOptions(
        optionsResult.disciplines ?? profileResult.disciplines ?? [],
      );
      setSelectedUsername(profileResult.editableProfile.username);
      setIsLoading(false);
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadInitialData(abortController.signal);

    refresh();
    window.addEventListener("profile-data-updated", refresh);
    window.addEventListener("loan-bow-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refresh);
      window.removeEventListener("loan-bow-data-updated", refresh);
    };
  }, [currentUserProfile, isAdmin, isGuest, loadInitialData]);

  const loadSelectedProfile = useEffectEvent(async (signal) => {
    if (!isAdmin || isGuest) {
      return;
    }

    if (!selectedUsername) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/user-profiles/${selectedUsername}`, {
        headers: buildHeaders(currentUserProfile),
        signal,
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load member profile.");
      }

      if (signal?.aborted) {
        return;
      }

      setEditableProfile(result.editableProfile);
      setRoleOptions((current) => result.userTypes ?? current);
      setDisciplineOptions((current) => result.disciplines ?? current);
      setMessage("");
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
    loadSelectedProfile(abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [currentUserProfile, isAdmin, isGuest, selectedUsername, loadSelectedProfile]);

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

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    const requestBody = {
      firstName: editableProfile.firstName,
      surname: editableProfile.surname,
      password: editableProfile.password,
      rfidTag: editableProfile.rfidTag,
      activeMember: editableProfile.activeMember,
      membershipFeesDue: editableProfile.membershipFeesDue,
      userType: editableProfile.userType,
      disciplines: editableProfile.disciplines,
      loanBow: editableProfile.loanBow,
    };

    const isSelfProfile =
      editableProfile.username === currentUserProfile?.auth?.username;

    try {
      const response = await fetch(
        `/api/user-profiles/${editableProfile.username}`,
        {
          method: "PUT",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify(requestBody),
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to save profile changes.");
      }

      setEditableProfile(result.editableProfile);
      setMessage("Profile updated successfully.");

      if (isAdmin) {
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

  const handleReturnLoanBow = async (loanBowReturn) => {
    if (!editableProfile) {
      return;
    }

    setIsSavingReturn(true);
    setReturnError("");
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/loan-bow-profiles/${editableProfile.username}/return`,
        {
          method: "POST",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify({ loanBowReturn }),
        },
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to save the loan bow return.");
      }

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

  if (isGuest) {
    return <p>Guest logins do not have an editable member profile.</p>;
  }

  return (
    <div className="profile-page">
      <p>Manage your member profile and account details.</p>

      {isAdmin ? (
        <section className="profile-admin-panel">
          <h3 className="profile-section-title">Admin Member Update</h3>
          <label className="profile-member-select">
            Select member
            <select
              value={selectedUsername}
              onChange={(event) => setSelectedUsername(event.target.value)}
              disabled={isLoading || isSaving}
            >
              {memberOptions.map((member) => (
                <option key={member.username} value={member.username}>
                  {member.fullName} ({member.username})
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {isLoading ? <p>Loading profile...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isLoading && editableProfile ? (
        <MemberProfileForm
          editableProfile={editableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
          toggleDiscipline={toggleDiscipline}
          handleLoanBowFieldChange={handleLoanBowFieldChange}
          toggleLoanBowField={toggleLoanBowField}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          isAdmin={isAdmin}
          canEditLoanBow={isAdmin}
          canReturnLoanBow={isAdmin && editableProfile.loanBow.hasLoanBow}
          onReturnLoanBow={() => {
            setReturnError("");
            setIsReturnModalOpen(true);
          }}
          isCreatingNew={false}
          isSaving={isSaving}
          onSubmit={handleSave}
          submitLabel={isSaving ? "Saving profile..." : "Save profile"}
        />
      ) : null}

      {editableProfile ? (
        <LoanBowReturnModal
          open={isReturnModalOpen}
          loanBow={editableProfile.loanBow}
          isSaving={isSavingReturn}
          error={returnError}
          onClose={() => {
            if (!isSavingReturn) {
              setIsReturnModalOpen(false);
              setReturnError("");
            }
          }}
          onSubmit={handleReturnLoanBow}
        />
      ) : null}
    </div>
  );
}
