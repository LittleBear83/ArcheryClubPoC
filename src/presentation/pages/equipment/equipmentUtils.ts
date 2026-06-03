import { formatShortDateTime } from "../../../utils/dateTime";

export function describeCaseContentLocation(item, caseItem) {
  if (item.currentLocation?.caseId === caseItem.id) {
    return `In ${caseItem.label}`;
  }

  return item.currentLocation?.label || "";
}

export function getEquipmentLocationLabel(item) {
  if (item.status === "decommissioned") {
    return "Decommissioned";
  }

  if (item.currentLocation?.type === "member") {
    return "On loan";
  }

  return item.currentLocation?.label || "";
}

export function getEquipmentMemberLabel(item) {
  return item.currentLoan?.memberName || (
    item.currentLocation?.type === "member" ? item.currentLocation.label : ""
  );
}

export function getEquipmentLoanDateLabel(item) {
  return formatShortDateTime(
    item.currentLoan?.loanedAt ||
      (item.currentLocation?.type === "member" ? item.lastAssignedAt : ""),
  );
}

export function getEquipmentReferenceLabel(item) {
  return item.type === "arrows"
    ? `${item.arrowQuantity} x ${item.arrowLength}"`
    : item.number || "-";
}

export const EMPTY_ADD_FORM = {
  equipmentType: "case",
  sizeCategory: "standard",
  itemNumber: "",
  arrowLength: "20",
  arrowQuantity: "6",
};

export const CASE_ASSIGNMENT_FIELDS = [
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

export const INVENTORY_SORT_OPTIONS = [
  { value: "type", label: "Type" },
  { value: "reference", label: "Reference Number" },
  { value: "location", label: "Location" },
  { value: "member", label: "Member" },
  { value: "loanDate", label: "Loan Date" },
  { value: "lastAssignedBy", label: "Last Assigned By" },
];
