import assert from "node:assert/strict";
import test from "node:test";
import { countActiveApprovedCourses } from "./committeeApprovedCoursesUtils.ts";

test("counts only active approved courses", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  const count = countActiveApprovedCourses(
    [
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-07-29", endTime: "12:00" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-07-30", endTime: "12:30" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: false,
        lessons: [{ date: "2026-07-28", endTime: "11:30" }],
      },
      {
        approvalStatus: "approved",
        isCancelled: true,
        lessons: [{ date: "2026-07-29", endTime: "12:00" }],
      },
      {
        approvalStatus: "pending",
        isCancelled: false,
        lessons: [{ date: "2026-07-29", endTime: "12:00" }],
      },
    ],
    now,
  );

  assert.equal(count, 2);
});
