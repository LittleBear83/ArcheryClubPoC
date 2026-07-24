import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

type DeleteMemberModalProps = {
  confirmationUsername: string;
  error: string;
  expectedUsername: string;
  fullWidthActions?: boolean;
  isDeleting: boolean;
  onChangeConfirmationUsername: (event: { target: { value: string } }) => void;
  onClose: () => void;
  onDelete: () => void;
  open: boolean;
};

export function DeleteMemberModal({
  confirmationUsername,
  error,
  expectedUsername,
  fullWidthActions = false,
  isDeleting,
  onChangeConfirmationUsername,
  onClose,
  onDelete,
  open,
}: DeleteMemberModalProps) {
  const isConfirmationMatched = confirmationUsername === expectedUsername;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete Member"
      contentClassName="profile-delete-modal"
    >
      <div className="profile-delete-flow">
        <p className="profile-delete-copy">
          This is a soft delete. The member account will be deactivated and kept
          for historical records, but the member will no longer be able to use
          the portal.
        </p>
        <div className="profile-delete-confirmation">
          <p className="profile-delete-confirmation-title">Confirmation required</p>
          <p>
            Type <strong>{expectedUsername}</strong> to confirm.
          </p>
        </div>
        <label className="profile-delete-field">
          <span>Confirm username</span>
          <input
            value={confirmationUsername}
            onChange={onChangeConfirmationUsername}
            disabled={isDeleting}
            placeholder="Enter username"
          />
        </label>
        {error ? <p className="usage-error">{error}</p> : null}
        <div className="profile-delete-actions">
          <Button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            variant="secondary"
            fullWidth={fullWidthActions}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onDelete}
            disabled={!isConfirmationMatched || isDeleting}
            variant="danger"
            fullWidth={fullWidthActions}
          >
            {isDeleting ? "Deleting member..." : "Delete member"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
