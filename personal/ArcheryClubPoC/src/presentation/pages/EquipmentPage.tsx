import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { LabeledSelect } from "../components/LabeledSelect";
import { Modal } from "../components/Modal";
import { SectionPanel } from "../components/SectionPanel";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { hasPermission } from "../../utils/userProfile";

function describeCaseContentLocation(item, caseItem) {
  if (item.currentLocation?.caseId === caseItem.id) {
    if (caseItem.currentLocation?.type === "member") {
      return `In this case with ${caseItem.currentLocation.label}`;
    }

    return "In this case";
  }

  return item.currentLocation?.label || "";
}

const EMPTY_ADD_FORM = {
  equipmentType: "case",
  sizeCategory: "standard",
  itemNumber: "",
  arrowLength: "20",
  arrowQuantity: "6",
};

const CASE_ASSIGNMENT_FIELDS = [
  { key: "riser", label: "Riser", type: "riser" },
  { key: "limbPair", label: "Limb Pair", type: "limb" },
  { key: "quiver", label: "Quiver", type: "quiver" },
  { key: "sight", label: "Sight", type: "sight" },
  { key: "longRod", label: "Long Rod", type: "long_rod" },
  { key: "armGuard", label: "Arm Guard", type: "arm_guard" },
  { key: "chestGuard", label: "Chest Guard", type: "chest_guard" },
  { key: "fingerTab", label: "Finger Tab", type: "finger_tab" },
  { key: "arrows", label: "Arrows", type: "arrows" },
];

