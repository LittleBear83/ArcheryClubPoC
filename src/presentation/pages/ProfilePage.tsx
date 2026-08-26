import { Button } from "../components/Button";
import { LoanBowReturnModal } from "../components/LoanBowReturnModal";
import { MemberAutocomplete } from "../components/MemberAutocomplete";
import { Modal } from "../components/Modal";
import { useIsMobile } from "../hooks/useIsMobile";
import { ProfileDesktopView } from "./profile/ProfileDesktopView";
import { ProfileMobileView } from "./profile/ProfileMobileView";
import { useProfilePageState } from "./profile/useProfilePageState";

export function ProfilePage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  memberProfileCrud,
}) {
  const isMobile = useIsMobile(1100);
  const profilePageState = useProfilePageState({
    currentUserProfile,
    memberProfileCrud,
    onCurrentUserProfileUpdate,
  });

  if (profilePageState.isGuest) {
    return <p>Guest logins do not have an editable member profile.</p>;
  }

  return (
    <>
      {isMobile ? (
        <ProfileMobileView {...profilePageState} />
      ) : (
        <ProfileDesktopView {...profilePageState} />
      )}

      {profilePageState.editableProfile ? (
        <Modal
          open={profilePageState.isGoldenRecordsMatchModalOpen}
          onClose={profilePageState.handleCloseGoldenRecordsMatchModal}
          title="Choose Golden Records Account"
        >
          <div className="profile-card-issue-modal">
            <p>
              Golden Records could not match this member automatically. Choose the correct account
              from the most likely matches below.
            </p>
            <MemberAutocomplete
              label="Golden Records account"
              options={profilePageState.goldenRecordsCandidateMatches.map((candidate) => ({
                keywords: [
                  candidate.membershipId ?? "",
                  candidate.memberId,
                  candidate.memberArchived ? "archived" : "",
                ].filter(Boolean),
                label: candidate.name,
                secondaryText: candidate.membershipId
                  ? `${candidate.membershipId}${candidate.memberArchived ? " - archived" : ""}`
                  : candidate.memberArchived
                    ? "Archived"
                    : undefined,
                value: candidate.memberId,
              }))}
              value={profilePageState.selectedGoldenRecordsCandidateId}
              onValueChange={profilePageState.handleGoldenRecordsCandidateSelectionChange}
              disabled={profilePageState.isSavingGoldenRecordsMatch}
              noOptionsText="No Golden Records accounts match that search."
              placeholder="Search by name or membership ID"
            />
            {profilePageState.selectedGoldenRecordsCandidate ? (
              <p className="profile-card-issue-note">
                Selected account:{" "}
                <strong>{profilePageState.selectedGoldenRecordsCandidate.name}</strong>
                {profilePageState.selectedGoldenRecordsCandidate.membershipId
                  ? ` (${profilePageState.selectedGoldenRecordsCandidate.membershipId})`
                  : ""}
                {profilePageState.selectedGoldenRecordsCandidate.memberArchived
                  ? ". This Golden Records account is archived."
                  : "."}
              </p>
            ) : null}
            {profilePageState.goldenRecordsMatchError ? (
              <p className="profile-error">{profilePageState.goldenRecordsMatchError}</p>
            ) : null}
            <div className="profile-card-issue-actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={profilePageState.handleCloseGoldenRecordsMatchModal}
                disabled={profilePageState.isSavingGoldenRecordsMatch}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={profilePageState.handleContinueGoldenRecordsMatchAssignment}
                disabled={
                  profilePageState.isSavingGoldenRecordsMatch ||
                  !profilePageState.selectedGoldenRecordsCandidateId
                }
              >
                Continue
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {profilePageState.editableProfile ? (
        <Modal
          open={profilePageState.isGoldenRecordsMatchConfirmModalOpen}
          onClose={profilePageState.handleCloseGoldenRecordsMatchConfirmModal}
          title="Confirm Golden Records Assignment"
        >
          <div className="profile-card-issue-modal">
            <p>
              This will assign the selected Golden Records account to{" "}
              <strong>
                {profilePageState.editableProfile.firstName}{" "}
                {profilePageState.editableProfile.surname}
              </strong>
              .
            </p>
            <p className="profile-card-issue-note">
              Only continue if you are completely sure this is the correct Golden Records account.
              Assigning the wrong account could link another archer&apos;s records to this member.
            </p>
            {profilePageState.selectedGoldenRecordsCandidate ? (
              <p className="profile-card-issue-status">
                Selected account: {profilePageState.selectedGoldenRecordsCandidate.name}
                {profilePageState.selectedGoldenRecordsCandidate.membershipId
                  ? ` (${profilePageState.selectedGoldenRecordsCandidate.membershipId})`
                  : ""}
              </p>
            ) : null}
            {profilePageState.goldenRecordsMatchError ? (
              <p className="profile-error">{profilePageState.goldenRecordsMatchError}</p>
            ) : null}
            <div className="profile-card-issue-actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={profilePageState.handleCloseGoldenRecordsMatchConfirmModal}
                disabled={profilePageState.isSavingGoldenRecordsMatch}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={profilePageState.handleAssignGoldenRecordsMatch}
                disabled={
                  profilePageState.isSavingGoldenRecordsMatch ||
                  !profilePageState.selectedGoldenRecordsCandidateId
                }
              >
                {profilePageState.isSavingGoldenRecordsMatch
                  ? "Assigning..."
                  : "Assign Golden Records account"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {profilePageState.editableProfile ? (
        <Modal
          open={profilePageState.isDistanceSignOffModalOpen}
          onClose={profilePageState.handleCloseDistanceSignOffModal}
          title="Sign Off Distance"
        >
          <form
            className="left-align-form profile-distance-signoff-modal"
            onSubmit={profilePageState.handleSignOffDistance}
          >
            <p>
              Choose the unsigned distance to approve, then ask the member to
              confirm they are present by entering their password.
            </p>
            <label>
              Discipline
              <select
                value={profilePageState.distanceSignOffForm.discipline}
                onChange={profilePageState.handleDistanceSignOffChange(
                  "discipline",
                )}
                disabled={profilePageState.isSavingDistanceSignOff}
                required
              >
                {profilePageState.distanceSignOffDisciplines.map(
                  (discipline) => (
                    <option key={discipline} value={discipline}>
                      {discipline}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Distance
              <select
                value={profilePageState.distanceSignOffForm.distanceYards}
                onChange={profilePageState.handleDistanceSignOffChange(
                  "distanceYards",
                )}
                disabled={profilePageState.isSavingDistanceSignOff}
                required
              >
                {profilePageState.availableDistanceSignOffOptions.map((distance) => (
                  <option key={distance} value={distance}>
                    {distance} yds
                  </option>
                ))}
              </select>
            </label>
            <label>
              Member present confirmation
              <input
                type="password"
                value={
                  profilePageState.distanceSignOffForm
                    .memberPasswordConfirmation
                }
                onChange={profilePageState.handleDistanceSignOffChange(
                  "memberPasswordConfirmation",
                )}
                disabled={profilePageState.isSavingDistanceSignOff}
                placeholder="Member password"
                autoComplete="current-password"
                required
              />
            </label>
            {profilePageState.distanceSignOffError ? (
              <p className="profile-error">
                {profilePageState.distanceSignOffError}
              </p>
            ) : null}
            <div className="profile-card-issue-actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={profilePageState.handleCloseDistanceSignOffModal}
                disabled={profilePageState.isSavingDistanceSignOff}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={profilePageState.isSavingDistanceSignOff}
              >
                {profilePageState.isSavingDistanceSignOff
                  ? "Signing off..."
                  : "Confirm sign off"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {profilePageState.editableProfile ? (
        <LoanBowReturnModal
          open={profilePageState.isReturnModalOpen}
          loanBow={profilePageState.editableProfile.loanBow}
          isSaving={profilePageState.isSavingReturn}
          error={profilePageState.returnError}
          onClose={profilePageState.handleCloseReturnModal}
          onSubmit={profilePageState.handleReturnLoanBow}
        />
      ) : null}

      {profilePageState.editableProfile ? (
        <Modal
          open={profilePageState.isCardModalOpen}
          onClose={profilePageState.handleCloseCardModal}
          title={
            profilePageState.editableProfile.rfidTag?.trim()
              ? "Issue New Card"
              : "Add Tag"
          }
        >
          <div className="profile-card-issue-modal">
            <p>
              Present a tag now to register it against{" "}
              <strong>
                {profilePageState.editableProfile.firstName}{" "}
                {profilePageState.editableProfile.surname}
              </strong>
              .
            </p>
            <p className="profile-card-issue-note">
              This will register the presented tag for the selected user.
            </p>
            {profilePageState.cardIssueStatus ? (
              <p className="profile-card-issue-status">
                {profilePageState.cardIssueStatus}
              </p>
            ) : null}
            {profilePageState.cardIssueSuccess ? (
              <p className="profile-success">
                {profilePageState.cardIssueSuccess}
              </p>
            ) : null}
            {profilePageState.cardIssueError ? (
              <p className="profile-error">
                {profilePageState.cardIssueError}
              </p>
            ) : null}
            <div className="profile-card-issue-actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={profilePageState.handleCloseCardModal}
                variant="secondary"
              >
                {profilePageState.cardIssueSuccess ? "Done" : "Close"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
