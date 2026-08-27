import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission } from "../../../utils/userProfile";
import {
  buildEquipmentFormFromItem,
  CASE_ASSIGNMENT_FIELDS,
  EMPTY_ADD_FORM,
  getEquipmentLoanDateLabel,
  getEquipmentLocationLabel,
  getEquipmentMemberLabel,
  getEquipmentReferenceLabel,
  getEquipmentTypeDisplayLabel,
} from "./equipmentUtils";

export function useEquipmentPageState({ currentUserProfile, equipmentCrud }) {
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
  const [newStorageLocation, setNewStorageLocation] = useState("");
  const [removeStorageLocation, setRemoveStorageLocation] = useState("");
  const [decommissionReason, setDecommissionReason] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_ADD_FORM);
  const [editingItemId, setEditingItemId] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState("");
  const [inventorySort, setInventorySort] = useState({
    column: "type",
    direction: "asc",
  });
  const hasInitializedTargetMemberRef = useRef(false);
  const [activeCaseModalId, setActiveCaseModalId] = useState("");
  const [caseAssignmentSelections, setCaseAssignmentSelections] = useState({});
  const [isSavingCaseAssignments, setIsSavingCaseAssignments] = useState(false);

  const canAccessEquipment = [
    "add_decommission_equipment",
    "assign_equipment",
    "return_equipment",
    "update_equipment_storage",
    "manage_equipment_storage_locations",
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
    canManageEquipmentStorageLocations: false,
  };
  const items = useMemo(
    () => equipmentQuery.data?.items ?? [],
    [equipmentQuery.data?.items],
  );
  const members = useMemo(
    () => equipmentQuery.data?.members ?? [],
    [equipmentQuery.data?.members],
  );
  const equipmentTypeOptions = useMemo(
    () => equipmentQuery.data?.equipmentTypeOptions ?? [],
    [equipmentQuery.data?.equipmentTypeOptions],
  );
  const sizeCategoryOptions = useMemo(
    () => equipmentQuery.data?.sizeCategoryOptions ?? [],
    [equipmentQuery.data?.sizeCategoryOptions],
  );
  const cupboardOptions = useMemo(
    () =>
      equipmentQuery.data?.cupboardOptions?.length
        ? equipmentQuery.data.cupboardOptions
        : ["Main Cupboard"],
    [equipmentQuery.data?.cupboardOptions],
  );
  const activeItems = useMemo(
    () => items.filter((item) => item.status === "active"),
    [items],
  );
  const cases = useMemo(
    () => (equipmentQuery.data?.cases ?? []).filter((caseItem) => caseItem.status === "active"),
    [equipmentQuery.data?.cases],
  );

  useEffect(() => {
    if (!selectedItemId && items.length > 0) {
      setSelectedItemId(String(items[0].id));
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    if (
      !hasInitializedTargetMemberRef.current &&
      !targetMemberUsername &&
      members.length > 0
    ) {
      hasInitializedTargetMemberRef.current = true;
      setTargetMemberUsername(members[0].username);
    }
  }, [members, targetMemberUsername]);

  useEffect(() => {
    if (!targetCaseId && cases.length > 0) {
      setTargetCaseId(String(cases[0].id));
    }
  }, [cases, targetCaseId]);

  useEffect(() => {
    if (cupboardOptions.length > 0 && !cupboardOptions.includes(cupboardLabel)) {
      setCupboardLabel(cupboardOptions[0]);
    }
  }, [cupboardLabel, cupboardOptions]);
  const loanedItems = useMemo(
    () => activeItems.filter((item) => item.currentLoan),
    [activeItems],
  );
  const storageItems = useMemo(
    () => activeItems.filter((item) => !item.currentLoan),
    [activeItems],
  );
  const selectedItem = useMemo(
    () => activeItems.find((item) => String(item.id) === selectedItemId) ?? null,
    [activeItems, selectedItemId],
  );
  const selectedReturnItem = useMemo(
    () => loanedItems.find((item) => String(item.id) === selectedItemId) ?? null,
    [loanedItems, selectedItemId],
  );
  const assignableCaseItems = useMemo(
    () => activeItems.filter((item) => item.type !== "case"),
    [activeItems],
  );
  const activeCaseModal = useMemo(
    () => cases.find((caseItem) => String(caseItem.id) === activeCaseModalId) ?? null,
    [activeCaseModalId, cases],
  );
  const removableStorageOptions = useMemo(
    () => {
      const occupiedLocations = new Set(
        activeItems
          .filter((item) => item.currentLocation?.type === "cupboard")
          .map((item) => item.currentLocation.label)
          .filter(Boolean),
      );

      return cupboardOptions.filter(
        (option) =>
          option !== "Main Cupboard" && !occupiedLocations.has(option),
      );
    },
    [activeItems, cupboardOptions],
  );

  useEffect(() => {
    if (
      removableStorageOptions.length > 0 &&
      !removableStorageOptions.includes(removeStorageLocation)
    ) {
      setRemoveStorageLocation(removableStorageOptions[0]);
      return;
    }

    if (removableStorageOptions.length === 0 && removeStorageLocation) {
      setRemoveStorageLocation("");
    }
  }, [removableStorageOptions, removeStorageLocation]);

  const filteredInventoryItems = useMemo(() => {
    const normalizedFilter = inventoryFilter.trim().toLowerCase();
    const rows = activeItems.filter((item) => {
      if (!normalizedFilter) {
        return true;
      }

      const memberName = getEquipmentMemberLabel(item);
      const loanDate = getEquipmentLoanDateLabel(item);
      const lastAssignedBy = item.lastAssignedBy || "";
      const details = item.detailSummary || "";

      return [
        item.typeLabel,
        getEquipmentReferenceLabel(item),
        details,
        getEquipmentLocationLabel(item),
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
            return getEquipmentLocationLabel(item);
          case "member":
            return getEquipmentMemberLabel(item);
          case "loanDate":
            return item.currentLoan?.loanedAt || item.lastAssignedAt || "";
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
  }, [activeItems, inventoryFilter, inventorySort]);

  const toggleInventorySort = (column) => {
    setInventorySort((current) => ({
      column,
      direction:
        current.column === column && current.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const updateInventorySortColumn = (column) => {
    setInventorySort((current) => ({
      ...current,
      column,
    }));
  };

  const updateInventorySortDirection = (direction) => {
    setInventorySort((current) => ({
      ...current,
      direction,
    }));
  };

  const refreshDashboard = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["equipment-dashboard", actorUsername],
    });
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

  const correctEquipmentMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.correctEquipmentItemUseCase.execute({
        actorUsername,
        itemId: editingItemId,
        payload: editForm,
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Equipment details corrected successfully.");
      setEditingItemId("");
      setEditForm(EMPTY_ADD_FORM);
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

  const addStorageLocationMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.addEquipmentStorageLocationUseCase.execute({
        actorUsername,
        locationLabel: newStorageLocation,
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Storage location added successfully.");
      setNewStorageLocation("");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const removeStorageLocationMutation = useMutation({
    mutationFn: () =>
      equipmentCrud.removeEquipmentStorageLocationUseCase.execute({
        actorUsername,
        locationLabel: removeStorageLocation,
      }),
    onMutate: () => {
      setError("");
      setMessage("");
    },
    onSuccess: async () => {
      setMessage("Storage location removed successfully.");
      await refreshDashboard();
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  const updateAddFormField = (field) => (eventOrValue) => {
    const nextValue =
      typeof eventOrValue === "string"
        ? eventOrValue
        : eventOrValue.target.value;

    setAddForm((current) =>
      field === "equipmentType"
        ? {
            ...EMPTY_ADD_FORM,
            equipmentType: nextValue,
          }
        : {
            ...current,
            [field]: nextValue,
          },
    );
  };

  const updateEditFormField = (field) => (eventOrValue) => {
    const nextValue =
      typeof eventOrValue === "string"
        ? eventOrValue
        : eventOrValue.target.value;

    setEditForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  };

  const handleAddEquipmentSubmit = (event) => {
    event.preventDefault();
    void addEquipmentMutation.mutateAsync();
  };

  const openEquipmentCorrectionModal = () => {
    if (!selectedItem) {
      return;
    }

    setEditingItemId(String(selectedItem.id));
    setEditForm(buildEquipmentFormFromItem(selectedItem));
  };

  const closeEquipmentCorrectionModal = () => {
    if (correctEquipmentMutation.isPending) {
      return;
    }

    setEditingItemId("");
    setEditForm(EMPTY_ADD_FORM);
  };

  const handleCorrectEquipmentSubmit = (event) => {
    event.preventDefault();
    void correctEquipmentMutation.mutateAsync();
  };

  const handleAssignEquipment = () => {
    void assignMutation.mutateAsync();
  };

  const handleReturnEquipment = () => {
    void returnMutation.mutateAsync();
  };

  const handleUpdateStorage = () => {
    void storageMutation.mutateAsync();
  };

  const handleAddStorageLocation = () => {
    void addStorageLocationMutation.mutateAsync();
  };

  const handleRemoveStorageLocation = () => {
    const confirmed = window.confirm(
      `Remove storage location '${removeStorageLocation}'?`,
    );

    if (!confirmed) {
      return;
    }

    void removeStorageLocationMutation.mutateAsync();
  };

  const handleDecommissionEquipment = () => {
    void decommissionMutation.mutateAsync();
  };

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

  const closeCaseAssignmentModal = () => {
    if (!isSavingCaseAssignments) {
      setActiveCaseModalId("");
    }
  };

  const updateCaseAssignmentSelection = (fieldKey) => (event) => {
    setCaseAssignmentSelections((current) => ({
      ...current,
      [fieldKey]: event.target.value,
    }));
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
      const existingCaseItemIds = activeCaseModal.contents.map((item) =>
        String(item.id),
      );
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

  const selectedItemSummary = selectedItem
    ? `${getEquipmentTypeDisplayLabel(selectedItem)} | ${getEquipmentReferenceLabel(selectedItem)} | ${selectedItem.status} | ${getEquipmentLocationLabel(selectedItem)}`
    : "";
  const editingItem = useMemo(
    () => activeItems.find((item) => String(item.id) === editingItemId) ?? null,
    [activeItems, editingItemId],
  );

  return {
    activeCaseModal,
    addEquipmentMutation,
    addForm,
    addStorageLocationMutation,
    assignMutation,
    assignTargetType,
    cases,
    caseAssignmentSelections,
    closeCaseAssignmentModal,
    closeEquipmentCorrectionModal,
    correctEquipmentMutation,
    cupboardLabel,
    cupboardOptions,
    currentUserProfile,
    decommissionMutation,
    decommissionReason,
    equipmentQuery,
    equipmentTypeOptions,
    editForm,
    editingItem,
    error,
    filteredInventoryItems,
    getCaseAssignmentOptions,
    handleAddEquipmentSubmit,
    handleAddStorageLocation,
    handleAssignEquipment,
    handleCorrectEquipmentSubmit,
    handleDecommissionEquipment,
    handleRemoveStorageLocation,
    handleReturnEquipment,
    handleSaveCaseAssignments,
    handleUpdateStorage,
    inventoryFilter,
    inventorySort,
    isSavingCaseAssignments,
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
    sizeCategoryOptions,
    storageItems,
    storageMutation,
    targetCaseId,
    targetMemberUsername,
    toggleInventorySort,
    updateAddFormField,
    updateEditFormField,
    updateCaseAssignmentSelection,
    updateInventorySortColumn,
    updateInventorySortDirection,
    canAccessEquipment,
  };
}
