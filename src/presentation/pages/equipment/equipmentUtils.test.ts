import assert from "node:assert/strict";
import test from "node:test";
import {
  getEquipmentDetailsLabel,
  getEquipmentReferenceLabel,
  getEquipmentRegisterReference,
  getEquipmentSearchText,
} from "./equipmentUtils";

test("register, case contents, and mobile use the same arrow reference and description", () => {
  const item = {
    id: 7,
    type: "arrows",
    number: "stored-number",
    arrowQuantity: 6,
    arrowLength: 28,
    details: { arrowIdentifier: "A2", arrowMaterial: "carbon" },
    detailSummary: "stale server value",
  };
  assert.equal(getEquipmentRegisterReference(item), "A2");
  assert.equal(getEquipmentReferenceLabel(item), "A2");
  assert.equal(getEquipmentDetailsLabel(item), '6 arrows · 28" | carbon');
  assert.match(getEquipmentSearchText(item), /stored-number/);
});

test("other equipment retains its current labels", () => {
  const item = { type: "riser", number: "R1", detailSummary: "25\" | left-handed" };
  assert.equal(getEquipmentRegisterReference(item), "R1");
  assert.equal(getEquipmentReferenceLabel(item), 'R1 | 25" | left-handed');
  assert.equal(getEquipmentDetailsLabel(item), '25" | left-handed');
});
