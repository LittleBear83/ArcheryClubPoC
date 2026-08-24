import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { Modal } from "../../components/Modal";
import { CASE_ASSIGNMENT_FIELDS } from "./equipmentUtils";
import type { useEquipmentPageState } from "./useEquipmentPageState";

type EquipmentPageState = ReturnType<typeof useEquipmentPageState>;

export function EquipmentCaseAssignmentModal({
  activeCaseModal,
  caseAssignmentSelections,
  closeCaseAssignmentModal,
  getCaseAssignmentOptions,
  handleSaveCaseAssignments,
  isSavingCaseAssignments,
  updateCaseAssignmentSelection,
}: EquipmentPageState) {
  return (
    <Modal
      open={Boolean(activeCaseModal)}
      onClose={closeCaseAssignmentModal}
      title={
        activeCaseModal
          ? `Assign Equipment To ${activeCaseModal.label}`
          : "Assign Equipment"
      }
    >
      {activeCaseModal ? (
        <div className="equipment-case-modal">
          <p className="equipment-meta-copy">
            Choose the equipment you want to place into this case. Items already
            in this case stay pre-selected, and empty fields show anything still
            missing.
          </p>

          <div className="equipment-case-modal-grid">
            {CASE_ASSIGNMENT_FIELDS.map((field) => (
              <div key={field.key} className="equipment-case-modal-field">
                <LabeledSelect
                  className="equipment-case-select"
                  label={field.label}
                  value={caseAssignmentSelections[field.key] ?? ""}
                  onChange={updateCaseAssignmentSelection(field.key)}
                >
                  <option value="">No selection</option>
                  {getCaseAssignmentOptions(
                    field.type,
                    activeCaseModal,
                    field.key,
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </LabeledSelect>
              </div>
            ))}
          </div>

          <div className="loan-bow-return-actions">
            <Button
              type="button"
              onClick={() => {
                void handleSaveCaseAssignments();
              }}
              disabled={isSavingCaseAssignments}
            >
              {isSavingCaseAssignments ? "Saving case..." : "Save Case Equipment"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
