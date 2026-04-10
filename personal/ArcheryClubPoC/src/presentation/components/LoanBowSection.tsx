const LOAN_BOW_BOOLEAN_FIELDS = [
  { key: "fingerTab", label: "Finger Tab" },
  { key: "string", label: "String" },
  { key: "armGuard", label: "Arm Guard" },
  { key: "chestGuard", label: "Chest Guard" },
  { key: "sight", label: "Sight" },
  { key: "longRod", label: "Long Rod" },
  { key: "pressureButton", label: "Pressure Button" },
];

const LOAN_BOW_RETURN_STATUS_FIELDS = [
  { key: "returnedRiser", label: "Riser returned" },
  { key: "returnedLimbs", label: "Limbs returned" },
  { key: "returnedArrows", label: "Arrows returned" },
  { key: "returnedFingerTab", label: "Finger Tab returned" },
  { key: "returnedString", label: "String returned" },
  { key: "returnedArmGuard", label: "Arm Guard returned" },
  { key: "returnedChestGuard", label: "Chest Guard returned" },
  { key: "returnedSight", label: "Sight returned" },
  { key: "returnedLongRod", label: "Long Rod returned" },
  { key: "returnedPressureButton", label: "Pressure Button returned" },
];

export function LoanBowSection({
  loanBow,
  onLoanBowFieldChange,
  onLoanBowToggle,
  disabled,
  helperMessage = "",
  onReturnClick,
  showReturnButton = false,
}) {
  const isActiveLoan = loanBow.hasLoanBow && !loanBow.returnedDate;
  const showLoanBowDetails = loanBow.hasLoanBow || Boolean(loanBow.returnedDate);
  const hasReturnedItems = LOAN_BOW_RETURN_STATUS_FIELDS.some(
    (field) => loanBow[field.key],
  );

  return (
    <fieldset className="profile-discipline-fieldset loan-bow-fieldset">
      <legend>Loan Bow</legend>
      {helperMessage ? <p>{helperMessage}</p> : null}

      {showLoanBowDetails ? (
        <div className="loan-bow-status">
          <span
            className={`loan-bow-status-badge ${
              loanBow.returnedDate ? "loan-bow-status-returned" : "loan-bow-status-active"
            }`}
          >
            {loanBow.returnedDate ? "Returned" : "Currently on loan"}
          </span>
          {loanBow.returnedDate ? (
            <p className="loan-bow-status-copy">
              Returned on {loanBow.returnedDate}.
            </p>
          ) : (
            <p className="loan-bow-status-copy">
              Loaned out on {loanBow.dateLoaned}.
            </p>
          )}
          {showReturnButton ? (
            <Button
              type="button"
              className="loan-bow-return-button"
              onClick={onReturnClick}
              disabled={disabled}
              variant="secondary"
            >
              Loan bow return
            </Button>
          ) : null}
        </div>
      ) : null}

      <label className="profile-checkbox">
        <input
          type="checkbox"
          checked={isActiveLoan}
          onChange={() => onLoanBowToggle("hasLoanBow")}
          disabled={disabled}
        />
        <span>Loan bow assigned</span>
      </label>

      {showLoanBowDetails ? (
        <div className="profile-form-grid loan-bow-grid">
          <label>
            Date Loaned
            <input
              type="date"
              value={loanBow.dateLoaned}
              onChange={onLoanBowFieldChange("dateLoaned")}
              disabled={disabled}
              required={showLoanBowDetails}
            />
          </label>

          <label>
            How many Arrows
            <input
              type="number"
              min="1"
              value={loanBow.arrowCount}
              onChange={onLoanBowFieldChange("arrowCount")}
              disabled={disabled}
              required={showLoanBowDetails}
            />
          </label>

          <label>
            Riser number
            <input
              value={loanBow.riserNumber}
              onChange={onLoanBowFieldChange("riserNumber")}
              disabled={disabled}
            />
          </label>

          <label>
            Limbs number
            <input
              value={loanBow.limbsNumber}
              onChange={onLoanBowFieldChange("limbsNumber")}
              disabled={disabled}
            />
          </label>
        </div>
      ) : null}

      {showLoanBowDetails ? (
        <div className="profile-discipline-grid loan-bow-boolean-grid">
          {LOAN_BOW_BOOLEAN_FIELDS.map((field) => (
            <label key={field.key} className="profile-checkbox">
              <input
                type="checkbox"
                checked={loanBow[field.key]}
                onChange={() => onLoanBowToggle(field.key)}
                disabled={disabled}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {showLoanBowDetails && hasReturnedItems ? (
        <div className="loan-bow-returned-grid">
          {LOAN_BOW_RETURN_STATUS_FIELDS.filter((field) => loanBow[field.key]).map(
            (field) => (
              <span key={field.key} className="loan-bow-returned-pill">
                {field.label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </fieldset>
  );
}
import { Button } from "./Button";
