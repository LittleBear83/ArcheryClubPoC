import { useCallback, useEffect, useRef, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

async function readJsonResponse(response) {
  const responseText = await response.text();

  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      "Unable to load the profile page. If the server was already running, restart it and try again.",
    );
  }
}

export function ProfilePage({ currentUserProfile, onCurrentUserProfileUpdate }) {
  const hasLoadedProfileRef = useRef(false);
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

  const isAdmin = currentUserProfile?.membership?.role === "admin";
  const isGuest = currentUserProfile?.accountType === "guest";

  useEffect(() => {
    hasLoadedProfileRef.current = false;
    setEditableProfile(null);
    setMemberOptions([]);
    setSelectedUsername(currentUserProfile?.auth?.username ?? "");
    setIsInitialLoading(true);
    setIsRefreshingProfile(false);
    setError("");
    setMessage("");
  }, [currentUserProfile?.auth?.username]);

  const loadProfile = useCallback(
    async (username, { signal, isBackgroundRefresh = false } = {}) => {
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
        const response = await fetch(`/api/user-profiles/${username}`, {
          headers: buildHeaders(currentUserProfile),
          signal,
          cache: "no-store",
        });
        const result = await readJsonResponse(response);

        if (!response.ok || !result.success) {
          throw new Error(
            result.message ??
              (username === currentUserProfile?.auth?.username
                ? "Unable to load your profile."
                : "Unable to load member profile."),
          );
        }

        if (signal?.aborted) {
          return;
        }

        setEditableProfile(result.editableProfile);
        setRoleOptions((current) => result.userTypes ?? current);
        setDisciplineOptions((current) => result.disciplines ?? current);
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
    [currentUserProfile, isGuest],
  );

  const loadInitialData = useCallback(
    async (signal) => {
      if (isGuest) {
        setIsInitialLoading(false);
        return;
      }

      const initialUsername = isAdmin
        ? selectedUsername || currentUserProfile?.auth?.username
        : currentUserProfile?.auth?.username;

      if (!initialUsername) {
        setIsInitialLoading(false);
        return;
      }

      if (hasLoadedProfileRef.current) {
        setIsRefreshingProfile(true);
      } else {
        setIsInitialLoading(true);
      }

      setError("");

      try {
        if (isAdmin) {
          const optionsResponse = await fetch("/api/profile-options", {
            headers: buildHeaders(currentUserProfile),
            signal,
            cache: "no-store",
          });
          const optionsResult = await readJsonResponse(optionsResponse);

          if (!optionsResponse.ok || !optionsResult.success) {
            throw new Error(
              optionsResult.message ?? "Unable to load member options.",
            );
          }

          if (signal?.aborted) {
            return;
          }

          setMemberOptions(optionsResult.members ?? []);
          setRoleOptions(optionsResult.userTypes ?? []);
          setDisciplineOptions(optionsResult.disciplines ?? []);
        }

        await loadProfile(initialUsername, {
          signal,
          isBackgroundRefresh: hasLoadedProfileRef.current,
        });

        if (!signal?.aborted) {
          setSelectedUsername(initialUsername);
        }
      } catch (loadError) {
        if (!signal?.aborted) {
          setError(loadError.message);
          setIsInitialLoading(false);
          setIsRefreshingProfile(false);
        }
      }
    },
    [
      currentUserProfile,
      isAdmin,
      isGuest,
      loadProfile,
      selectedUsername,
    ],
  );

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => {
      loadInitialData(abortController.signal);
    };

    refresh();
    window.addEventListener("profile-data-updated", refresh);
    window.addEventListener("loan-bow-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refresh);
      window.removeEventListener("loan-bow-data-updated", refresh);
    };
  }, [loadInitialData]);

  useEffect(() => {
    if (!isAdmin || isGuest || !selectedUsername) {
      return undefined;
    }

    if (!editableProfile) {
      return undefined;
    }

    if (editableProfile.username === selectedUsername) {
      return undefined;
    }

    const abortController = new AbortController();
    loadProfile(selectedUsername, { signal: abortController.signal });

    return () => {
      abortController.abort();
    };
  }, [editableProfile, isAdmin, isGuest, loadProfile, selectedUsername]);

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
              disabled={isInitialLoading || isRefreshingProfile || isSaving}
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

      {isInitialLoading ? <p>Loading profile...</p> : null}
      {isRefreshingProfile && !isInitialLoading ? (
        <p>Refreshing profile details...</p>
      ) : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {!isInitialLoading && editableProfile ? (
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
          isSaving={isSaving || isRefreshingProfile}
          onSubmit={handleSave}
          submitLabel={
            isSaving
              ? "Saving profile..."
              : isRefreshingProfile
                ? "Refreshing profile..."
                : "Save profile"
          }
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
