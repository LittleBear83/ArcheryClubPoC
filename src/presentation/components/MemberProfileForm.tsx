import { Button } from "./Button";
import { DatePicker } from "./DatePicker";

export function MemberProfileForm({
  editableProfile,
  handleChange,
  handleBooleanChange = undefined,
  handleBooleanSelectChange,
  toggleDiscipline,
  disciplineOptions,
  roleOptions,
  isAdmin,
  isCreatingNew,
  isSaving,
  canViewRfidTag = false,
  canEditProfile = true,
  canEditDisciplines = true,
  onSubmit,
  submitLabel,
}) {
  const isProfileLocked = isSaving || !canEditProfile;
  const areDisciplinesLocked = isSaving || !canEditDisciplines;

  return (
    <form onSubmit={onSubmit} className="left-align-form profile-form">
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
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
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
          Password {isCreatingNew ? "" : "(leave blank to keep current)"}
          <input
            type="password"
            value={editableProfile.password}
            onChange={handleChange("password")}
            disabled={isProfileLocked}
            autoComplete="new-password"
          />
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
