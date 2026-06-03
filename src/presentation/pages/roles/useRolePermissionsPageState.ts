import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission } from "../../../utils/userProfile";
import {
  getPermissionGroup,
  PERMISSION_GROUP_METADATA,
  PERMISSION_GROUP_ORDER,
} from "./rolePermissionsUtils";

const EMPTY_ROLE_FORM = {
  title: "",
  permissions: [] as string[],
};

export function useRolePermissionsPageState({
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageRoles = hasPermission(
    currentUserProfile,
    "manage_roles_permissions",
  );
  const canDeleteRoles = hasPermission(currentUserProfile, "delete_roles");
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

  const roles = useMemo(() => rolesQuery.data?.roles ?? [], [rolesQuery.data?.roles]);
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
    () => roles.find((role) => role.roleKey === effectiveSelectedRoleKey) ?? null,
    [effectiveSelectedRoleKey, roles],
  );
  const canShowDeleteRoleButton = useMemo(() => {
    if (!selectedRole || isCreating || !canDeleteRoles) {
      return false;
    }

    const protectedRoleKeys = new Set(["admin", "developer"]);
    const normalizedRoleKey = selectedRole.roleKey.trim().toLowerCase();
    const normalizedTitle = selectedRole.title.trim().toLowerCase();

    return !protectedRoleKeys.has(normalizedRoleKey) &&
      normalizedTitle !== "admin" &&
      normalizedTitle !== "developer";
  }, [canDeleteRoles, isCreating, selectedRole]);
  const groupedPermissionOptions = useMemo(() => {
    const groupedPermissions = new Map(
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
  const deleteRoleDisabledReason = useMemo(() => {
    if (!selectedRole || isCreating) {
      return "";
    }

    if (isSaving) {
      return "Please wait while the current role update finishes.";
    }

    return "";
  }, [isCreating, isSaving, selectedRole]);

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
      const hasSelectedPermission = baseForm.permissions.includes(permissionKey);

      return {
        ...baseForm,
        permissions: hasSelectedPermission
          ? baseForm.permissions.filter((permission) => permission !== permissionKey)
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
    onSuccess: async (result) => {
      setMessage(
        isCreating ? "Role created successfully." : "Role updated successfully.",
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
    onSuccess: async (result) => {
      const reassignedUserCount = result?.reassignedUserCount ?? 0;
      setMessage(
        reassignedUserCount > 0
          ? `Role deleted successfully. ${reassignedUserCount} member${reassignedUserCount === 1 ? "" : "s"} reverted to general members.`
          : "Role deleted successfully.",
      );
      setIsDeleteModalOpen(false);
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

  const handleSelectRole = (event) => {
    setIsCreating(false);
    setSelectedRoleKey(event.target.value);
    setForm(EMPTY_ROLE_FORM);
    setIsFormDirty(false);
    setError("");
    setMessage("");
  };

  const handleTitleChange = (event) => {
    setForm((current) => ({
      ...getEffectiveFormState(current),
      title: event.target.value,
    }));
    setIsFormDirty(true);
  };

  const handleSaveRole = async (event) => {
    event.preventDefault();
    await saveRoleMutation.mutateAsync();
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) {
      return;
    }

    await deleteRoleMutation.mutateAsync();
  };

  const handleCloseDeleteModal = () => {
    if (isSaving) {
      return;
    }

    setIsDeleteModalOpen(false);
  };

  return {
    canManageRoles,
    canShowDeleteRoleButton,
    cancelCreateRole,
    deleteRoleDisabledReason,
    error,
    formValues,
    groupedPermissionOptions,
    handleCloseDeleteModal,
    handleDeleteRole,
    handleSaveRole,
    handleSelectRole,
    handleTitleChange,
    isCreating,
    isDeleteModalOpen,
    isSaving,
    message,
    openDeleteModal: () => setIsDeleteModalOpen(true),
    permissionOptions,
    roles,
    rolesQuery,
    selectedRole,
    selectedRoleKey,
    setIsDeleteModalOpen,
    startCreateRole,
    togglePermission,
  };
}
