import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { MemberProfileForm } from "../../components/MemberProfileForm";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusMessagePanel } from "../../components/StatusMessagePanel";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import { formatDate, formatDateTime } from "../../../utils/dateTime";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
} from "../../../utils/userProfile";
import type { useProfilePageState } from "./useProfilePageState";

type ProfilePageState = ReturnType<typeof useProfilePageState>;

function formatSignOffValue(signOff) {
  if (!signOff?.signedOffAt) {
    return "Not signed off";
  }

  return `${formatDate(signOff.signedOffAt)} by ${signOff.signedOffByName}`;
}

export function ProfileMobileView({
  canEditCurrentProfile,
  canManageMemberDisciplines,
  canManageMembers,
  canSelectMembers,
  canSignOffDistances,
  disciplineOptions,
  editableProfile,
  equipmentLoans,
  error,
  handleBooleanChange,
  handleBooleanSelectChange,
  handleChange,
  handleOpenCardModal,
  handleOpenDistanceSignOffModal,
  handleSave,
  handleSelectMember,
  isInitialLoading,
  isRefreshingProfile,
  isSaving,
  memberOptions,
  message,
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
    <div className="profile-page profile-page--mobile">
      <p>Manage your member profile and account details.</p>

      {canSelectMembers ? (
        <SectionPanel className="profile-admin-panel" title="Member Selection">
          <div className="profile-mobile-stack">
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
              <Button
                type="button"
                className="profile-rfid-button"
                onClick={handleOpenCardModal}
                disabled={isInitialLoading || isRefreshingProfile || isSaving}
                variant="danger"
                fullWidth
              >
                {editableProfile.rfidTag?.trim() ? "Issue new card" : "Add tag"}
              </Button>
            ) : null}
          </div>
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
        <section className="profile-form">
          <MobileSectionHeader
            title="Distance Sign Offs"
            description="Tap an unsigned distance below to approve that exact distance for the member."
            actions={
              canSignOffDistances && hasUnsignedDistances ? (
                <Button
                  type="button"
                  onClick={handleOpenDistanceSignOffModal}
                  disabled={isInitialLoading || isRefreshingProfile || isSaving}
                  variant="secondary"
                  fullWidth
                >
                  Sign off next distance
                </Button>
              ) : null
            }
          />
          {editableProfile.distanceSignOffs?.length > 0 ? (
            <MobileCardList className="profile-mobile-card-list">
              {editableProfile.distanceSignOffs.map((disciplineGroup) => (
                <article
                  key={disciplineGroup.discipline}
                  className="profile-mobile-card"
                >
                  <p className="profile-mobile-card-title">
                    {disciplineGroup.discipline}
                  </p>
                  <div className="profile-distance-mobile-list">
                    {disciplineGroup.distances.map((distance) => (
                      <div
                        key={`${disciplineGroup.discipline}-${distance.distanceYards}`}
                        className="profile-distance-mobile-item"
                      >
                        <div className="profile-distance-mobile-copy">
                          <strong>{distance.distanceYards} yds</strong>
                          <span>{formatSignOffValue(distance.signOff)}</span>
                        </div>
                        {!distance.signOff && canSignOffDistances ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              handleOpenDistanceSignOffModal({
                                discipline: disciplineGroup.discipline,
                                distanceYards: distance.distanceYards,
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
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </MobileCardList>
          ) : (
            <MobileEmptyState message="Add a discipline to this profile before recording distance sign-offs." />
          )}
        </section>
      ) : null}

      {editableProfile ? (
        <section className="profile-form">
          <MobileSectionHeader
            title="Equipment On Loan"
            description="Current loaned equipment for this member."
          />
          {equipmentLoans.length > 0 ? (
            <MobileCardList className="profile-mobile-card-list">
              {equipmentLoans.map((loan) => (
                <article key={loan.id} className="profile-mobile-card">
                  <p className="profile-mobile-card-title">{loan.typeLabel}</p>
                  <MobileKeyValueList
                    items={[
                      { label: "Reference", value: loan.reference || "-" },
                      {
                        label: "Loan Date",
                        value: loan.loanDate
                          ? formatDateTime(loan.loanDate)
                          : "-",
                      },
                    ]}
                  />
                </article>
              ))}
            </MobileCardList>
          ) : (
            <MobileEmptyState message="No equipment is currently on loan to this member." />
          )}
        </section>
      ) : null}
    </div>
  );
}
