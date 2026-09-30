import assert from "node:assert/strict";
import test from "node:test";
import { validateBeginnerConversionReturnDate } from "./beginnersCourseWorkflow.js";

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
