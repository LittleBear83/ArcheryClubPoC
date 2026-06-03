import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import type { useRolePermissionsPageState } from "./useRolePermissionsPageState";

type RolePermissionsPageState = ReturnType<typeof useRolePermissionsPageState>;

export function RolePermissionsDesktopView({
  canShowDeleteRoleButton,
  cancelCreateRole,
  deleteRoleDisabledReason,
  error,
  formValues,
  groupedPermissionOptions,
  handleSaveRole,
  handleSelectRole,
  handleTitleChange,
  isCreating,
  isSaving,
  message,
  openDeleteModal,
  permissionOptions,
  roles,
  rolesQuery,
  selectedRole,
  selectedRoleKey,
  startCreateRole,
  togglePermission,
}: RolePermissionsPageState) {
  return (
    <div className="profile-page">
      <p>Create roles and choose the permissions each role can use.</p>
      {rolesQuery.isLoading ? <p>Loading roles and permissions...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {rolesQuery.data ? (
        <section className="profile-form role-permissions-panel">
          <div className="role-permissions-toolbar">
            <LabeledSelect
              className="role-select-field"
              label="Select role"
              value={selectedRoleKey}
              onChange={handleSelectRole}
              disabled={isCreating || isSaving || roles.length === 0}
            >
              {roles.map((role) => (
                <option key={role.roleKey} value={role.roleKey}>
                  {role.title}
                </option>
              ))}
            </LabeledSelect>
          </div>

          <form onSubmit={handleSaveRole} className="left-align-form">
            <div className="profile-form-grid">
              <label className="role-title-field">
                Role title
                <input
                  value={formValues.title}
                  onChange={handleTitleChange}
                  disabled={isSaving}
                  required
                />
              </label>
            </div>

            {!isCreating && selectedRole ? (
              <p className="role-meta-copy">
                Assigned members: {selectedRole.assignedUserCount}
                {selectedRole.isSystem ? " | System role" : ""}
              </p>
            ) : null}

            <fieldset className="profile-discipline-fieldset">
              <legend>Permissions</legend>
              <div className="role-permissions-group-grid">
                {groupedPermissionOptions.map((group) => (
                  <section
                    key={group.groupKey}
                    className="role-permissions-group-card"
                  >
                    <h4>{group.title}</h4>
                    <p className="role-permissions-group-copy">
                      {group.description}
                    </p>
                    <div className="role-permissions-checkbox-list">
                      {group.permissions.map((permission) => (
                        <label key={permission.key} className="profile-checkbox">
                          <input
                            type="checkbox"
                            checked={formValues.permissions.includes(permission.key)}
                            onChange={() => togglePermission(permission.key)}
                            disabled={isSaving}
                          />
                          <span>{permission.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>

            <div className="role-permissions-actions">
              {!isCreating ? (
                <Button type="button" onClick={startCreateRole} disabled={isSaving}>
                  Create role
                </Button>
              ) : (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={cancelCreateRole}
                  disabled={isSaving}
                  variant="secondary"
                >
                  Cancel create
                </Button>
              )}

              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? isCreating
                    ? "Creating role..."
                    : "Saving role..."
                  : isCreating
                    ? "Create role"
                    : "Save role"}
              </Button>

              {canShowDeleteRoleButton ? (
                <Button
                  type="button"
                  className="role-permissions-delete-button"
                  onClick={openDeleteModal}
                  disabled={Boolean(deleteRoleDisabledReason)}
                  title={deleteRoleDisabledReason || "Delete role"}
                  variant="danger"
                >
                  Delete role
                </Button>
              ) : null}
            </div>

            {canShowDeleteRoleButton && deleteRoleDisabledReason ? (
              <p className="role-permissions-disabled-hint">
                {deleteRoleDisabledReason}
              </p>
            ) : null}

            <fieldset className="profile-discipline-fieldset">
              <legend>Roles vs Permissions</legend>
              <div className="committee-roles-table-wrap">
                <table className="committee-roles-table role-permissions-matrix">
                  <thead>
                    <tr>
                      <th className="role-permissions-matrix-cell">Permission</th>
                      {roles.map((role) => (
                        <th
                          key={role.roleKey}
                          className="role-permissions-matrix-cell"
                        >
                          {role.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissionOptions.map((permission) => (
                      <tr key={permission.key}>
                        <td className="role-permissions-matrix-cell">
                          {permission.label}
                        </td>
                        {roles.map((role) => (
                          <td
                            key={`${permission.key}-${role.roleKey}`}
                            className="role-permissions-matrix-cell role-permissions-matrix-cell--center"
                          >
                            {role.permissions.includes(permission.key) ? (
                              <span
                                className="role-permission-tick"
                                aria-label="Granted"
                              >
                                ✓
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </form>
        </section>
      ) : null}
    </div>
  );
}
