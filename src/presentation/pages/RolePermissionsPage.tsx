import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { useIsMobile } from "../hooks/useIsMobile";
import { RolePermissionsDesktopView } from "./roles/RolePermissionsDesktopView";
import { RolePermissionsMobileView } from "./roles/RolePermissionsMobileView";
import { useRolePermissionsPageState } from "./roles/useRolePermissionsPageState";

export function RolePermissionsPage({
  currentUserProfile,
  onCurrentUserProfileUpdate,
  memberProfileCrud,
  roleCrud,
}) {
  const isMobile = useIsMobile();
  const rolePermissionsPageState = useRolePermissionsPageState({
    currentUserProfile,
    memberProfileCrud,
    onCurrentUserProfileUpdate,
    roleCrud,
  });

  if (!rolePermissionsPageState.canManageRoles) {
    return <p>You do not have permission to manage roles and permissions.</p>;
  }

  return (
    <>
      {isMobile ? (
        <RolePermissionsMobileView {...rolePermissionsPageState} />
      ) : (
        <RolePermissionsDesktopView {...rolePermissionsPageState} />
      )}

      <Modal
        open={rolePermissionsPageState.isDeleteModalOpen}
        onClose={rolePermissionsPageState.handleCloseDeleteModal}
        title="Delete Role"
      >
        {rolePermissionsPageState.selectedRole ? (
          <div className="role-delete-modal">
            <p>
              Deleting <strong>{rolePermissionsPageState.selectedRole.title}</strong>{" "}
              will revert{" "}
              <strong>
                {rolePermissionsPageState.selectedRole.assignedUserCount}
              </strong>{" "}
              member
              {rolePermissionsPageState.selectedRole.assignedUserCount === 1
                ? ""
                : "s"}{" "}
              to general members.
            </p>
            <p>Do you want to continue?</p>
            <div className="role-delete-modal-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={rolePermissionsPageState.handleCloseDeleteModal}
                disabled={rolePermissionsPageState.isSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void rolePermissionsPageState.handleDeleteRole()}
                disabled={rolePermissionsPageState.isSaving}
              >
                {rolePermissionsPageState.isSaving ? "Confirming..." : "Confirm"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
