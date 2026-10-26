import assert from "node:assert/strict";
import test from "node:test";
import type { RangeVisitReport } from "../../../api/reportingApi";
import { buildVisitInsights } from "./reportingInsights";
import { ukReportTime } from "./reportingTime";

test("UK reporting time follows BST and GMT transitions", () => {
  assert.deepEqual(ukReportTime("2026-03-29", "00:30:00"), { date: "2026-03-29", time: "00:30:00", hour: 0, zone: "GMT" });
  assert.deepEqual(ukReportTime("2026-03-29", "01:30:00"), { date: "2026-03-29", time: "02:30:00", hour: 2, zone: "BST" });
  assert.deepEqual(ukReportTime("2026-10-25", "00:30:00"), { date: "2026-10-25", time: "01:30:00", hour: 1, zone: "BST" });
  assert.deepEqual(ukReportTime("2026-10-25", "01:30:00"), { date: "2026-10-25", time: "01:30:00", hour: 1, zone: "GMT" });
  assert.deepEqual(ukReportTime("2026-08-12", "23:30:00"), { date: "2026-08-13", time: "00:30:00", hour: 0, zone: "BST" });
});

test("visit hours use UK local time across the autumn clock change", () => {
  const rows: RangeVisitReport["rows"] = [
    { id: "bst", date: "2026-10-25", time: "00:30:00", name: "", username: "a", loginMethod: "rfid" },
    { id: "gmt", date: "2026-10-25", time: "01:30:00", name: "", username: "b", loginMethod: "rfid" },
  ];
  const insights = buildVisitInsights({ startDate: "2026-10-25", endDate: "2026-10-25", total: 2, rows });
  assert.equal(insights.hours[1].members, 2);
});
