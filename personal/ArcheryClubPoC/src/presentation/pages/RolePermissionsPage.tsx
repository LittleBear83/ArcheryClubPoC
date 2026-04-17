import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { LabeledSelect } from "../components/LabeledSelect";
import { hasPermission } from "../../utils/userProfile";
import type { PermissionOption, Role } from "../../domain/entities/Role";

const EMPTY_ROLE_FORM = {
  title: "",
  permissions: [] as string[],
};

const PERMISSION_GROUP_ORDER = [
  "member-setup",
  "events-coaching",
  "equipment-committee",
  "system-admin",
] as const;

const PERMISSION_GROUP_METADATA = {
  "member-setup": {
    title: "Member adminstration",
    description:
      "Member records, user creation, profile structure, role assignment, and committee role administration.",
  },
  "events-coaching": {
    title: "Events/Tournaments and Coaching",
    description:
      "Create and approve events, coaching sessions, beginners courses, and tournament activity.",
  },
  "equipment-committee": {
    title: "Equipment",
    description: "Equipment lifecycle and equipment assignment management.",
  },
  "system-admin": {
    title: "System Administration",
    description: "Cross-system administration and permission governance.",
  },
};

type PermissionGroupKey = keyof typeof PERMISSION_GROUP_METADATA;

function getPermissionGroup(permissionKey: string): PermissionGroupKey {
  switch (permissionKey) {
    case "manage_members":
    case "manage_committee_roles":
      return "member-setup";
    case "add_decommission_equipment":
    case "assign_equipment":
    case "return_equipment":
    case "update_equipment_storage":
      return "equipment-committee";
    case "add_events":
    case "approve_events":
    case "cancel_events":
    case "add_coaching_sessions":
    case "approve_coaching_sessions":
    case "manage_beginners_courses":
    case "approve_beginners_courses":
    case "manage_have_a_go_sessions":
    case "approve_have_a_go_sessions":
    case "manage_tournaments":
      return "events-coaching";
    case "manage_roles_permissions":
    case "manage_equipment_storage_locations":
      return "system-admin";
    default:
      return "system-admin";
  }
}

