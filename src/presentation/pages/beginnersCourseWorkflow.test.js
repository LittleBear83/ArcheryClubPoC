import assert from "node:assert/strict";
import test from "node:test";
import { getSuggestedBeginnerCaseReturnDate, validateBeginnerConversionReturnDate } from "./beginnersCourseWorkflow.js";

const today = "2026-09-30";

test("an assigned case requires a real expected return date today or later", () => {
  for (const date of [undefined, "", "2026-02-30", "tomorrow", "2026-09-29"]) {
    assert.ok(validateBeginnerConversionReturnDate(24, date, today));
  }
  assert.equal(validateBeginnerConversionReturnDate(24, today, today), null);
  assert.equal(validateBeginnerConversionReturnDate(24, "2026-10-14", today), null);
});

test("conversion without an assigned case does not require a date", () => {
  assert.equal(validateBeginnerConversionReturnDate(null, undefined, today), null);
});

test("a server-reported case assignment makes the retry require a date", () => {
  assert.ok(validateBeginnerConversionReturnDate(true, undefined, today));
  assert.equal(validateBeginnerConversionReturnDate(true, "2026-10-14", today), null);
});

test("case return suggestion is three calendar months after the final active lesson", () => {
  const course = { lessons: [
    { date: "2026-01-10", isCancelled: false },
    { date: "2026-01-31", isCancelled: false },
    { date: "2026-02-07", isCancelled: true },
  ] };
  assert.equal(getSuggestedBeginnerCaseReturnDate(course, "2026-02-01"), "2026-04-30");
  assert.equal(getSuggestedBeginnerCaseReturnDate({ lessons: [{ date: "2026-12-15" }] }, "2026-10-26"), "2027-03-15");
});

test("old or undated courses suggest today so the loan date remains valid", () => {
  assert.equal(getSuggestedBeginnerCaseReturnDate({ lessons: [{ date: "2025-01-31" }] }, "2026-10-26"), "2026-10-26");
  assert.equal(getSuggestedBeginnerCaseReturnDate({ lessons: [] }, "2026-10-26"), "2026-10-26");
});
