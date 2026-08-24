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

  if (item.currentReservation) {
    return "Reserved at range";
  }

  return item.currentLocation?.label || "";
}

export function getEquipmentMemberLabel(item) {
  return item.currentLoan?.memberName ||
    item.currentReservation?.participantName ||
    (
      item.currentLocation?.type === "member" ? item.currentLocation.label : ""
    );
}

export function getEquipmentLoanDateLabel(item) {
  return formatShortDateTime(
    item.currentLoan?.loanedAt ||
      (item.currentReservation ? item.lastAssignedAt : "") ||
      (item.currentLocation?.type === "member" ? item.lastAssignedAt : ""),
  );
}

export function getEquipmentReferenceLabel(item) {
  if (item.type === "arrows") {
    return `${item.arrowQuantity} x ${item.arrowLength}"`;
  }

  if (item.number && item.detailSummary) {
    return `${item.number} | ${item.detailSummary}`;
  }

  return item.number || item.detailSummary || "-";
}

export function getEquipmentDetailsLabel(item) {
  return item.detailSummary || "-";
}

export function getEquipmentTypeDisplayLabel(item) {
  switch (item.type) {
    case "case":
      return item.sizeCategory === "junior" ? "Compound Case" : "Recurve Case";
    case "quiver":
      return item.sizeCategory === "junior" ? "Junior Quiver" : "Adult Quiver";
    case "long_rod":
      return item.sizeCategory === "junior" ? "Long Rod" : "Short Rod";
    case "sight":
      return item.sizeCategory === "junior" ? "Junior Sight" : "Standard Sight";
    default:
      return item.typeLabel;
  }
}

export const EMPTY_ADD_FORM = {
  equipmentType: "case",
  sizeCategory: "standard",
  itemNumber: "",
  arrowLength: "20",
  arrowQuantity: "6",
  arrowMaterial: "",
  arrowColour: "",
  arrowIdentifier: "",
  makeModel: "",
  equipmentLength: "",
  handedness: "",
  colour: "",
  poundage: "",
  ageGroup: "",
  fitSize: "",
  fletchingColour1: "",
  fletchingColour2: "",
  fletchingColour3: "",
  nockColour: "",
  arrowSpine: "",
};

export function buildEquipmentFormFromItem(item) {
  const details = item?.details ?? {};

  return {
    ...EMPTY_ADD_FORM,
    equipmentType: item?.type ?? EMPTY_ADD_FORM.equipmentType,
    sizeCategory: item?.sizeCategory ?? EMPTY_ADD_FORM.sizeCategory,
    itemNumber: item?.number ?? "",
    arrowLength:
      item?.arrowLength != null
        ? String(item.arrowLength)
        : EMPTY_ADD_FORM.arrowLength,
    arrowQuantity:
      item?.arrowQuantity != null
        ? String(item.arrowQuantity)
        : EMPTY_ADD_FORM.arrowQuantity,
    arrowMaterial: details.arrowMaterial ?? "",
    arrowColour: details.arrowColour ?? "",
    arrowIdentifier: details.arrowIdentifier ?? "",
    makeModel: details.makeModel ?? "",
    equipmentLength: details.length ?? "",
    handedness: details.handedness ?? "",
    colour: details.colour ?? "",
    poundage: details.poundage != null ? String(details.poundage) : "",
    ageGroup: details.ageGroup ?? "",
    fitSize: details.fitSize ?? "",
    fletchingColour1: details.fletchingColour1 ?? "",
    fletchingColour2: details.fletchingColour2 ?? "",
    fletchingColour3: details.fletchingColour3 ?? "",
    nockColour: details.nockColour ?? "",
    arrowSpine: details.spine ?? "",
  };
}

export const EQUIPMENT_HANDEDNESS_OPTIONS = [
  { value: "", label: "Not recorded" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export const EQUIPMENT_EXTENDED_HANDEDNESS_OPTIONS = [
  ...EQUIPMENT_HANDEDNESS_OPTIONS,
  { value: "ambidextrous", label: "Ambidextrous" },
];

export function shouldShowEquipmentSizeField(equipmentType) {
  return ![
    "riser",
    "limb",
    "arm_guard",
    "finger_tab",
    "chest_guard",
    "arrows",
  ].includes(equipmentType);
}

export function getEquipmentSizeFieldLabel(equipmentType) {
  switch (equipmentType) {
    case "case":
      return "Case style";
    case "quiver":
      return "Quiver group";
    case "long_rod":
      return "Rod length";
    default:
      return "Size";
  }
}

export function getEquipmentSizeOptions(equipmentType) {
  switch (equipmentType) {
    case "case":
      return [
        { value: "standard", label: "Recurve" },
        { value: "junior", label: "Compound" },
      ];
    case "quiver":
      return [
        { value: "standard", label: "Adult" },
        { value: "junior", label: "Junior" },
      ];
    case "long_rod":
      return [
        { value: "standard", label: "Short" },
        { value: "junior", label: "Long" },
      ];
    default:
      return [
        { value: "standard", label: "Standard" },
        { value: "junior", label: "Junior" },
      ];
  }
}

export function getEquipmentNumberFieldLabel(equipmentType) {
  switch (equipmentType) {
    case "case":
      return "Case number";
    case "riser":
      return "Riser number";
    case "limb":
      return "Limb set number";
    case "quiver":
      return "Quiver number";
    case "sight":
      return "Sight number";
    case "long_rod":
      return "Long rod number";
    case "arm_guard":
      return "Arm guard number";
    case "chest_guard":
      return "Chest guard number";
    case "finger_tab":
      return "Finger tab number";
    default:
      return "Equipment number";
  }
}

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
