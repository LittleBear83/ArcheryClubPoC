import assert from "node:assert/strict";
import test from "node:test";
import {
  compareArrowReferences,
  getArrowDescription,
  getArrowDisplayLabel,
  getArrowReference,
  getArrowSearchText,
} from "./equipmentArrowDisplay.js";

const marked = {
  id: 41,
  number: "legacy-ref",
  arrowQuantity: 6,
  arrowLength: 28,
  details: {
    arrowIdentifier: "A10",
    arrowMaterial: "carbon",
    arrowColour: "Blue",
    fletchingColour1: "Red",
    fletchingColour2: "White",
    nockColour: "Black",
    spine: "600",
  },
};

test("marked arrow reference and description preserve physical attributes and stored number", () => {
  assert.equal(getArrowReference(marked), "A10");
  assert.equal(getArrowDescription(marked), '6 arrows · 28" | carbon | Blue | Fletch Red/White | Nock Black | Spine 600');
  assert.equal(getArrowDisplayLabel(marked), 'Arrows A10 · 6 arrows · 28" | carbon | Blue | Fletch Red/White | Nock Black | Spine 600');
  assert.equal(marked.number, "legacy-ref");
  for (const term of ["A10", "legacy-ref", "6 arrows", '28"', "carbon", "Blue", "Red", "White", "Black", "600"]) {
    assert.ok(getArrowSearchText(marked).includes(term), term);
  }
});

test("unmarked sets show distinct persistent IDs and remain searchable", () => {
  const first = { ...marked, id: 42, details: { arrowIdentifier: " " } };
  const second = { ...first, id: 43 };
  assert.equal(getArrowReference(first), "Unmarked");
  assert.equal(getArrowDescription(first), '6 arrows · 28" | ID 42');
  assert.match(getArrowSearchText(first), /Unmarked.*ID 42/);
  assert.notEqual(getArrowDisplayLabel(first), getArrowDisplayLabel(second));
});

test("arrow references sort naturally by marking, with a stable ID tie break", () => {
  const items = ["A10", "A2", "A1"].map((arrowIdentifier, index) => ({ id: index + 1, details: { arrowIdentifier } }));
  assert.deepEqual(items.sort(compareArrowReferences).map(getArrowReference), ["A1", "A2", "A10"]);
  const unmarked = [{ id: 12, details: {} }, { id: 3, details: {} }];
  assert.deepEqual(unmarked.sort(compareArrowReferences).map((item) => item.id), [3, 12]);
});
