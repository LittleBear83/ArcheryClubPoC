import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemberProfileForm } from "../components/MemberProfileForm";
import { Button } from "../components/Button";
import { LabeledSelect } from "../components/LabeledSelect";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
  hasPermission,
} from "../../utils/userProfile";
import { subscribeToRfidScans } from "../../utils/rfidScanHub";
import type { LoanBowReturnPayload } from "../../domain/entities/MemberProfile";

type LoadProfileOptions = {
  signal?: AbortSignal;
  isBackgroundRefresh?: boolean;
};

export function ProfilePage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  memberProfileCrud,
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

  const canManageMembers = hasPermission(
    currentUserProfile,
    "manage_members",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
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
    setEquipmentLoans([]);
    setCardIssueError("");
    setCardIssueStatus("");
    setCardIssueSuccess("");
    setIsIssuingCard(false);
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
        const result = await memberProfileCrud.getMemberProfilePageDataUseCase.execute({
          actorUsername,
          username,
          signal,
        });

        if (signal?.aborted) {
          return;
        }

        setEditableProfile(result.editableProfile);
        setEquipmentLoans(result.equipmentLoans ?? []);
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
      if (!canManageMembers || isGuest) {
        return;
      }

      try {
        const result = await memberProfileCrud.getMemberProfileOptionsUseCase.execute({
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
    [actorUsername, canManageMembers, isGuest, memberProfileCrud],
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
        const result = await memberProfileCrud.assignMemberRfidTagUseCase.execute({
          actorUsername,
          username: editableProfile.username,
          rfidTag,
        });

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
    actorUsername,
    canManageMembers,
    currentUserProfile?.auth?.username,
    editableProfile,
    isCardModalOpen,
    memberProfileCrud,
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
        <SectionPanel className="profile-admin-panel" title="Admin Member Update">
          <LabeledSelect
            label="Select member"
            value={selectedUsername}
            onChange={(event) => setSelectedUsername(event.target.value)}
            disabled={isInitialLoading || isRefreshingProfile || isSaving}
          >
            {memberOptions.map((member) => (
              <option key={member.username} value={member.username}>
                {formatMemberDisplayName(member)} ({formatMemberDisplayUsername(member)})
              </option>
            ))}
          </LabeledSelect>
          {editableProfile ? (
            <div className="profile-admin-actions">
              <Button
                type="button"
                className="secondary-button profile-rfid-button"
                onClick={handleOpenCardModal}
                disabled={isInitialLoading || isRefreshingProfile || isSaving}
                variant="danger"
              >
                {editableProfile.rfidTag?.trim() ? "Issue new card" : "Add tag"}
              </Button>
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      <StatusMessagePanel
        error={error}
        loading={isInitialLoading && !editableProfile}
        loadingLabel="Loading profile..."
        info={isRefreshingProfile && !isInitialLoading ? "Refreshing profile details..." : ""}
        success={message}
      />

      {editableProfile ? (
        <MemberProfileForm
          editableProfile={editableProfile}
          handleChange={handleChange}
          handleBooleanChange={handleBooleanChange}
          handleBooleanSelectChange={handleBooleanSelectChange}
          toggleDiscipline={toggleDiscipline}
          disciplineOptions={disciplineOptions}
          roleOptions={roleOptions}
          isAdmin={canManageMembers}
          isCreatingNew={false}
          isSaving={isSaving || isRefreshingProfile}
          canViewRfidTag={canManageMembers}
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
        <SectionPanel className="profile-form" title="Equipment On Loan">
          <div className="committee-roles-table-wrap">
            <table className="committee-roles-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Loan Date</th>
                </tr>
              </thead>
              <tbody>
                {equipmentLoans.length > 0 ? (
                  equipmentLoans.map((loan) => (
                    <tr key={loan.id}>
                      <td>{loan.typeLabel}</td>
                      <td>{loan.reference || "-"}</td>
                      <td>{loan.loanDate || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>No equipment is currently on loan to this member.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
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
              <Button
                type="button"
                className="secondary-button"
                onClick={handleCloseCardModal}
                variant="secondary"
              >
                {cardIssueSuccess ? "Done" : "Close"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
