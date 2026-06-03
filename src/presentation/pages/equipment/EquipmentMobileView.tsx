import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusMessagePanel } from "../../components/StatusMessagePanel";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import { formatShortDateTime } from "../../../utils/dateTime";
import { formatMemberDisplayName } from "../../../utils/userProfile";
import {
  describeCaseContentLocation,
  getEquipmentLoanDateLabel,
  getEquipmentLocationLabel,
  getEquipmentMemberLabel,
  getEquipmentReferenceLabel,
  INVENTORY_SORT_OPTIONS,
} from "./equipmentUtils";
import type { useEquipmentPageState } from "./useEquipmentPageState";

type EquipmentPageState = ReturnType<typeof useEquipmentPageState>;

export function EquipmentMobileView({
  addEquipmentMutation,
  addForm,
  addStorageLocationMutation,
  assignMutation,
  assignTargetType,
  cases,
  cupboardLabel,
  cupboardOptions,
  decommissionMutation,
  decommissionReason,
  equipmentQuery,
  equipmentTypeOptions,
  error,
  filteredInventoryItems,
  handleAddEquipmentSubmit,
  handleAddStorageLocation,
  handleAssignEquipment,
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
  sizeCategoryOptions,
  storageItems,
  storageMutation,
  targetCaseId,
  targetMemberUsername,
  updateAddFormField,
  updateInventorySortColumn,
  updateInventorySortDirection,
}: EquipmentPageState) {
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
        <SectionPanel className="profile-form" title="Add Equipment">
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

              <LabeledSelect
                label="Size"
                value={addForm.sizeCategory}
                onChange={updateAddFormField("sizeCategory")}
              >
                {sizeCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </LabeledSelect>

              {addForm.equipmentType === "arrows" ? (
                <>
                  <label>
                    Arrow length (inches)
                    <input
                      type="number"
                      min="20"
                      inputMode="numeric"
                      value={addForm.arrowLength}
                      onChange={updateAddFormField("arrowLength")}
                    />
                  </label>

                  <label>
                    Arrow quantity
                    <input
                      type="number"
                      min="1"
                      max="12"
                      inputMode="numeric"
                      value={addForm.arrowQuantity}
                      onChange={updateAddFormField("arrowQuantity")}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Equipment number
                  <input
                    value={addForm.itemNumber}
                    onChange={updateAddFormField("itemNumber")}
                  />
                </label>
              )}
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
      ) : null}

      <SectionPanel className="profile-form" title="Equipment Actions">
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

          {permissions.canAssignEquipment ? (
            <div className="equipment-action-card">
              <h3>Assign equipment</h3>
              <div className="profile-form-grid">
                <LabeledSelect
                  label="Assign to"
                  value={assignTargetType}
                  onChange={(event) => setAssignTargetType(event.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="case">Case</option>
                </LabeledSelect>

                {assignTargetType === "member" ? (
                  <LabeledSelect
                    label="Borrowing member"
                    value={targetMemberUsername}
                    onChange={(event) => setTargetMemberUsername(event.target.value)}
                  >
                    {members.map((member) => (
                      <option key={member.username} value={member.username}>
                        {formatMemberDisplayName(member)}
                      </option>
                    ))}
                  </LabeledSelect>
                ) : (
                  <LabeledSelect
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

          {permissions.canManageEquipmentStorageLocations ? (
            <div className="equipment-action-card">
              <h3>Manage storage locations</h3>
              <div className="profile-form-grid">
                <label>
                  New storage location
                  <input
                    value={newStorageLocation}
                    onChange={(event) => setNewStorageLocation(event.target.value)}
                    placeholder="Limb Cupboard"
                  />
                </label>

                <LabeledSelect
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
              </div>

              <div className="loan-bow-return-actions">
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

      <SectionPanel className="profile-form" title="Cases And Contents">
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

                <details className="equipment-mobile-case-details">
                  <summary>
                    Contents ({caseItem.contents.length})
                  </summary>
                  {caseItem.contents.length > 0 ? (
                    <ul className="home-info-list equipment-case-list">
                      {caseItem.contents.map((item) => (
                        <li key={item.id}>
                          <strong>{item.label}</strong>
                          {`: ${describeCaseContentLocation(item, caseItem)}`}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <MobileEmptyState message="No equipment currently stored in this case." />
                  )}
                </details>
              </article>
            ))}
          </MobileCardList>
        ) : (
          <MobileEmptyState message="No cases are currently registered." />
        )}
      </SectionPanel>

      <section className="profile-form">
        <MobileSectionHeader
          title="Inventory Register"
          description={`${filteredInventoryItems.length} matching item${filteredInventoryItems.length === 1 ? "" : "s"}.`}
        />
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
                  {item.typeLabel}
                  {item.sizeCategory === "junior" ? " (Junior)" : ""}
                </p>
                <MobileKeyValueList
                  items={[
                    { label: "Reference", value: getEquipmentReferenceLabel(item) },
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
      </section>
    </div>
  );
}
