import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLessonCoachRequirements,
  DEFAULT_BEGINNERS_COACHES_PER_LESSON,
  resizeLessonCoachRequirementOverrides,
  setLessonCoachRequirementOverride,
} from "./courseCoachRequirements.ts";

test("Beginners course coach requirement defaults to five and fills each lesson", () => {
  assert.equal(DEFAULT_BEGINNERS_COACHES_PER_LESSON, 5);
  assert.deepEqual(buildLessonCoachRequirements(6, "5", {}), { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5 });
});

test("course default and independent per-lesson overrides build the requested values", () => {
  let overrides = setLessonCoachRequirementOverride({}, 2, "4", "3");
  overrides = setLessonCoachRequirementOverride(overrides, 5, "2", "3");
  assert.deepEqual(buildLessonCoachRequirements(6, "3", overrides), { 1: 3, 2: 4, 3: 3, 4: 3, 5: 2, 6: 3 });
});

test("lesson count changes retain overrides, inherit the current default, and prune removed lessons", () => {
  const overrides = { 2: "4", 6: "2" };
  const increased = resizeLessonCoachRequirementOverrides(overrides, 8);
  assert.deepEqual(increased, overrides);
  assert.equal(buildLessonCoachRequirements(8, "5", increased)?.[7], 5);
  assert.equal(buildLessonCoachRequirements(8, "5", increased)?.[8], 5);
  assert.deepEqual(resizeLessonCoachRequirementOverrides(increased, 4), { 2: "4" });
});

test("changing the course default retains explicit overrides and validates whole positive values", () => {
  const overrides = { 3: "4" };
  assert.deepEqual(buildLessonCoachRequirements(4, "2", overrides), { 1: 2, 2: 2, 3: 4, 4: 2 });
  assert.equal(buildLessonCoachRequirements(2, "0", {}), null);
  assert.equal(buildLessonCoachRequirements(2, "2.5", {}), null);
  assert.equal(buildLessonCoachRequirements(2, "2147483648", {}), null);
  assert.equal(buildLessonCoachRequirements(2, "5", { 2: "" }), null);
  assert.deepEqual(setLessonCoachRequirementOverride(overrides, 3, "2", "2"), {});
});
