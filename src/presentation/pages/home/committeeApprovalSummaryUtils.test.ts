import assert from "node:assert/strict";
import test from "node:test";
import { buildCommitteeApprovalSummary } from "./committeeApprovalSummaryUtils.ts";

test("builds approval summary counts across beginners, Have a Go, and Taster sessions", () => {
  const summary = buildCommitteeApprovalSummary({
    now: new Date("2026-08-12T12:00:00.000Z"),
    events: [
      { isPendingApproval: true },
      { isPendingApproval: false },
    ],
    sessions: [
      { isPendingApproval: true },
      { isPendingApproval: false },
    ],
    beginnersCourses: [
      {
        approvalStatus: "pending",
        isCancelled: false,
        lessons: [{ date: "2026-08-16", endTime: "12:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-08-18", endTime: "11:00" }],
      },
    ],
    haveAGoSessions: [
      {
        approvalStatus: "pending",
        isCancelled: false,
        lessons: [{ date: "2026-08-17", endTime: "13:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-08-19", endTime: "14:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: true,
        lessons: [{ date: "2026-08-20", endTime: "14:00" }],
      },
    ],
    tasterSessions: [
      {
        approvalStatus: "pending",
        isCancelled: false,
        lessons: [{ date: "2026-08-21", endTime: "10:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-08-22", endTime: "10:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-08-10", endTime: "10:00" }],
      },
    ],
  });

  assert.deepEqual(summary, {
    totalPendingCount: 5,
    calendarItemsCount: 2,
    beginnersCoursesCount: 1,
    haveAGoSessionsCount: 1,
    tasterSessionsCount: 1,
    approvedBeginnersCoursesCount: 1,
    approvedHaveAGoSessionsCount: 1,
    approvedTasterSessionsCount: 1,
  });
});
