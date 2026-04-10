import { useMemo, useState } from "react";
import { Modal } from "./Modal";

const RETURN_ITEM_FIELDS = [
  {
    key: "returnedRiser",
    label: "Riser",
    isAvailable: (loanBow) => Boolean(loanBow.riserNumber),
  },
  {
    key: "returnedLimbs",
    label: "Limbs",
    isAvailable: (loanBow) => Boolean(loanBow.limbsNumber),
  },
  {
    key: "returnedArrows",
    label: "Arrows",
    isAvailable: (loanBow) => Number(loanBow.arrowCount) > 0,
  },
  {
    key: "returnedFingerTab",
    label: "Finger Tab",
    isAvailable: (loanBow) => Boolean(loanBow.fingerTab),
  },
  {
    key: "returnedString",
    label: "String",
    isAvailable: (loanBow) => Boolean(loanBow.string),
  },
  {
    key: "returnedArmGuard",
    label: "Arm Guard",
    isAvailable: (loanBow) => Boolean(loanBow.armGuard),
  },
  {
    key: "returnedChestGuard",
    label: "Chest Guard",
    isAvailable: (loanBow) => Boolean(loanBow.chestGuard),
  },
  {
    key: "returnedSight",
    label: "Sight",
    isAvailable: (loanBow) => Boolean(loanBow.sight),
  },
  {
    key: "returnedLongRod",
    label: "Long Rod",
    isAvailable: (loanBow) => Boolean(loanBow.longRod),
  },
  {
    key: "returnedPressureButton",
    label: "Pressure Button",
    isAvailable: (loanBow) => Boolean(loanBow.pressureButton),
  },
];

function buildInitialReturnForm(loanBow) {
  return {
    returnedDate: loanBow?.returnedDate || new Date().toISOString().slice(0, 10),
    returnedRiser: Boolean(loanBow?.returnedRiser),
    returnedLimbs: Boolean(loanBow?.returnedLimbs),
    returnedArrows: Boolean(loanBow?.returnedArrows),
    returnedFingerTab: Boolean(loanBow?.returnedFingerTab),
    returnedString: Boolean(loanBow?.returnedString),
    returnedArmGuard: Boolean(loanBow?.returnedArmGuard),
    returnedChestGuard: Boolean(loanBow?.returnedChestGuard),
    returnedSight: Boolean(loanBow?.returnedSight),
    returnedLongRod: Boolean(loanBow?.returnedLongRod),
    returnedPressureButton: Boolean(loanBow?.returnedPressureButton),
  };
}

function LoanBowReturnModalForm({ loanBow, isSaving, error, onClose, onSubmit }) {
  const [returnForm, setReturnForm] = useState(() =>
    buildInitialReturnForm(loanBow),
  );
  const availableItems = RETURN_ITEM_FIELDS.filter((field) =>
    field.isAvailable(loanBow ?? {}),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(returnForm);
      }}
      className="left-align-form"
    >
      <label>
        Date Returned
        <input
          type="date"
          value={returnForm.returnedDate}
          onChange={(event) =>
            setReturnForm((current) => ({
              ...current,
              returnedDate: event.target.value,
            }))
          }
          disabled={isSaving}
          required
        />
      </label>

      <fieldset className="profile-discipline-fieldset loan-bow-return-fieldset">
        <legend>Returned Equipment</legend>
        <div className="profile-discipline-grid loan-bow-boolean-grid">
          {availableItems.map((field) => (
            <label key={field.key} className="profile-checkbox">
              <input
                type="checkbox"
                checked={returnForm[field.key]}
                onChange={() =>
                  setReturnForm((current) => ({
                    ...current,
                    [field.key]: !current[field.key],
                  }))
                }
                disabled={isSaving}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="profile-error">{error}</p> : null}

      <div className="loan-bow-return-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving return..." : "Submit return"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function LoanBowReturnModal({
  open,
  loanBow,
  isSaving,
  error,
  onClose,
  onSubmit,
}) {
  const modalKey = useMemo(() => {
    return JSON.stringify({
      open,
      username: loanBow?.username ?? "",
      returnedDate: loanBow?.returnedDate ?? "",
      riserNumber: loanBow?.riserNumber ?? "",
      limbsNumber: loanBow?.limbsNumber ?? "",
      arrowCount: loanBow?.arrowCount ?? 0,
    });
  }, [loanBow, open]);

  return (
    <Modal open={open} onClose={onClose} title="Loan Bow Return">
      <LoanBowReturnModalForm
        key={modalKey}
        loanBow={loanBow}
        isSaving={isSaving}
        error={error}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}
