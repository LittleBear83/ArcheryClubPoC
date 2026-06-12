import {
  LOST_ARROW_ARROW_COLOUR_VALUE_SET,
  LOST_ARROW_ARROW_MATERIAL_OPTION_SET,
  LOST_ARROW_FLETCHING_COLOUR_VALUE_SET,
  LOST_ARROW_NOCK_COLOUR_VALUE_SET,
  LOST_ARROW_TARGET_DISTANCE_OPTION_SET,
} from "./lostArrowOptions.js";

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function isValidLaneNumber(value) {
  const laneNumber = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(laneNumber) && laneNumber >= 1 && laneNumber <= 11;
}

export function getLostArrowFieldValidationErrors(draft) {
  const missingFields = [];

  if (!hasText(draft?.archerUsername)) {
    missingFields.push("Name of Archer");
  }

  if (!hasText(draft?.dateLost) || !isIsoDate(draft?.dateLost)) {
    missingFields.push("Date Lost");
  }

  if (
    !hasText(draft?.arrowMaterial) ||
    !LOST_ARROW_ARROW_MATERIAL_OPTION_SET.has(String(draft.arrowMaterial).toLowerCase())
  ) {
    missingFields.push("Arrow Material");
  }

  if (
    !hasText(draft?.arrowColour) ||
    !LOST_ARROW_ARROW_COLOUR_VALUE_SET.has(draft.arrowColour)
  ) {
    missingFields.push("Arrow Colour");
  }

  if (
    !hasText(draft?.fletchingColour1) ||
    !LOST_ARROW_FLETCHING_COLOUR_VALUE_SET.has(draft.fletchingColour1)
  ) {
    missingFields.push("Fletching Colour 1");
  }

  if (
    !hasText(draft?.fletchingColour2) ||
    !LOST_ARROW_FLETCHING_COLOUR_VALUE_SET.has(draft.fletchingColour2)
  ) {
    missingFields.push("Fletching Colour 2");
  }

  if (
    hasText(draft?.fletchingColour3) &&
    !LOST_ARROW_FLETCHING_COLOUR_VALUE_SET.has(draft.fletchingColour3)
  ) {
    missingFields.push("Fletching Colour 3");
  }

  if (
    !hasText(draft?.nockColour) ||
    !LOST_ARROW_NOCK_COLOUR_VALUE_SET.has(draft.nockColour)
  ) {
    missingFields.push("Nock Colour");
  }

  if (
    !hasText(draft?.targetDistance) ||
    !LOST_ARROW_TARGET_DISTANCE_OPTION_SET.has(draft.targetDistance)
  ) {
    missingFields.push("Target Distance");
  }

  if (!isValidLaneNumber(draft?.laneNumber)) {
    missingFields.push("Lane Number");
  }

  return missingFields;
}
