import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import type { useRolePermissionsPageState } from "./useRolePermissionsPageState";

type RolePermissionsPageState = ReturnType<typeof useRolePermissionsPageState>;

export function RolePermissionsMobileView({
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
  roles,
  rolesQuery,
  selectedRole,
  selectedRoleKey,
  startCreateRole,
  togglePermission,
}: RolePermissionsPageState) {
  return (
    <div className="profile-page role-permissions-page--mobile">
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

            <section className="profile-discipline-fieldset">
              <MobileSectionHeader
                title="Permissions"
                description="Edit permissions by category."
              />
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
            </section>

            <div className="role-permissions-actions">
              {!isCreating ? (
                <Button
                  type="button"
                  onClick={startCreateRole}
                  disabled={isSaving}
                  fullWidth
                >
                  Create role
                </Button>
              ) : (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={cancelCreateRole}
                  disabled={isSaving}
                  variant="secondary"
                  fullWidth
                >
                  Cancel create
                </Button>
              )}

              <Button type="submit" disabled={isSaving} fullWidth>
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
                  fullWidth
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

            <section className="profile-discipline-fieldset">
              <MobileSectionHeader
                title="Role Summary"
                description="Quick mobile view of which permissions each role has."
              />
              {roles.length > 0 ? (
                <MobileCardList className="role-permissions-mobile-role-list">
                  {roles.map((role) => (
                    <article
                      key={role.roleKey}
                      className="role-permissions-mobile-role-card"
                    >
                      <p className="profile-mobile-card-title">{role.title}</p>
                      <MobileKeyValueList
                        items={[
                          {
                            label: "Assigned Members",
                            value: String(role.assignedUserCount),
                          },
                          {
                            label: "System Role",
                            value: role.isSystem ? "Yes" : "No",
                          },
                          {
                            label: "Permissions",
                            value: role.permissions.length
                              ? role.permissions.length.toString()
                              : "None",
                          },
                        ]}
                      />
                      {role.permissions.length > 0 ? (
                        <div className="role-permissions-mobile-chip-list">
                          {role.permissions.map((permissionKey) => (
                            <span
                              key={`${role.roleKey}-${permissionKey}`}
                              className="role-permissions-mobile-chip"
                            >
                              {permissionKey}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <MobileEmptyState message="No permissions assigned." />
                      )}
                    </article>
                  ))}
                </MobileCardList>
              ) : (
                <MobileEmptyState message="No roles are currently configured." />
              )}
            </section>
          </form>
        </section>
      ) : null}
    </div>
  );
}
