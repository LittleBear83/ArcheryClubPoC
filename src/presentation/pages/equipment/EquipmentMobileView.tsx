import { useState } from "react";
import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { MemberAutocomplete } from "../../components/MemberAutocomplete";
import { Modal } from "../../components/Modal";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusMessagePanel } from "../../components/StatusMessagePanel";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { formatShortDateTime } from "../../../utils/dateTime";
import {
  CASE_ASSIGNMENT_FIELDS,
  describeCaseContentLocation,
  getEquipmentDetailsLabel,
  getEquipmentLoanDateLabel,
  getEquipmentLocationLabel,
  getEquipmentMemberLabel,
  getEquipmentReferenceLabel,
  getEquipmentTypeDisplayLabel,
  INVENTORY_SORT_OPTIONS,
} from "./equipmentUtils";
import { EquipmentAddDetailsFields } from "./EquipmentAddDetailsFields";
import type { useEquipmentPageState } from "./useEquipmentPageState";

type EquipmentPageState = ReturnType<typeof useEquipmentPageState>;

export function EquipmentMobileView({
  addEquipmentMutation,
  addForm,
  addStorageLocationMutation,
  assignMutation,
  assignTargetType,
  cases,
  closeEquipmentCorrectionModal,
  correctEquipmentMutation,
  cupboardLabel,
  cupboardOptions,
  decommissionMutation,
  decommissionReason,
  editForm,
  editingItem,
  equipmentQuery,
  equipmentTypeOptions,
  error,
  filteredInventoryItems,
  handleAddEquipmentSubmit,
  handleAddStorageLocation,
  handleAssignEquipment,
  handleCorrectEquipmentSubmit,
  handleDecommissionEquipment,
  handleRemoveStorageLocation,
  handleReturnEquipment,
  handleUpdateStorage,
  inventoryFilter,
  inventorySort,
  items,
  loanedItems,
  members,
  message,
  newStorageLocation,
  openCaseAssignmentModal,
  openEquipmentCorrectionModal,
  permissions,
  removableStorageOptions,
  removeStorageLocationMutation,
  removeStorageLocation,
  returnCaseId,
  returnMutation,
  selectedItem,
  selectedItemId,
  selectedItemSummary,
  selectedReturnItem,
  setAssignTargetType,
  setCupboardLabel,
  setDecommissionReason,
  setInventoryFilter,
  setNewStorageLocation,
  setRemoveStorageLocation,
  setReturnCaseId,
  setSelectedItemId,
  setTargetCaseId,
  setTargetMemberUsername,
  storageItems,
  storageMutation,
  targetCaseId,
  targetMemberUsername,
  updateAddFormField,
  updateEditFormField,
  updateInventorySortColumn,
  updateInventorySortDirection,
}: EquipmentPageState) {
  const [activeCaseContents, setActiveCaseContents] = useState<(typeof cases)[number] | null>(null);

  return (
    <div className="profile-page equipment-page equipment-page--mobile">
      <p>
        Register, assign, return, and track cases and club equipment across
        cupboards, cases, and member loans.
      </p>

      <StatusMessagePanel
        error={error}
        loading={equipmentQuery.isLoading}
        loadingLabel="Loading equipment register..."
        success={message}
      />

      {permissions.canAddDecommissionEquipment ? (
        <>
          <SectionPanel
            className="profile-form"
            title="Add Equipment"
            description="Create a new equipment record with its key details."
          >
            <form className="left-align-form" onSubmit={handleAddEquipmentSubmit}>
              <div className="profile-form-grid">
                <LabeledSelect
                  label="Equipment type"
                  value={addForm.equipmentType}
                  onChange={updateAddFormField("equipmentType")}
                >
                  {equipmentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </LabeledSelect>

                <EquipmentAddDetailsFields
                  addForm={addForm}
                  updateAddFormField={updateAddFormField}
                />
              </div>

              <Button
                type="submit"
                disabled={addEquipmentMutation.isPending}
                fullWidth
              >
                {addEquipmentMutation.isPending
                  ? "Adding equipment..."
                  : "Add equipment"}
              </Button>
            </form>
          </SectionPanel>

          {permissions.canManageEquipmentStorageLocations ? (
            <SectionPanel
              className="profile-form"
              title="Manage Storage Locations"
              description="Add, rename, or retire the storage places used by the club."
            >
              <div className="equipment-storage-management-grid">
                <div className="equipment-storage-management-card">
                  <label className="equipment-storage-management-field">
                    New storage location
                    <input
                      value={newStorageLocation}
                      onChange={(event) => setNewStorageLocation(event.target.value)}
                      placeholder="Limb Cupboard"
                    />
                  </label>

                  <p className="profile-field-helper">
                    Add a new named storage area so equipment can be booked into it.
                  </p>

                  <Button
                    type="button"
                    disabled={
                      !newStorageLocation.trim() ||
                      addStorageLocationMutation.isPending
                    }
                    onClick={handleAddStorageLocation}
                    fullWidth
                  >
                    {addStorageLocationMutation.isPending
                      ? "Adding location..."
                      : "Add location"}
                  </Button>
                </div>

                <div className="equipment-storage-management-card">
                  <LabeledSelect
                    className="equipment-storage-management-field"
                    label="Remove storage location"
                    value={removeStorageLocation}
                    onChange={(event) =>
                      setRemoveStorageLocation(event.target.value)
                    }
                    disabled={removableStorageOptions.length === 0}
                  >
                    {removableStorageOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </LabeledSelect>

                  <p className="profile-field-helper">
                    Only empty storage locations can be removed. Locations still holding equipment stay unavailable here.
                  </p>

                  <Button
                    type="button"
                    variant="danger"
                    disabled={
                      !removeStorageLocation ||
                      removeStorageLocationMutation.isPending
                    }
                    onClick={handleRemoveStorageLocation}
                    fullWidth
                  >
                    {removeStorageLocationMutation.isPending
                      ? "Removing location..."
                      : "Remove location"}
                  </Button>
                </div>
              </div>
            </SectionPanel>
          ) : null}
        </>
      ) : null}

      <SectionPanel
        className="profile-form"
        title="Equipment Actions"
        description="Assign, return, store, or retire equipment."
        collapsible
        defaultCollapsed
      >
        <div className="left-align-form equipment-mobile-action-list">
          <LabeledSelect
            label="Selected equipment"
            value={selectedItemId}
            onChange={(event) => setSelectedItemId(event.target.value)}
            disabled={items.length === 0}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} | {item.status} | {getEquipmentLocationLabel(item)}
              </option>
            ))}
          </LabeledSelect>

          {selectedItemSummary ? (
            <p className="equipment-meta-copy">{selectedItemSummary}</p>
          ) : null}

          {permissions.canAddDecommissionEquipment ? (
            <Button
              type="button"
              disabled={!selectedItem}
              onClick={openEquipmentCorrectionModal}
              fullWidth
            >
              Correct equipment details
            </Button>
          ) : null}

          {permissions.canAssignEquipment ? (
            <div className="equipment-action-card equipment-action-card--assign">
              <h3>Assign equipment</h3>
              <p className="equipment-meta-copy">
                Choose whether this item is being signed out to a member or packed into a case.
              </p>
              <div className="equipment-assign-layout">
                <div className="equipment-assign-target-card">
                  <LabeledSelect
                    className="equipment-inline-control"
                    label="Assign to"
                    value={assignTargetType}
                    onChange={(event) => setAssignTargetType(event.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="case">Case</option>
                  </LabeledSelect>
                </div>

                <div className="equipment-inline-control-grid equipment-assign-fields">
                  {assignTargetType === "member" ? (
                    <MemberAutocomplete
                      className="equipment-inline-control"
                      clearDisplayOnFocus
                      fullWidth
                      maxWidth="28rem"
                      label="Borrowing member"
                      options={members.map((member) => ({
                        keywords: [member.username],
                        label: member.fullName || member.username,
                        value: member.username,
                      }))}
                      value={targetMemberUsername}
                      onValueChange={setTargetMemberUsername}
                    />
                  ) : (
                    <LabeledSelect
                      className="equipment-inline-control"
                      label="Target case"
                      value={targetCaseId}
                      onChange={(event) => setTargetCaseId(event.target.value)}
                    >
                      {cases
                        .filter((caseItem) => String(caseItem.id) !== selectedItemId)
                        .map((caseItem) => (
                          <option key={caseItem.id} value={caseItem.id}>
                            {caseItem.label}
                          </option>
                        ))}
                    </LabeledSelect>
                  )}
                </div>
              </div>

              <div className="equipment-assign-footer">
                <Button
                  type="button"
                  disabled={!selectedItem || assignMutation.isPending}
                  onClick={handleAssignEquipment}
                  fullWidth
                >
                  {assignMutation.isPending
                    ? "Saving assignment..."
                    : "Assign equipment"}
                </Button>
              </div>
            </div>
          ) : null}

          {permissions.canReturnEquipment ? (
            <div className="equipment-action-card">
              <h3>Return equipment</h3>
              <p className="equipment-meta-copy">
                Only equipment currently on loan can be booked back in.
              </p>
              <div className="equipment-inline-control-grid">
                <LabeledSelect
                  className="equipment-inline-control"
                  label="Loaned item"
                  value={selectedReturnItem ? String(selectedReturnItem.id) : ""}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  disabled={loanedItems.length === 0}
                >
                  {loanedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} | {item.currentLoan?.memberName}
                    </option>
                  ))}
                </LabeledSelect>

                {selectedReturnItem && selectedReturnItem.type !== "case" ? (
                  <LabeledSelect
                    className="equipment-inline-control"
                    label="Return straight into case"
                    value={returnCaseId}
                    onChange={(event) => setReturnCaseId(event.target.value)}
                  >
                    <option value="">No, return to cupboard</option>
                    {cases.map((caseItem) => (
                      <option key={caseItem.id} value={caseItem.id}>
                        {caseItem.label}
                      </option>
                    ))}
                  </LabeledSelect>
                ) : null}

                <LabeledSelect
                  className="equipment-inline-control"
                  label="Return to storage"
                  value={cupboardLabel}
                  onChange={(event) => setCupboardLabel(event.target.value)}
                >
                  {cupboardOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </LabeledSelect>
              </div>

              <Button
                type="button"
                disabled={!selectedReturnItem || returnMutation.isPending}
                onClick={handleReturnEquipment}
                fullWidth
              >
                {returnMutation.isPending
                  ? "Recording return..."
                  : "Return equipment"}
              </Button>
            </div>
          ) : null}

          {permissions.canUpdateEquipmentStorage ? (
            <div className="equipment-action-card">
              <h3>Update storage</h3>
              <div className="equipment-inline-control-grid">
                <LabeledSelect
                  className="equipment-inline-control"
                  label="Stored item"
                  value={selectedItemId}
                  onChange={(event) => setSelectedItemId(event.target.value)}
                  disabled={storageItems.length === 0}
                >
                  {storageItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </LabeledSelect>

                <LabeledSelect
                  className="equipment-inline-control"
                  label="Storage location"
                  value={cupboardLabel}
                  onChange={(event) => setCupboardLabel(event.target.value)}
                >
                  {cupboardOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </LabeledSelect>
              </div>

              <Button
                type="button"
                disabled={!selectedItem || storageMutation.isPending}
                onClick={handleUpdateStorage}
                fullWidth
              >
                {storageMutation.isPending
                  ? "Updating storage..."
                  : "Update storage"}
              </Button>
            </div>
          ) : null}

          {permissions.canAddDecommissionEquipment ? (
            <div className="equipment-action-card">
              <h3>Decommission equipment</h3>
              <label>
                Reason
                <textarea
                  value={decommissionReason}
                  onChange={(event) => setDecommissionReason(event.target.value)}
                  rows={3}
                />
              </label>

              <Button
                type="button"
                variant="danger"
                disabled={
                  !selectedItem ||
                  !decommissionReason.trim() ||
                  decommissionMutation.isPending
                }
                onClick={handleDecommissionEquipment}
                fullWidth
              >
                {decommissionMutation.isPending
                  ? "Decommissioning..."
                  : "Decommission equipment"}
              </Button>
            </div>
          ) : null}
        </div>
      </SectionPanel>

      <SectionPanel
        className="profile-form"
        title="Cases And Contents"
        description="Review each case and manage what belongs in it."
        collapsible
        defaultCollapsed
      >
        {cases.length > 0 ? (
          <MobileCardList className="equipment-mobile-case-list">
            {cases.map((caseItem) => (
              <article key={caseItem.id} className="equipment-case-card">
                <div className="equipment-case-header">
                  <div>
                    <h3>{caseItem.label}</h3>
                    <p className="equipment-meta-copy">
                      {caseItem.currentLocation.type === "member"
                        ? `With ${caseItem.currentLocation.label}`
                        : caseItem.currentReservation
                          ? `Reserved for ${caseItem.currentReservation.participantName} at ${caseItem.currentLocation.label}`
                        : `Stored in ${caseItem.currentLocation.label}`}
                    </p>
                  </div>
                  <span className="loan-bow-status-badge loan-bow-status-active">
                    {caseItem.contents.length} item
                    {caseItem.contents.length === 1 ? "" : "s"}
                  </span>
                </div>

                {caseItem.lastAssignedAt ? (
                  <p className="equipment-meta-copy">
                    Assigned by {caseItem.lastAssignedBy || "Unknown"} on{" "}
                    {formatShortDateTime(caseItem.lastAssignedAt)}
                  </p>
                ) : null}

                <div className="equipment-case-action-row">
                  {permissions.canAssignEquipment ? (
                    <Button
                      type="button"
                      className="equipment-case-action-button"
                      onClick={() => openCaseAssignmentModal(caseItem)}
                      fullWidth
                    >
                      Assign Equipment To Case
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="equipment-case-action-button"
                    onClick={() => setActiveCaseContents(caseItem)}
                    fullWidth
                  >
                    Show Equipment In Case
                  </Button>
                </div>
              </article>
            ))}
          </MobileCardList>
        ) : (
          <MobileEmptyState message="No cases are currently registered." />
        )}
      </SectionPanel>

      <Modal
        open={Boolean(activeCaseContents)}
        onClose={() => setActiveCaseContents(null)}
        title={activeCaseContents ? `${activeCaseContents.label} Contents` : "Case Contents"}
        contentClassName="modal-content--wide"
      >
        {activeCaseContents ? (
            <div className="equipment-inventory-table-wrap equipment-case-contents-table-wrap">
              <table className="equipment-inventory-table equipment-case-contents-table">
                <colgroup>
                  <col className="equipment-case-contents-col-type" />
                  <col className="equipment-case-contents-col-reference" />
                  <col className="equipment-case-contents-col-reference" />
                  <col className="equipment-case-contents-col-details" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {CASE_ASSIGNMENT_FIELDS
                    .map((field) => ({
                      field,
                      item: activeCaseContents.contents.find(
                        (entry) => entry.type === field.type,
                      ) ?? null,
                    }))
                    .sort((left, right) => {
                      if (left.item && !right.item) {
                        return -1;
                      }

                      if (!left.item && right.item) {
                        return 1;
                      }

                      return 0;
                    })
                    .map(({ field, item }) => (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        <td>{item ? getEquipmentTypeDisplayLabel(item) : "Missing"}</td>
                        <td>
                          {item
                            ? item.number || (
                              item.type === "arrows"
                                ? `${item.arrowQuantity} x ${item.arrowLength}"`
                                : "-"
                            )
                            : "-"}
                        </td>
                        <td>{item ? getEquipmentDetailsLabel(item) : "No item currently assigned"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
        ) : null}
      </Modal>

      <SectionPanel
        className="profile-form"
        title={`Inventory Register (${filteredInventoryItems.length})`}
        description="Search and review the full equipment list."
        collapsible
        defaultCollapsed
      >
        <div className="equipment-table-toolbar equipment-table-toolbar--mobile">
          <label className="profile-member-select">
            Filter inventory
            <input
              type="search"
              value={inventoryFilter}
              onChange={(event) => setInventoryFilter(event.target.value)}
              placeholder="Search type, number, location, member, or date"
            />
          </label>
          <div className="equipment-mobile-sort-grid">
            <LabeledSelect
              className="equipment-inline-control"
              label="Sort by"
              value={inventorySort.column}
              onChange={(event) => updateInventorySortColumn(event.target.value)}
            >
              {INVENTORY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </LabeledSelect>
            <LabeledSelect
              className="equipment-inline-control"
              label="Direction"
              value={inventorySort.direction}
              onChange={(event) =>
                updateInventorySortDirection(event.target.value)
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </LabeledSelect>
          </div>
        </div>
        {filteredInventoryItems.length > 0 ? (
          <MobileCardList className="equipment-mobile-inventory-list">
            {filteredInventoryItems.map((item) => (
              <article key={item.id} className="equipment-inventory-card">
                <p className="profile-mobile-card-title">
                  {getEquipmentTypeDisplayLabel(item)}
                </p>
                <MobileKeyValueList
                  items={[
                    { label: "Reference", value: getEquipmentReferenceLabel(item) },
                    { label: "Details", value: getEquipmentDetailsLabel(item) },
                    { label: "Location", value: getEquipmentLocationLabel(item) },
                    { label: "Member", value: getEquipmentMemberLabel(item) || "-" },
                    { label: "Loan Date", value: getEquipmentLoanDateLabel(item) || "-" },
                    { label: "Last Assigned By", value: item.lastAssignedBy || "-" },
                  ]}
                />
              </article>
            ))}
          </MobileCardList>
        ) : (
          <MobileEmptyState message="No equipment matches the current filter." />
        )}
      </SectionPanel>

      <Modal
        open={Boolean(editingItem)}
        onClose={closeEquipmentCorrectionModal}
        title={
          editingItem
            ? `Correct ${getEquipmentTypeDisplayLabel(editingItem)}`
            : "Correct equipment details"
        }
      >
        {editingItem ? (
          <form
            className="left-align-form equipment-correction-form"
            onSubmit={handleCorrectEquipmentSubmit}
          >
            <p className="equipment-meta-copy">
              Update the recorded details for {editingItem.label}. This corrects
              the equipment record without changing its assignment or loan history.
            </p>
            <div className="profile-form-grid">
              <EquipmentAddDetailsFields
                addForm={editForm}
                updateAddFormField={updateEditFormField}
              />
            </div>
            <div className="equipment-correction-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={closeEquipmentCorrectionModal}
                disabled={correctEquipmentMutation.isPending}
                fullWidth
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={correctEquipmentMutation.isPending}
                fullWidth
              >
                {correctEquipmentMutation.isPending
                  ? "Saving correction..."
                  : "Save correction"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
