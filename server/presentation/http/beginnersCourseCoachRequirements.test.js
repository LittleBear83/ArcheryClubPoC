import assert from "node:assert/strict";
import test from "node:test";
import { buildCourseLessonCoachRequirements, DEFAULT_BEGINNERS_COACHES_PER_LESSON } from "./beginnersCourseCoachRequirements.js";

test("server applies the Beginners default to every lesson and honors lesson overrides", () => {
  assert.equal(DEFAULT_BEGINNERS_COACHES_PER_LESSON, 5);
  assert.deepEqual(buildCourseLessonCoachRequirements({ courseType: "beginners", lessonCount: 6, payload: {} }), {
    success: true, requiredCoachesDefault: 5, lessonCoachRequirements: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5 },
  });
  assert.deepEqual(buildCourseLessonCoachRequirements({ courseType: "beginners", lessonCount: 4, payload: { requiredCoachesDefault: 3, lessonCoachRequirements: { 2: 4, 4: 1 } } }), {
    success: true, requiredCoachesDefault: 3, lessonCoachRequirements: { 1: 3, 2: 4, 3: 3, 4: 1 },
  });
});

test("server validation rejects nonpositive, fractional, out-of-range, and malformed values", () => {
  for (const payload of [
    { requiredCoachesDefault: 0 },
    { requiredCoachesDefault: 2.5 },
    { requiredCoachesDefault: 2147483648 },
    { lessonCoachRequirements: { 7: 3 } },
    { lessonCoachRequirements: { 1: 1.5 } },
    { lessonCoachRequirements: [] },
  ]) {
    assert.equal(buildCourseLessonCoachRequirements({ courseType: "beginners", lessonCount: 6, payload }).success, false);
  }
});

test("Taster sessions default to five coaches and accept lesson requirements", () => {
  assert.deepEqual(buildCourseLessonCoachRequirements({ courseType: "taster-session", lessonCount: 2, payload: {} }), {
    success: true, requiredCoachesDefault: 5, lessonCoachRequirements: { 1: 5, 2: 5 },
  });
  assert.deepEqual(buildCourseLessonCoachRequirements({ courseType: "taster-session", lessonCount: 2, payload: { requiredCoachesDefault: 2, lessonCoachRequirements: { 2: 3 } } }), {
    success: true, requiredCoachesDefault: 2, lessonCoachRequirements: { 1: 2, 2: 3 },
  });
  assert.equal(buildCourseLessonCoachRequirements({ courseType: "taster-session", lessonCount: 2, payload: { lessonCoachRequirements: { 3: 2 } } }).success, false);
});

test("Have-a-Go sessions keep one coach by default", () => {
  assert.deepEqual(buildCourseLessonCoachRequirements({ courseType: "have-a-go", lessonCount: 2, payload: { requiredCoachesDefault: 5, lessonCoachRequirements: { 1: 8 } } }), {
    success: true, requiredCoachesDefault: 1, lessonCoachRequirements: { 1: 1, 2: 1 },
  });
});
