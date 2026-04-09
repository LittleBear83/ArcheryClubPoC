import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";
import { Modal } from "../components/Modal";
import { hasPermission } from "../../utils/userProfile";
import { subscribeToRfidScans } from "../../utils/rfidScanHub";

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

  const canManageMembers = hasPermission(
    currentUserProfile,
    "manage_members",
  );
  const isGuest = currentUserProfile?.accountType === "guest";
  const activeUsername = useMemo(() => {
    if (isGuest) {
      return "";
    }

    return canManageMembers
      ? selectedUsername || currentUserProfile?.auth?.username || ""
      : currentUserProfile?.auth?.username || "";
  }, [canManageMembers, currentUserProfile, isGuest, selectedUsername]);

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
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
    setIsIssuingCard(false);
  }, [currentUserProfile?.auth?.username]);

  useEffect(() => {
    isIssuingCardRef.current = isIssuingCard;
  }, [isIssuingCard]);

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

  const loadProfileOptions = useCallback(
    async (signal) => {
      if (!canManageMembers || isGuest) {
        return;
      }

      try {
        const response = await fetch("/api/profile-options", {
          headers: buildHeaders(currentUserProfile),
          signal,
          cache: "no-store",
        });
        const result = await readJsonResponse(response);

        if (!response.ok || !result.success) {
          throw new Error(result.message ?? "Unable to load member options.");
        }

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
    [canManageMembers, currentUserProfile, isGuest],
  );

  useEffect(() => {
    if (!canManageMembers || isGuest) {
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
  }, [canManageMembers, isGuest, loadProfileOptions]);

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
      setCardIssueStatus(`Registering tag ${rfidTag} to ${editableProfile.firstName} ${editableProfile.surname}...`);

      try {
        let response = await fetch(
          `/api/user-profiles/${editableProfile.username}/assign-rfid`,
          {
            method: "POST",
            headers: buildHeaders(currentUserProfile),
            body: JSON.stringify({ rfidTag }),
          },
        );
        let result = await readJsonResponse(response);

        if (response.status === 404) {
          response = await fetch(`/api/user-profiles/${editableProfile.username}`, {
            method: "PUT",
            headers: buildHeaders(currentUserProfile),
            body: JSON.stringify({
              firstName: editableProfile.firstName,
              surname: editableProfile.surname,
              password: editableProfile.password,
              rfidTag,
              activeMember: editableProfile.activeMember,
              membershipFeesDue: editableProfile.membershipFeesDue,
              userType: editableProfile.userType,
              disciplines: editableProfile.disciplines,
              loanBow: editableProfile.loanBow,
            }),
          });
          result = await readJsonResponse(response);
        }

        if (!isActive) {
          return;
        }

        if (!response.ok || !result.success) {
          throw new Error(result.message ?? "Unable to issue the member card.");
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
        setMessage(`Card ${result.editableProfile.rfidTag} registered to ${result.editableProfile.firstName} ${result.editableProfile.surname}.`);
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
    canManageMembers,
    currentUserProfile,
    editableProfile,
    isCardModalOpen,
    onCurrentUserProfileUpdate,
  ]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
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

  if (isGuest) {
    return <p>Guest logins do not have an editable member profile.</p>;
  }

  return (
    <div className="profile-page">
      <p>Manage your member profile and account details.</p>

      {canManageMembers ? (
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
          {editableProfile ? (
            <div className="profile-admin-actions">
              <button
                type="button"
                className="secondary-button profile-rfid-button"
                onClick={handleOpenCardModal}
                disabled={isInitialLoading || isRefreshingProfile || isSaving}
              >
                {editableProfile.rfidTag?.trim() ? "Issue new card" : "Add tag"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {isInitialLoading && !editableProfile ? <p>Loading profile...</p> : null}
      {isRefreshingProfile && !isInitialLoading ? (
        <p>Refreshing profile details...</p>
      ) : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {editableProfile ? (
        <MemberProfileForm
          editableProfile={editableProfile}
          handleChange={handleChange}
          handleBooleanSelectChange={handleBooleanSelectChange}
          toggleDiscipline={toggleDiscipline}
          handleLoanBowFieldChange={handleLoanBowFieldChange}
          toggleLoanBowField={toggleLoanBowField}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          isAdmin={canManageMembers}
          canEditLoanBow={canManageMembers}
          canReturnLoanBow={canManageMembers && editableProfile.loanBow.hasLoanBow}
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

      {editableProfile ? (
        <Modal
          open={isCardModalOpen}
          onClose={handleCloseCardModal}
          title={editableProfile.rfidTag?.trim() ? "Issue New Card" : "Add Tag"}
        >
          <div className="profile-card-issue-modal">
            <p>
              Present a tag now to register it against{" "}
              <strong>
                {editableProfile.firstName} {editableProfile.surname}
              </strong>
              .
            </p>
            <p className="profile-card-issue-note">
              This will register the presented tag for the selected user.
            </p>
            {cardIssueStatus ? (
              <p className="profile-card-issue-status">{cardIssueStatus}</p>
            ) : null}
            {cardIssueSuccess ? (
              <p className="profile-success">{cardIssueSuccess}</p>
            ) : null}
            {cardIssueError ? (
              <p className="profile-error">{cardIssueError}</p>
            ) : null}
            <div className="profile-card-issue-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleCloseCardModal}
              >
                {cardIssueSuccess ? "Done" : "Close"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
