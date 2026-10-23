import assert from "node:assert/strict";
import test from "node:test";
import { getSelectedRangeLengthInDays } from "./rangeUsageUtils.ts";
import { getAttendanceRangeDateBounds } from "../../../../shared/attendancePolicy.js";

test("custom range limits allow 366 inclusive UTC days, including leap dates", () => {
  const start = getAttendanceRangeDateBounds("2024-03-01", "2024-03-01", "2024-03-01").minStartDate;
  assert.equal(start, "2023-03-02");
  assert.equal(getSelectedRangeLengthInDays({ startDate: start, endDate: "2024-03-01" }), 366);
});