export function EquipmentPage({ currentUserProfile, equipmentCrud }) {
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [assignTargetType, setAssignTargetType] = useState("member");
  const [targetMemberUsername, setTargetMemberUsername] = useState("");
  const [targetCaseId, setTargetCaseId] = useState("");
  const [returnCaseId, setReturnCaseId] = useState("");
  const [cupboardLabel, setCupboardLabel] = useState("Main Cupboard");
  const [decommissionReason, setDecommissionReason] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("");
  const [inventorySort, setInventorySort] = useState({
    column: "type",
    direction: "asc",
  });
  const [activeCaseModalId, setActiveCaseModalId] = useState("");
  const [caseAssignmentSelections, setCaseAssignmentSelections] = useState({});
  const [isSavingCaseAssignments, setIsSavingCaseAssignments] = useState(false);

  const canAccessEquipment = [
    "add_decommission_equipment",
    "assign_equipment",
    "return_equipment",
    "update_equipment_storage",
  ].some((permissionKey) => hasPermission(currentUserProfile, permissionKey));

  const equipmentQuery = useQuery({
    queryKey: ["equipment-dashboard", actorUsername],
    queryFn: () =>
      equipmentCrud.getEquipmentDashboardUseCase.execute({
        actorUsername,
      }),
    enabled: canAccessEquipment,
  });

  const permissions = equipmentQuery.data?.permissions ?? {
    canAddDecommissionEquipment: false,
    canAssignEquipment: false,
    canReturnEquipment: false,
    canUpdateEquipmentStorage: false,
  };
  const items = equipmentQuery.data?.items ?? [];
  const cases = equipmentQuery.data?.cases ?? [];
  const members = equipmentQuery.data?.members ?? [];
  const equipmentTypeOptions = equipmentQuery.data?.equipmentTypeOptions ?? [];
  const sizeCategoryOptions = equipmentQuery.data?.sizeCategoryOptions ?? [];

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(String(items[0].id));
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (!targetMemberUsername && members.length > 0) {
      setTargetMemberUsername(members[0].username);
    }
  }, [members, targetMemberUsername]);

  useEffect(() => {
    if (!targetCaseId && cases.length > 0) {
      setTargetCaseId(String(cases[0].id));
    }
  }, [cases, targetCaseId]);

  const activeItems = useMemo(
    () => items.filter((item) => item.status === "active"),
    [items],
  );
  const loanedItems = useMemo(
    () => activeItems.filter((item) => item.currentLoan),
    [activeItems],
  );
  const storageItems = useMemo(
    () => activeItems.filter((item) => !item.currentLoan),
    [activeItems],
  );
  const selectedItem = useMemo(
    () => items.find((item) => String(item.id) === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const selectedReturnItem = useMemo(
    () => loanedItems.find((item) => String(item.id) === selectedItemId) ?? null,
    [loanedItems, selectedItemId],
  );
  const assignableCaseItems = useMemo(
    () =>
      activeItems.filter(
        (item) => item.type !== "case" && !item.currentLoan,
      ),
    [activeItems],
  );
  const activeCaseModal = useMemo(
    () => cases.find((caseItem) => String(caseItem.id) === activeCaseModalId) ?? null,
    [activeCaseModalId, cases],
  );
  const filteredInventoryItems = useMemo(() => {
    const normalizedFilter = inventoryFilter.trim().toLowerCase();
    const rows = items.filter((item) => {
      if (!normalizedFilter) {
        return true;
      }

      const referenceNumber =
        item.type === "arrows"
          ? `${item.arrowQuantity} x ${item.arrowLength}"`
          : item.number || "";
      const memberName = item.currentLoan?.memberName || "";
      const loanDate = item.currentLoan?.loanedAt || "";
      const lastAssignedBy = item.lastAssignedBy || "";

      return [
        item.typeLabel,
        referenceNumber,
        item.currentLocation.label,
        memberName,
        loanDate,
        lastAssignedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter);
    });

    const sortedRows = [...rows].sort((left, right) => {
      const getSortValue = (item) => {
        switch (inventorySort.column) {
          case "reference":
            return item.type === "arrows"
              ? `${item.arrowLength ?? 0}`.padStart(4, "0")
              : item.number || "";
          case "location":
            return item.status === "decommissioned"
              ? "decommissioned"
              : item.currentLocation.label || "";
          case "member":
            return item.currentLoan?.memberName || "";
          case "loanDate":
            return item.currentLoan?.loanedAt || "";
          case "lastAssignedBy":
            return item.lastAssignedBy || "";
          case "type":
          default:
            return `${item.typeLabel}${item.sizeCategory === "junior" ? " junior" : ""}`;
        }
      };

      const leftValue = String(getSortValue(left)).toLowerCase();
      const rightValue = String(getSortValue(right)).toLowerCase();
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      });

      return inventorySort.direction === "asc" ? comparison : comparison * -1;
    });

    return sortedRows;
  }, [inventoryFilter, inventorySort, items]);

  const toggleInventorySort = (column) => {
    setInventorySort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const refreshDashboard = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["equipment-dashboard", actorUsername],
    });
  };

  useEffect(() => {
    const refresh = () => {
      void refreshDashboard();
    };

    window.addEventListener("equipment-data-updated", refresh);

    return () => {
      window.removeEventListener("equipment-data-updated", refresh);
    };
  }, [actorUsername, queryClient]);

  const addEquipmentMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.addEquipmentItemUseCase.execute({
        actorUsername,
        payload: addForm,
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Equipment added successfully.");
      setAddForm(EMPTY_ADD_FORM);
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const decommissionMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.decommissionEquipmentItemUseCase.execute({
        actorUsername,
        itemId: selectedItemId,
        payload: { reason: decommissionReason },
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Equipment decommissioned successfully.");
      setDecommissionReason("");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.assignEquipmentItemUseCase.execute({
        actorUsername,
        payload: {
          itemId: selectedItemId,
          targetType: assignTargetType,
          memberUsername:
            assignTargetType === "member" ? targetMemberUsername : undefined,
          caseId: assignTargetType === "case" ? targetCaseId : undefined,
        },
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Equipment assignment updated successfully.");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.returnEquipmentItemUseCase.execute({
        actorUsername,
        payload: {
          itemId: selectedItemId,
          returnToCaseId:
            selectedReturnItem && selectedReturnItem.type !== "case"
              ? returnCaseId || null
              : null,
          cupboardLabel,
        },
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Equipment return recorded successfully.");
      setReturnCaseId("");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const storageMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.updateEquipmentStorageUseCase.execute({
        actorUsername,
        payload: {
          itemId: selectedItemId,
          cupboardLabel,
        },
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Storage location updated successfully.");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const openCaseAssignmentModal = (caseItem) => {
    const groupedContents = {
      riser: caseItem.contents.filter((item) => item.type === "riser"),
      limb: caseItem.contents.filter((item) => item.type === "limb"),
      quiver: caseItem.contents.filter((item) => item.type === "quiver"),
      sight: caseItem.contents.filter((item) => item.type === "sight"),
      long_rod: caseItem.contents.filter((item) => item.type === "long_rod"),
      arm_guard: caseItem.contents.filter((item) => item.type === "arm_guard"),
      chest_guard: caseItem.contents.filter((item) => item.type === "chest_guard"),
      finger_tab: caseItem.contents.filter((item) => item.type === "finger_tab"),
      arrows: caseItem.contents.filter((item) => item.type === "arrows"),
    };

    setCaseAssignmentSelections({
      riser: groupedContents.riser[0] ? String(groupedContents.riser[0].id) : "",
      limbPair: groupedContents.limb[0] ? String(groupedContents.limb[0].id) : "",
      sight: groupedContents.sight[0] ? String(groupedContents.sight[0].id) : "",
      longRod: groupedContents.long_rod[0] ? String(groupedContents.long_rod[0].id) : "",
      armGuard: groupedContents.arm_guard[0] ? String(groupedContents.arm_guard[0].id) : "",
      chestGuard: groupedContents.chest_guard[0] ? String(groupedContents.chest_guard[0].id) : "",
      fingerTab: groupedContents.finger_tab[0] ? String(groupedContents.finger_tab[0].id) : "",
      quiver: groupedContents.quiver[0] ? String(groupedContents.quiver[0].id) : "",
      arrows: groupedContents.arrows[0] ? String(groupedContents.arrows[0].id) : "",
    });
    setActiveCaseModalId(String(caseItem.id));
  };

  const getCaseAssignmentOptions = (type, caseItem, fieldKey) => {
    const selectedValues = new Set(
      Object.entries(caseAssignmentSelections)
        .filter(([key, value]) => key !== fieldKey && Boolean(value))
        .map(([, value]) => value),
    );

    return assignableCaseItems.filter((item) => {
      if (item.type !== type) {
        return false;
      }

      const isAlreadyInThisCase = item.currentLocation.caseId === caseItem.id;

      if (isAlreadyInThisCase) {
        return true;
      }

      if (item.currentLocation.type !== "cupboard") {
        return false;
      }

      return !selectedValues.has(String(item.id));
    });
  };

  const handleSaveCaseAssignments = async () => {
    if (!activeCaseModal) {
      return;
    }

    setIsSavingCaseAssignments(true);
    setError("");
    setMessage("");

    try {
      const assignmentsToSave = CASE_ASSIGNMENT_FIELDS
        .map((field) => caseAssignmentSelections[field.key])
        .filter(Boolean);
      const uniqueAssignments = [...new Set(assignmentsToSave)];
      const existingCaseItemIds = activeCaseModal.contents.map((item) => String(item.id));
      const itemsToRemove = existingCaseItemIds.filter(
        (itemId) => !uniqueAssignments.includes(itemId),
      );
      const itemsToAssign = uniqueAssignments.filter(
        (itemId) => !existingCaseItemIds.includes(itemId),
      );

      for (const itemId of itemsToRemove) {
        await equipmentCrud.updateEquipmentStorageUseCase.execute({
          actorUsername,
          payload: {
            itemId: Number(itemId),
            cupboardLabel: "Main Cupboard",
          },
        });
      }

      for (const itemId of itemsToAssign) {
        await equipmentCrud.assignEquipmentItemUseCase.execute({
          actorUsername,
          payload: {
            itemId: Number(itemId),
            targetType: "case",
            caseId: Number(activeCaseModal.id),
          },
        });
      }

      await refreshDashboard();
      setMessage(`Updated equipment for ${activeCaseModal.label}.`);
      setActiveCaseModalId("");
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to assign equipment to the case.",
      );
    } finally {
      setIsSavingCaseAssignments(false);
    }
  };

  if (!canAccessEquipment) {
    return <p>You do not have permission to manage equipment.</p>;
  }

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
        <SectionPanel className="profile-form" title="Add Equipment">
          <form
            className="left-align-form"
            onSubmit={(event) => {
              event.preventDefault();
              void addEquipmentMutation.mutateAsync();
            }}
          >
            <div className="profile-form-grid">
              <LabeledSelect
                label="Equipment type"
                value={addForm.equipmentType}
                onChange={(event) =>
                  setAddForm((current) => ({
                    ...current,
                    equipmentType: event.target.value,
                  }))
                }
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
                onChange={(event) =>
                  setAddForm((current) => ({
                    ...current,
                    sizeCategory: event.target.value,
                  }))
                }
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
                      value={addForm.arrowLength}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          arrowLength: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Arrow quantity
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={addForm.arrowQuantity}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          arrowQuantity: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : (
                <label>
                  Equipment number
                  <input
                    value={addForm.itemNumber}
                    onChange={(event) =>
                      setAddForm((current) => ({
                        ...current,
                        itemNumber: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
            </div>

            <Button type="submit" disabled={addEquipmentMutation.isPending}>
              {addEquipmentMutation.isPending ? "Adding equipment..." : "Add equipment"}
            </Button>
          </form>
        </SectionPanel>
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
                {item.label} | {item.status} | {item.currentLocation.label}
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
                        {member.fullName}
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
                onClick={() => {
                  void assignMutation.mutateAsync();
                }}
              >
                {assignMutation.isPending ? "Saving assignment..." : "Assign equipment"}
              </Button>
            </div>
          ) : null}

          {permissions.canReturnEquipment ? (
            <div className="equipment-action-card">
              <h3>Return equipment</h3>
              <p className="equipment-meta-copy">
                Only equipment currently on loan can be booked back in.
              </p>
              <LabeledSelect
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

              <label>
                Cupboard label
                <input
                  value={cupboardLabel}
                  onChange={(event) => setCupboardLabel(event.target.value)}
                />
              </label>

              <Button
                type="button"
                disabled={!selectedReturnItem || returnMutation.isPending}
                onClick={() => {
                  void returnMutation.mutateAsync();
                }}
              >
                {returnMutation.isPending ? "Recording return..." : "Return equipment"}
              </Button>
            </div>
          ) : null}

          {permissions.canUpdateEquipmentStorage ? (
            <div className="equipment-action-card">
              <h3>Update storage</h3>
              <LabeledSelect
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

              <label>
                Cupboard label
                <input
                  value={cupboardLabel}
                  onChange={(event) => setCupboardLabel(event.target.value)}
                />
              </label>

              <Button
                type="button"
                disabled={!selectedItem || storageMutation.isPending}
                onClick={() => {
                  void storageMutation.mutateAsync();
                }}
              >
                {storageMutation.isPending ? "Updating storage..." : "Update storage"}
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
                onClick={() => {
                  void decommissionMutation.mutateAsync();
                }}
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
                  {caseItem.contents.length} item{caseItem.contents.length === 1 ? "" : "s"}
                </span>
              </div>

              {caseItem.lastAssignedAt ? (
                <p className="equipment-meta-copy">
                  Assigned by {caseItem.lastAssignedBy || "Unknown"} on {caseItem.lastAssignedAt}
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
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("type")}>
                    Type
                  </button>
                </th>
                <th>
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("reference")}>
                    Reference Number
                  </button>
                </th>
                <th>
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("location")}>
                    Location
                  </button>
                </th>
                <th>
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("member")}>
                    Member
                  </button>
                </th>
                <th>
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("loanDate")}>
                    Loan Date
                  </button>
                </th>
                <th>
                  <button type="button" className="equipment-table-sort" onClick={() => toggleInventorySort("lastAssignedBy")}>
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
                      {item.typeLabel}
                      {item.sizeCategory === "junior" ? " (Junior)" : ""}
                    </td>
                    <td>
                      {item.type === "arrows"
                        ? `${item.arrowQuantity} x ${item.arrowLength}"`
                        : item.number || "-"}
                    </td>
                    <td>
                      {item.status === "decommissioned"
                        ? "Decommissioned"
                        : item.currentLocation.label}
                    </td>
                    <td>{item.currentLoan?.memberName || "-"}</td>
                    <td>{item.currentLoan?.loanedAt || "-"}</td>
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

      <Modal
        open={Boolean(activeCaseModal)}
        onClose={() => {
          if (!isSavingCaseAssignments) {
            setActiveCaseModalId("");
          }
        }}
        title={activeCaseModal ? `Assign Equipment To ${activeCaseModal.label}` : "Assign Equipment"}
      >
        {activeCaseModal ? (
          <div className="equipment-case-modal">
            <p className="equipment-meta-copy">
              Choose the equipment you want to place into this case. Items already in this case stay pre-selected, and empty fields show anything still missing.
            </p>

            <div className="equipment-case-modal-grid">
              {CASE_ASSIGNMENT_FIELDS.map((field) => (
                <LabeledSelect
                  key={field.key}
                  className="equipment-case-select"
                  label={field.label}
                  value={caseAssignmentSelections[field.key] ?? ""}
                  onChange={(event) =>
                    setCaseAssignmentSelections((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                >
                  <option value="">No selection</option>
                  {getCaseAssignmentOptions(field.type, activeCaseModal, field.key).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </LabeledSelect>
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
    </div>
  );
}
