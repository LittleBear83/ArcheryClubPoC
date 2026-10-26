import assert from "node:assert/strict";
import test from "node:test";
import { getRangeVisitPeriod } from "./rangeVisitPeriods";

test("range visit presets use inclusive UTC dates", () => {
  const now = new Date("2026-03-01T00:30:00Z");
  assert.deepEqual(getRangeVisitPeriod("current-month", now), { startDate: "2026-03-01", endDate: "2026-03-01" });
  assert.deepEqual(getRangeVisitPeriod("last-30-days", now), { startDate: "2026-01-31", endDate: "2026-03-01" });
  assert.deepEqual(getRangeVisitPeriod("last-90-days", now), { startDate: "2025-12-02", endDate: "2026-03-01" });
  assert.deepEqual(getRangeVisitPeriod("year-to-date", now), { startDate: "2026-01-01", endDate: "2026-03-01" });
  assert.deepEqual(getRangeVisitPeriod("current-year", now), { startDate: "2026-01-01", endDate: "2026-12-31" });
});
