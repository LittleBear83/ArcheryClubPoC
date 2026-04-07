import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission } from "../../utils/userProfile";

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

const EMPTY_ROLE_FORM = {
  title: "",
  permissions: [],
};

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();

    if (responseText.trim().startsWith("<!DOCTYPE")) {
      throw new Error(
        `${fallbackMessage} The API returned HTML. Restart the server and try again.`,
      );
    }

    throw new Error(fallbackMessage);
  }

  return response.json();
}

export function RolePermissionsPage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
}) {
  const [roles, setRoles] = useState([]);
  const [permissionOptions, setPermissionOptions] = useState([]);
  const [selectedRoleKey, setSelectedRoleKey] = useState("");
  const [form, setForm] = useState(EMPTY_ROLE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedRoles, setHasLoadedRoles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageRoles = hasPermission(
    currentUserProfile,
    "manage_roles_permissions",
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.roleKey === selectedRoleKey) ?? null,
    [roles, selectedRoleKey],
  );

  const loadRoles = useCallback(async (signal) => {
    if (!canManageRoles) {
      setIsLoading(false);
      return;
    }

    if (!hasLoadedRoles) {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/roles", {
        headers: buildHeaders(currentUserProfile),
        cache: "no-store",
        signal,
      });
      const result = await readJsonResponse(response, "Unable to load roles.");

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to load roles.");
      }

      if (signal?.aborted) {
        return;
      }

      setRoles(result.roles ?? []);
      setPermissionOptions(result.permissions ?? []);
      setHasLoadedRoles(true);
      setSelectedRoleKey((current) => {
        if (current && result.roles?.some((role) => role.roleKey === current)) {
          return current;
        }

        return result.roles?.[0]?.roleKey ?? "";
      });
    } catch (loadError) {
      if (!signal?.aborted) {
        setError(loadError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [canManageRoles, currentUserProfile, hasLoadedRoles]);

  const refreshCurrentUserProfile = useCallback(async () => {
    if (!currentUserProfile?.auth?.username || !onCurrentUserProfileUpdate) {
      return;
    }

    try {
      const response = await fetch(
        `/api/user-profiles/${currentUserProfile.auth.username}`,
        {
          headers: buildHeaders(currentUserProfile),
          cache: "no-store",
        },
      );
      const result = await readJsonResponse(
        response,
        "Unable to refresh your profile.",
      );

      if (response.ok && result.success && result.userProfile) {
        onCurrentUserProfileUpdate(result.userProfile);
      }
    } catch {
      return;
    }
  }, [currentUserProfile, onCurrentUserProfileUpdate]);

  useEffect(() => {
    const abortController = new AbortController();
    const refresh = () => loadRoles(abortController.signal);

    refresh();
    window.addEventListener("profile-data-updated", refresh);

    return () => {
      abortController.abort();
      window.removeEventListener("profile-data-updated", refresh);
    };
  }, [loadRoles]);

  useEffect(() => {
    if (isCreating || !selectedRole) {
      return;
    }

    setForm({
      title: selectedRole.title,
      permissions: [...selectedRole.permissions],
    });
  }, [isCreating, selectedRole]);

  const togglePermission = (permissionKey) => {
    setForm((current) => {
      const hasSelectedPermission = current.permissions.includes(permissionKey);

      return {
        ...current,
        permissions: hasSelectedPermission
          ? current.permissions.filter((permission) => permission !== permissionKey)
          : [...current.permissions, permissionKey],
      };
    });
  };

  const startCreateRole = () => {
    setIsCreating(true);
    setSelectedRoleKey("");
    setForm(EMPTY_ROLE_FORM);
    setError("");
    setMessage("");
  };

  const cancelCreateRole = () => {
    setIsCreating(false);
    setError("");
    setMessage("");

    if (roles.length > 0) {
      setSelectedRoleKey(roles[0].roleKey);
    }
  };

  const handleSaveRole = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
      setMessage("");

    const payload = {
      title: form.title,
      permissions: form.permissions,
    };

    try {
      const response = await fetch(
        isCreating ? "/api/roles" : `/api/roles/${selectedRoleKey}`,
        {
          method: isCreating ? "POST" : "PUT",
          headers: buildHeaders(currentUserProfile),
          body: JSON.stringify(payload),
        },
      );
      const result = await readJsonResponse(response, "Unable to save role.");

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to save role.");
      }

      setMessage(isCreating ? "Role created successfully." : "Role updated successfully.");
      setIsCreating(false);
      setSelectedRoleKey(result.role.roleKey);
      window.dispatchEvent(new Event("profile-data-updated"));
      await refreshCurrentUserProfile();
      await loadRoles();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) {
      return;
    }

    const confirmed = window.confirm(
      `Delete role '${selectedRole.title}'?`,
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/roles/${selectedRole.roleKey}`, {
        method: "DELETE",
        headers: buildHeaders(currentUserProfile),
      });
      const result = await readJsonResponse(
        response,
        "Unable to delete role.",
      );

      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "Unable to delete role.");
      }

      setMessage("Role deleted successfully.");
      setSelectedRoleKey("");
      window.dispatchEvent(new Event("profile-data-updated"));
      await refreshCurrentUserProfile();
      await loadRoles();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!canManageRoles) {
    return <p>You do not have permission to manage roles and permissions.</p>;
  }

  return (
    <div className="profile-page">
      <p>Create ad-hoc roles and choose the permissions each role can use.</p>
      {isLoading && !hasLoadedRoles ? <p>Loading roles and permissions...</p> : null}
      {error ? <p className="profile-error">{error}</p> : null}
      {message ? <p className="profile-success">{message}</p> : null}

      {hasLoadedRoles ? (
        <section className="profile-form role-permissions-panel">
          <div className="role-permissions-toolbar">
            <label className="profile-member-select">
              Select role
              <select
                value={selectedRoleKey}
                onChange={(event) => {
                  setIsCreating(false);
                  setSelectedRoleKey(event.target.value);
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
              </select>
            </label>

            {!isCreating ? (
              <button
                type="button"
                className="secondary-button"
                onClick={startCreateRole}
                disabled={isSaving}
              >
                Create role
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={cancelCreateRole}
                disabled={isSaving}
              >
                Cancel create
              </button>
            )}
          </div>

          <form onSubmit={handleSaveRole} className="left-align-form">
            <div className="profile-form-grid">
              <label>
                Role title
                <input
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
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
              <div className="profile-discipline-grid">
                {permissionOptions.map((permission) => (
                  <label key={permission.key} className="profile-checkbox">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(permission.key)}
                      onChange={() => togglePermission(permission.key)}
                      disabled={isSaving}
                    />
                    <span>{permission.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="role-permissions-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving
                  ? isCreating
                    ? "Creating role..."
                    : "Saving role..."
                  : isCreating
                    ? "Create role"
                    : "Save role"}
              </button>

              {!isCreating && selectedRole && !selectedRole.isSystem ? (
                <button
                  type="button"
                  className="event-cancel-button"
                  onClick={handleDeleteRole}
                  disabled={isSaving || selectedRole.assignedUserCount > 0}
                  title={
                    selectedRole.assignedUserCount > 0
                      ? "Remove users from this role before deleting it."
                      : "Delete role"
                  }
                >
                  Delete role
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
