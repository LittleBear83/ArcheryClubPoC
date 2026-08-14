import { Button } from "../../components/Button";
import { LabeledSelect } from "../../components/LabeledSelect";
import { SectionPanel } from "../../components/SectionPanel";
import { StatusMessagePanel } from "../../components/StatusMessagePanel";
import { formatShortDateTime } from "../../../utils/dateTime";
import { formatMemberDisplayName } from "../../../utils/userProfile";
import {
  describeCaseContentLocation,
  getEquipmentLoanDateLabel,
  getEquipmentLocationLabel,
  getEquipmentMemberLabel,
  getEquipmentReferenceLabel,
  getEquipmentTypeDisplayLabel,
} from "./equipmentUtils";
import { EquipmentAddDetailsFields } from "./EquipmentAddDetailsFields";
import type { useEquipmentPageState } from "./useEquipmentPageState";

type EquipmentPageState = ReturnType<typeof useEquipmentPageState>;

export function EquipmentDesktopView({
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
  toggleInventorySort,
  updateAddFormField,
}: EquipmentPageState) {
  return (
    <div className="profile-page equipment-page">
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

                <EquipmentAddDetailsFields
                  addForm={addForm}
                  updateAddFormField={updateAddFormField}
                />
              </div>

              <Button type="submit" disabled={addEquipmentMutation.isPending}>
                {addEquipmentMutation.isPending
                  ? "Adding equipment..."
                  : "Add equipment"}
              </Button>
            </form>
          </SectionPanel>

          {permissions.canManageEquipmentStorageLocations ? (
            <SectionPanel className="profile-form" title="Manage Storage Locations">
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
                >
                  {removeStorageLocationMutation.isPending
                    ? "Removing location..."
                    : "Remove location"}
                </Button>
              </div>
            </SectionPanel>
          ) : null}
        </>
      ) : null}

      <SectionPanel className="profile-form" title="Equipment Actions">
        <div className="left-align-form">
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
        <div className="equipment-case-grid">
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
                >
                  Assign Equipment To Case
                </Button>
              ) : null}

              <ul className="home-info-list equipment-case-list">
                {caseItem.contents.length > 0 ? (
                  caseItem.contents.map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}</strong>
                      {`: ${describeCaseContentLocation(item, caseItem)}`}
                    </li>
                  ))
                ) : (
                  <li>No equipment currently stored in this case.</li>
                )}
              </ul>
            </article>
          ))}
        </div>
      </SectionPanel>

      <SectionPanel className="profile-form" title="Inventory Register">
        <div className="equipment-table-toolbar">
          <label className="profile-member-select">
            Filter inventory
            <input
              type="search"
              value={inventoryFilter}
              onChange={(event) => setInventoryFilter(event.target.value)}
              placeholder="Search type, number, location, member, or date"
            />
          </label>
        </div>
        <div className="equipment-inventory-table-wrap">
          <table className="equipment-inventory-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("type")}
                  >
                    Type
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("reference")}
                  >
                    Reference Number
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("location")}
                  >
                    Location
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("member")}
                  >
                    Member
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("loanDate")}
                  >
                    Loan Date
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="equipment-table-sort"
                    onClick={() => toggleInventorySort("lastAssignedBy")}
                  >
                    Last Assigned By
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInventoryItems.length > 0 ? (
                filteredInventoryItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {getEquipmentTypeDisplayLabel(item)}
                    </td>
                    <td>{getEquipmentReferenceLabel(item)}</td>
                    <td>{getEquipmentLocationLabel(item)}</td>
                    <td>{getEquipmentMemberLabel(item) || "-"}</td>
                    <td>{getEquipmentLoanDateLabel(item) || "-"}</td>
                    <td>{item.lastAssignedBy || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No equipment matches the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </div>
  );
}
