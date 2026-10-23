import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTENDANCE_MAX_RANGE_DAYS,
  DASHBOARD_PERIODS,
  DEFAULT_DASHBOARD_PERIOD,
  DEFAULT_MEMBER_RANGE_ATTENDANCE_DAYS,
  getAttendanceRangeDateBounds,
  MEMBER_RANGE_ATTENDANCE_PERIOD_DAYS,
} from "./attendancePolicy.js";
import { resolveDashboardPeriod } from "../server/domain/services/loginMethodReport.js";

test("attendance range and lookback choices share one policy", () => {
  assert.equal(ATTENDANCE_MAX_RANGE_DAYS, 366);
  assert.deepEqual(MEMBER_RANGE_ATTENDANCE_PERIOD_DAYS, [30, 60, 90, 180, 365]);
  assert.ok(MEMBER_RANGE_ATTENDANCE_PERIOD_DAYS.includes(DEFAULT_MEMBER_RANGE_ATTENDANCE_DAYS));
});

test("date picker bounds allow exactly 366 inclusive UTC days across a leap day", () => {
  assert.deepEqual(
    getAttendanceRangeDateBounds("2024-03-01", "2024-03-01", "2024-03-01"),
    { minStartDate: "2023-03-02", maxEndDate: "2024-03-01" },
  );
  assert.equal(
    getAttendanceRangeDateBounds("2024-02-29", "2024-02-29", "2025-12-31").maxEndDate,
    "2025-02-28",
  );
  assert.deepEqual(
    getAttendanceRangeDateBounds("", "", "2024-03-01"),
    { minStartDate: "", maxEndDate: "2024-03-01" },
  );
});

test("every dashboard choice is accepted by backend period validation", () => {
  const now = new Date("2024-03-01T12:00:00Z");
  assert.equal(resolveDashboardPeriod(undefined, now).key, DEFAULT_DASHBOARD_PERIOD);
  for (const option of DASHBOARD_PERIODS) {
    const period = resolveDashboardPeriod(option.value, now);
    assert.equal(period.key, option.value);
    assert.equal(period.endDate, "2024-03-01");
    if (option.days) {
      const expected = new Date(Date.UTC(2024, 2, 1 - option.days + 1)).toISOString().slice(0, 10);
      assert.equal(period.startDate, expected);
    }
  }
  assert.throws(() => resolveDashboardPeriod("invalid", now), /Choose Last 7 days/);
});
