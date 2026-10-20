import assert from "node:assert/strict";
import test from "node:test";
import { getSelectedRangeLengthInDays, shiftUtcDateString } from "./rangeUsageUtils.ts";

test("custom range limits allow 366 inclusive UTC days, including leap dates", () => {
  const start = shiftUtcDateString("2024-03-01", -365);
  assert.equal(start, "2023-03-02");
  assert.equal(getSelectedRangeLengthInDays({ startDate: start, endDate: "2024-03-01" }), 366);
  assert.equal(shiftUtcDateString("2024-03-01", -1), "2024-02-29");
});
