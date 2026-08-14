import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { MemberProfileForm } from "../../components/MemberProfileForm";
import { DeleteMemberModal } from "./DeleteMemberModal";
import { ProfileOutdoorAchievementsSection } from "./ProfileOutdoorAchievementsSection";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusMessagePanel } from "../../components/StatusMessagePanel";
import { formatDate, formatDateTime } from "../../../utils/dateTime";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
} from "../../../utils/userProfile";
import type { useProfilePageState } from "./useProfilePageState";

type ProfilePageState = ReturnType<typeof useProfilePageState>;

export function ProfileDesktopView({
  canEditCurrentProfile,
  canManageMemberDisciplines,
  canManageMembers,
  canManageOutdoorAchievements,
  canSelectMembers,
  canSignOffSelectedMember,
  currentUserProfile,
  deleteConfirmationUsername,
  deleteError,
  disciplineOptions,
  distanceSignOffOptions,
  editableProfile,
  equipmentLoans,
  error,
  goldenRecordsCandidateMatches,
  goldenRecordsFetchedAt,
  goldenRecordsIndoorHandicapsByBowType,
  goldenRecordsMatchSource,
  goldenRecordsOutdoorHandicapsByBowType,
  handleBooleanChange,
  handleBooleanSelectChange,
  handleChange,
  handleOpenCardModal,
  handleCloseDeleteModal,
  handleDeleteConfirmationUsernameChange,
  handleDeleteMember,
  handleOpenDeleteModal,
  handleOpenDistanceSignOffModal,
  handleOpenGoldenRecordsMatchModal,
  handleOutdoorTableAward252SignOffDateChange,
  handleOutdoorTableAchievementDateChange,
  handleRefreshGoldenRecordsHandicap,
  handleSave,
  handleSaveOutdoorTableEntry,
  handleSelectMember,
  isInitialLoading,
  isDeleteModalOpen,
  isDeletingMember,
  isLoadingOutdoorTable,
  isRefreshingGoldenRecordsHandicap,
  isRefreshingProfile,
  isSaving,
  isSavingOutdoorTableByBowType,
  memberOptions,
  message,
  membershipStatusOptions,
  outdoorTableBowEntries,
  outdoorTableError,
  programmeTypeOptions,
  roleOptions,
  selectedUsername,
  submitLabel,
  toggleDiscipline,
}: ProfilePageState) {
  const hasUnsignedDistances = editableProfile?.distanceSignOffs?.some(
    (disciplineGroup) =>
      disciplineGroup.distances.some((distance) => !distance.signOff),
  );

  return (
    <div className="profile-page">
      <p>Manage your member profile and account details.</p>

      {canSelectMembers ? (
        <SectionPanel className="profile-admin-panel" title="Member Selection">
          <LabeledSelect
            label="Select member"
            value={selectedUsername}
            onChange={handleSelectMember}
            disabled={isInitialLoading || isRefreshingProfile || isSaving}
          >
            {memberOptions.map((member) => (
              <option key={member.username} value={member.username}>
                {formatMemberDisplayName(member)} (
                {formatMemberDisplayUsername(member)})
              </option>
            ))}
          </LabeledSelect>
          {canManageMembers && editableProfile ? (
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
              {editableProfile.username !== currentUserProfile?.auth?.username ? (
                <Button
                  type="button"
                  onClick={handleOpenDeleteModal}
                  disabled={isInitialLoading || isRefreshingProfile || isSaving}
                  variant="danger"
                >
                  Delete member
                </Button>
              ) : null}
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      <StatusMessagePanel
        error={error}
        loading={isInitialLoading && !editableProfile}
        loadingLabel="Loading profile..."
        info={
          isRefreshingProfile && !isInitialLoading
            ? "Refreshing profile details..."
            : ""
        }
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
          membershipStatusOptions={membershipStatusOptions}
          programmeTypeOptions={programmeTypeOptions}
          isAdmin={canManageMembers}
          isCreatingNew={false}
          isSaving={isSaving || isRefreshingProfile}
          canViewRfidTag={canManageMembers}
          canEditProfile={canEditCurrentProfile}
          canEditDisciplines={canManageMemberDisciplines}
          onSubmit={handleSave}
          submitLabel={submitLabel}
        />
      ) : null}

      {editableProfile ? (
        <SectionPanel className="profile-form" title="Distance Sign Offs">
          <div className="profile-distance-signoff-header">
            <p>
              Signed-off distances are recorded separately for each discipline.
              Use the action inside an unsigned cell to approve that exact
              distance. Members cannot sign off their own profile.
            </p>
            {canSignOffSelectedMember && hasUnsignedDistances ? (
              <Button
                type="button"
                className="secondary-button"
                onClick={() => handleOpenDistanceSignOffModal()}
                disabled={isInitialLoading || isRefreshingProfile || isSaving}
                variant="secondary"
              >
                Sign off next distance
              </Button>
            ) : null}
          </div>
          <div className="committee-roles-table-wrap">
            <table className="committee-roles-table profile-distance-signoff-table">
              <thead>
                <tr>
                  <th>Discipline</th>
                  {distanceSignOffOptions.map((distance) => (
                    <th key={distance}>{distance} yds</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editableProfile.distanceSignOffs?.length > 0 ? (
                  editableProfile.distanceSignOffs.map((disciplineGroup) => (
                    <tr key={disciplineGroup.discipline}>
                      <td>{disciplineGroup.discipline}</td>
                      {distanceSignOffOptions.map((distance) => {
                        const signOff = disciplineGroup.distances.find(
                          (entry) => entry.distanceYards === distance,
                        )?.signOff;

                        return (
                          <td
                            key={`${disciplineGroup.discipline}-${distance}`}
                            className={signOff ? "is-signed-off" : ""}
                          >
                            {signOff?.signedOffAt ? (
                              <span className="profile-distance-signoff-cell">
                                <strong>{formatDate(signOff.signedOffAt)}</strong>
                                <span>
                                  {signOff.source === "golden-records"
                                    ? "Imported from Golden Records"
                                    : signOff.signedOffByName}
                                </span>
                              </span>
                            ) : canSignOffSelectedMember ? (
                              <div className="profile-distance-signoff-action">
                                <span className="profile-distance-signoff-empty">
                                  Not signed off
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    handleOpenDistanceSignOffModal({
                                      discipline: disciplineGroup.discipline,
                                      distanceYards: distance,
                                    })
                                  }
                                  disabled={
                                    isInitialLoading ||
                                    isRefreshingProfile ||
                                    isSaving
                                  }
                                >
                                  Sign off
                                </Button>
                              </div>
                            ) : (
                              <span className="profile-distance-signoff-empty">
                                Not signed off
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={distanceSignOffOptions.length + 1}>
                      Add a discipline to this profile before recording distance
                      sign-offs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
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
                      <td>{loan.loanDate ? formatDateTime(loan.loanDate) : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>
                      No equipment is currently on loan to this member.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ) : null}

      {editableProfile ? (
        <ProfileOutdoorAchievementsSection
          canManageOutdoorAchievements={canManageOutdoorAchievements}
          canManageMembers={canManageMembers}
          entries={outdoorTableBowEntries}
          error={outdoorTableError}
          goldenRecordsCandidateMatches={goldenRecordsCandidateMatches}
          goldenRecordsFetchedAt={goldenRecordsFetchedAt}
          goldenRecordsIndoorHandicapsByBowType={goldenRecordsIndoorHandicapsByBowType}
          goldenRecordsMatchSource={goldenRecordsMatchSource}
          goldenRecordsOutdoorHandicapsByBowType={goldenRecordsOutdoorHandicapsByBowType}
          isRefreshingGoldenRecordsHandicap={isRefreshingGoldenRecordsHandicap}
          isLoading={isLoadingOutdoorTable}
          isSavingByBowType={isSavingOutdoorTableByBowType}
          onOpenGoldenRecordsMatchModal={handleOpenGoldenRecordsMatchModal}
          onRefreshGoldenRecordsHandicap={handleRefreshGoldenRecordsHandicap}
          onAward252SignOffDateChange={handleOutdoorTableAward252SignOffDateChange}
          onAchievementDateChange={handleOutdoorTableAchievementDateChange}
          onSave={handleSaveOutdoorTableEntry}
        />
      ) : null}

      <DeleteMemberModal
        confirmationUsername={deleteConfirmationUsername}
        error={deleteError}
        expectedUsername={editableProfile?.username ?? ""}
        isDeleting={isDeletingMember}
        onChangeConfirmationUsername={handleDeleteConfirmationUsernameChange}
        onClose={handleCloseDeleteModal}
        onDelete={handleDeleteMember}
        open={isDeleteModalOpen}
      />
    </div>
  );
}
