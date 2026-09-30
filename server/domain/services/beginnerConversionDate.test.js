import assert from "node:assert/strict";
import test from "node:test";
import { validateBeginnerConversionDate } from "./beginnerConversionDate.js";

test("server requires a valid current or future UTC return date for assigned cases", () => {
  for (const date of [undefined, "", "2026-02-30", "tomorrow", "2026-09-29"]) {
    assert.match(validateBeginnerConversionDate(24, date, "2026-09-30"), /Expected return date is required/);
  }
  assert.equal(validateBeginnerConversionDate(24, "2026-09-30", "2026-09-30"), null);
  assert.equal(validateBeginnerConversionDate(24, "2026-10-30", "2026-09-30"), null);
});

test("server does not require a return date when no case is assigned", () => {
  assert.equal(validateBeginnerConversionDate(null, undefined, "2026-09-30"), null);
});