export function RolePermissionsPage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  memberProfileCrud,
  roleCrud,
}) {
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [form, setForm] = useState(EMPTY_ROLE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageRoles = hasPermission(
    currentUserProfile,
    "manage_roles_permissions",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ["roles", actorUsername],
    queryFn: () =>
      roleCrud.getRolesSnapshotUseCase.execute({
        actorUsername,
      }),
    enabled: canManageRoles,
  });

  const roles = useMemo(
    () => rolesQuery.data?.roles ?? [],
    [rolesQuery.data?.roles],
  );
  const permissionOptions = useMemo(
    () => rolesQuery.data?.permissions ?? [],
    [rolesQuery.data?.permissions],
  );
  const effectiveSelectedRoleKey = useMemo(
    () =>
      selectedRoleKey && roles.some((role) => role.roleKey === selectedRoleKey)
        ? selectedRoleKey
        : (roles[0]?.roleKey ?? ""),
    [roles, selectedRoleKey],
  );
  const selectedRole = useMemo(
    () =>
      roles.find((role) => role.roleKey === effectiveSelectedRoleKey) ?? null,
    [effectiveSelectedRoleKey, roles],
  );
  const groupedPermissionOptions = useMemo(() => {
    const groupedPermissions = new Map<PermissionGroupKey, PermissionOption[]>(
      PERMISSION_GROUP_ORDER.map((groupKey) => [groupKey, []]),
    );

    for (const permission of permissionOptions) {
      const groupKey = getPermissionGroup(permission.key);
      const currentGroup = groupedPermissions.get(groupKey) ?? [];
      currentGroup.push(permission);
      groupedPermissions.set(groupKey, currentGroup);
    }

    return PERMISSION_GROUP_ORDER.map((groupKey) => ({
      groupKey,
      ...PERMISSION_GROUP_METADATA[groupKey],
      permissions: groupedPermissions.get(groupKey) ?? [],
    })).filter((group) => group.permissions.length > 0);
  }, [permissionOptions]);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: ["roles", actorUsername],
      });
    };

    window.addEventListener("profile-data-updated", refresh);

    return () => {
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [actorUsername, queryClient]);

  const formValues = useMemo(
    () =>
      !isCreating && !isFormDirty && selectedRole
        ? {
            title: selectedRole.title,
            permissions: selectedRole.permissions,
          }
        : form,
    [form, isCreating, isFormDirty, selectedRole],
  );

  const getEffectiveFormState = (currentForm: typeof EMPTY_ROLE_FORM) => {
    if (!isCreating && !isFormDirty && selectedRole) {
      return {
        title: selectedRole.title,
        permissions: selectedRole.permissions,
      };
    }

    return currentForm;
  };

  const refreshCurrentUserProfile = async () => {
    if (!currentUserProfile?.auth?.username || !onCurrentUserProfileUpdate) {
      return;
    }

    try {
      const result = await memberProfileCrud.getUserProfileUseCase.execute({
        actorUsername,
        username: currentUserProfile.auth.username,
      });

      if (result) {
        onCurrentUserProfileUpdate(result);
      }
    } catch {
      return;
    }
  };

  const togglePermission = (permissionKey: string) => {
    setForm((current) => {
      const baseForm = getEffectiveFormState(current);
      const hasSelectedPermission =
        baseForm.permissions.includes(permissionKey);

      return {
        ...baseForm,
        permissions: hasSelectedPermission
          ? baseForm.permissions.filter(
              (permission) => permission !== permissionKey,
            )
          : [...baseForm.permissions, permissionKey],
      };
    });
    setIsFormDirty(true);
  };

  const startCreateRole = () => {
    setIsCreating(true);
    setSelectedRoleKey("");
    setForm(EMPTY_ROLE_FORM);
    setIsFormDirty(false);
    setError("");
    setMessage("");
  };

  const cancelCreateRole = () => {
    setIsCreating(false);
    setIsFormDirty(false);
    setError("");
    setMessage("");

    if (roles.length > 0) {
      setSelectedRoleKey(roles[0].roleKey);
    }
  };

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: formValues.title,
        permissions: formValues.permissions,
      };

      if (isCreating) {
        return roleCrud.createRoleUseCase.execute({
          actorUsername,
          roleDefinition: payload,
        });
      }

      return roleCrud.updateRoleUseCase.execute({
        actorUsername,
        roleKey: selectedRoleKey,
        roleDefinition: payload,
      });
    },
    onMutate: () => {
      setIsSaving(true);
      setError("");
      setMessage("");
    },
    onSuccess: async (result: Role) => {
      setMessage(
        isCreating
          ? "Role created successfully."
          : "Role updated successfully.",
      );
      setIsCreating(false);
      setIsFormDirty(false);
      setSelectedRoleKey(result.roleKey);
      window.dispatchEvent(new Event("profile-data-updated"));
      await refreshCurrentUserProfile();
      await queryClient.invalidateQueries({
        queryKey: ["roles", actorUsername],
      });
    },
    onError: (saveError: Error) => {
      setError(saveError.message);
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRole) {
        throw new Error("No role selected.");
      }

      return roleCrud.deleteRoleUseCase.execute({
        actorUsername,
        roleKey: selectedRole.roleKey,
      });
    },
    onMutate: () => {
      setIsSaving(true);
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Role deleted successfully.");
      setSelectedRoleKey("");
      setIsFormDirty(false);
      window.dispatchEvent(new Event("profile-data-updated"));
      await refreshCurrentUserProfile();
      await queryClient.invalidateQueries({
        queryKey: ["roles", actorUsername],
      });
    },
    onError: (deleteError: Error) => {
      setError(deleteError.message);
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const handleSaveRole = async (event) => {
    event.preventDefault();
    await saveRoleMutation.mutateAsync();
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) {
      return;
    }

    const confirmed = window.confirm(`Delete role '${selectedRole.title}'?`);

    if (!confirmed) {
      return;
    }

    await deleteRoleMutation.mutateAsync();
  };

  if (!canManageRoles) {
    return <p>You do not have permission to manage roles and permissions.</p>;
  }

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
              onChange={(event) => {
                setIsCreating(false);
                setSelectedRoleKey(event.target.value);
                setForm(EMPTY_ROLE_FORM);
                setIsFormDirty(false);
                setError("");
                setMessage("");
              }}
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
                  onChange={(event) =>
                    setForm((current) => ({
                      ...getEffectiveFormState(current),
                      title: event.target.value,
                    }))
                  }
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
                        <label
                          key={permission.key}
                          className="profile-checkbox"
                        >
                          <input
                            type="checkbox"
                            checked={formValues.permissions.includes(
                              permission.key,
                            )}
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
                <Button
                  type="button"
                  onClick={startCreateRole}
                  disabled={isSaving}
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

              {!isCreating && selectedRole && !selectedRole.isSystem ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={handleDeleteRole}
                  disabled={isSaving || selectedRole.assignedUserCount > 0}
                  title={
                    selectedRole.assignedUserCount > 0
                      ? "Remove users from this role before deleting it."
                      : "Delete role"
                  }
                  variant="danger"
                >
                  Delete role
                </Button>
              ) : null}
            </div>

            <fieldset className="profile-discipline-fieldset">
              <legend>Roles vs Permissions</legend>
              <div className="committee-roles-table-wrap">
                <table
                  className="committee-roles-table"
                  style={{
                    borderCollapse: "separate",
                    borderSpacing: "12px 0", // 👈 horizontal gap between columns
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ padding: "8px" }}>Permission</th>
                      {roles.map((role) => (
                        <th key={role.roleKey} style={{ padding: "8px" }}>
                          {role.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissionOptions.map((permission) => (
                      <tr key={permission.key}>
                        <td style={{ padding: "8px" }}>{permission.label}</td>
                        {roles.map((role) => (
                          <td
                            key={`${permission.key}-${role.roleKey}`}
                            style={{
                              padding: "8px",
                              textAlign: "center",
                            }}
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
