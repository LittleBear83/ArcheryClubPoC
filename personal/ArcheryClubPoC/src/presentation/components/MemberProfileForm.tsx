import { Button } from "./Button";

export function MemberProfileForm({
  editableProfile,
  handleChange,
  handleBooleanChange: _handleBooleanChange = undefined,
  handleBooleanSelectChange,
  toggleDiscipline,
  handleLoanBowFieldChange,
  toggleLoanBowField,
  disciplineOptions,
  roleOptions,
  isAdmin,
  canEditLoanBow = true,
  canReturnLoanBow = false,
  onReturnLoanBow = undefined,
  isCreatingNew,
  isSaving,
  onSubmit,
  submitLabel,
}) {
  return (
    <form onSubmit={onSubmit} className="left-align-form profile-form">
      <div className="profile-form-grid">
        <label>
          Username
          <input
            value={editableProfile.username}
            onChange={handleChange("username")}
            disabled={!isAdmin || !isCreatingNew || isSaving}
            required
          />
        </label>

        <label>
          Role
          <select
            value={editableProfile.userType}
            onChange={handleChange("userType")}
            disabled={!isAdmin || isSaving}
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
            disabled={isSaving}
            required
          />
        </label>

        <label>
          Surname
          <input
            value={editableProfile.surname}
            onChange={handleChange("surname")}
            disabled={isSaving}
            required
          />
        </label>

        <label>
          Password {isCreatingNew ? "" : "(leave blank to keep current)"}
          <input
            type="password"
            value={editableProfile.password}
            onChange={handleChange("password")}
            disabled={isSaving}
            autoComplete="new-password"
          />
        </label>

        <label>
          RFID tag
          <input
            value={editableProfile.rfidTag}
            onChange={handleChange("rfidTag")}
            disabled={isSaving}
          />
        </label>

        <label>
          Active member
          <select
            value={editableProfile.activeMember ? "active" : "deactive"}
            onChange={handleBooleanSelectChange("activeMember")}
            disabled={!isAdmin || isSaving}
          >
            <option value="active">Active</option>
            <option value="deactive">Deactive</option>
          </select>
        </label>

        <label>
          Membership fees due
          <input
            type="date"
            value={editableProfile.membershipFeesDue}
            onChange={handleChange("membershipFeesDue")}
            disabled={!isAdmin || isSaving}
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
              disabled={isSaving}
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
                disabled={isSaving}
              />
              <span>{discipline}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={isSaving}>
        {submitLabel}
      </Button>
    </form>
  );
}
