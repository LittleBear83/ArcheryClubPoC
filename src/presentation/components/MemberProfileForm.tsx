import { useState } from "react";
import { Button } from "./Button";
import { DatePicker } from "./DatePicker";
import { describeMembershipClassification } from "../../utils/memberClassification";

function formatRoleLabel(role) {
  if (role === "beginner") {
    return "Beginner (Legacy Role)";
  }

  if (role === "have-a-go") {
    return "Have A Go (Legacy Role)";
  }

  return String(role ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMembershipStatusLabel(value) {
  switch (value) {
    case "non-member":
      return "Non-member";
    default:
      return formatRoleLabel(value);
  }
}

function formatProgrammeTypeLabel(value) {
  switch (value) {
    case "none":
      return "None";
    case "taster-session":
      return "Taster Session";
    default:
      return formatRoleLabel(value);
  }
}

function sortRolesAlphabetically(roles) {
  return [...roles].sort((left, right) =>
    formatRoleLabel(left).localeCompare(formatRoleLabel(right)),
  );
}

export function MemberProfileForm({
  editableProfile,
  handleChange,
  handleBooleanChange = undefined,
  handleBooleanSelectChange,
  toggleDiscipline,
  disciplineOptions,
  roleOptions,
  membershipStatusOptions = [],
  programmeTypeOptions = [],
  isAdmin,
  isCreatingNew,
  isSaving,
  canViewRfidTag = false,
  canEditProfile = true,
  canEditDisciplines = true,
  onSubmit,
  submitLabel,
}) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isProfileLocked = isSaving || !canEditProfile;
  const areDisciplinesLocked = isSaving || !canEditDisciplines;
  const sortedRoleOptions = sortRolesAlphabetically(roleOptions);
  const membershipSummary = describeMembershipClassification(editableProfile);
  const visibleProgrammeTypeOptions =
    editableProfile.membershipStatus === "guest"
      ? programmeTypeOptions.filter((programmeType) => programmeType === "none")
      : programmeTypeOptions;

  return (
    <form onSubmit={onSubmit} className="left-align-form profile-form">
      {isAdmin ? (
        <div className="profile-classification-panel">
          <p className="profile-classification-title">Access and status</p>
          <p className="profile-classification-copy">
            Role controls portal permissions. Membership status reflects whether
            the person is actually a club member. Programme type explains why a
            non-member account exists.
          </p>
          <p className="profile-classification-summary">{membershipSummary}</p>
        </div>
      ) : null}

      <div className="profile-form-grid">
        <label>
          Username
          <input
            value={editableProfile.username}
            onChange={handleChange("username")}
            disabled={!isAdmin || !isCreatingNew || isProfileLocked}
            required
          />
        </label>

        <label>
          Role
          <select
            value={editableProfile.userType}
            onChange={handleChange("userType")}
            disabled={!isAdmin || isProfileLocked}
          >
            {sortedRoleOptions.map((role) => (
              <option key={role} value={role}>
                {formatRoleLabel(role)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Membership status
          <select
            value={editableProfile.membershipStatus}
            onChange={handleChange("membershipStatus")}
            disabled={!isAdmin || isProfileLocked}
          >
            {membershipStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatMembershipStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Programme type
          <select
            value={editableProfile.programmeType}
            onChange={handleChange("programmeType")}
            disabled={
              !isAdmin ||
              isProfileLocked ||
              editableProfile.membershipStatus === "guest"
            }
          >
            {visibleProgrammeTypeOptions.map((programmeType) => (
              <option key={programmeType} value={programmeType}>
                {formatProgrammeTypeLabel(programmeType)}
              </option>
            ))}
          </select>
          {editableProfile.membershipStatus === "guest" ? (
            <small className="profile-field-helper">
              Guest accounts are kept separate from programme participants, so
              programme type stays set to None.
            </small>
          ) : null}
        </label>

        <label>
          First name
          <input
            value={editableProfile.firstName}
            onChange={handleChange("firstName")}
            disabled={isProfileLocked}
            required
          />
        </label>

        <label>
          Surname
          <input
            value={editableProfile.surname}
            onChange={handleChange("surname")}
            disabled={isProfileLocked}
            required
          />
        </label>

        <label>
          AGB membership number
          <input
            value={editableProfile.archeryGbMembershipNumber ?? ""}
            onChange={handleChange("archeryGbMembershipNumber")}
            disabled={isProfileLocked}
          />
        </label>

        <label>
          Email address
          <input
            type="email"
            value={editableProfile.emailAddress}
            onChange={handleChange("emailAddress")}
            disabled={isProfileLocked}
          />
        </label>

        <label>
          Password {isCreatingNew ? "" : "(leave blank to keep current)"}
          <span className="profile-password-field">
            <input
              type={isPasswordVisible ? "text" : "password"}
              value={editableProfile.password}
              onChange={handleChange("password")}
              disabled={isProfileLocked}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="profile-password-toggle"
              onClick={() => setIsPasswordVisible((current) => !current)}
              disabled={isProfileLocked}
              aria-label={isPasswordVisible ? "Hide password" : "Show password"}
              aria-pressed={isPasswordVisible}
            >
              {isPasswordVisible ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        {canViewRfidTag ? (
          <label>
            RFID tag
            <input
              value={editableProfile.rfidTag}
              onChange={handleChange("rfidTag")}
              disabled={isProfileLocked}
            />
          </label>
        ) : null}

        <label>
          Active member
          <select
            value={editableProfile.activeMember ? "active" : "deactive"}
            onChange={handleBooleanSelectChange("activeMember")}
            disabled={!isAdmin || isProfileLocked}
          >
            <option value="active">Active</option>
            <option value="deactive">Deactive</option>
          </select>
        </label>

        <label>
          Affiliate member
          <select
            value={editableProfile.affiliateMember ? "yes" : "no"}
            onChange={handleBooleanSelectChange("affiliateMember", "yes")}
            disabled={!isAdmin || isProfileLocked}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          Junior member
          <select
            value={editableProfile.juniorMember ? "yes" : "no"}
            onChange={handleBooleanSelectChange("juniorMember", "yes")}
            disabled={!isAdmin || isProfileLocked}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          Membership fees due
          <DatePicker
            value={editableProfile.membershipFeesDue}
            onChange={(value) =>
              handleChange("membershipFeesDue")({ target: { value } })
            }
            disabled={!isAdmin || isProfileLocked}
          />
        </label>
      </div>

      {isAdmin && !isCreatingNew ? (
        <fieldset className="profile-discipline-fieldset">
          <legend>Coaching</legend>
          <label className="profile-checkbox">
            <input
              type="checkbox"
              checked={Boolean(editableProfile.coachingVolunteer)}
              onChange={handleBooleanChange("coachingVolunteer")}
              disabled={isProfileLocked}
            />
            <span>Coaching volunteer</span>
          </label>
        </fieldset>
      ) : null}

      <fieldset className="profile-discipline-fieldset">
        <legend>Disciplines</legend>
        <div className="profile-discipline-grid">
          {disciplineOptions.map((discipline) => (
            <label key={discipline} className="profile-checkbox">
              <input
                type="checkbox"
                checked={editableProfile.disciplines.includes(discipline)}
                onChange={() => toggleDiscipline(discipline)}
                disabled={areDisciplinesLocked}
              />
              <span>{discipline}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {canEditProfile ? (
        <Button type="submit" disabled={isSaving}>
          {submitLabel}
        </Button>
      ) : null}
    </form>
  );
}
