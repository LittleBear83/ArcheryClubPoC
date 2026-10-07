import test from "node:test";
import assert from "node:assert/strict";
import { canAccessCoachingHub, csvCell, scheduledHours, sessionEnd, type CoachAssignment } from "./coachingHubModel.ts";

const lesson: CoachAssignment = { id: 1, courseId: 2, lessonNumber: 3, date: "2026-10-13", startTime: "18:00", endTime: "20:00", coordinatorName: "Coordinator", beginnerCount: 6 };

test("coaching hub is limited to profiles marked as coaching volunteers", () => {
  assert.equal(canAccessCoachingHub(null), false);
  assert.equal(canAccessCoachingHub({ membership: { permissions: ["add_coaching_sessions"] } }), false);
  assert.equal(canAccessCoachingHub({ meta: { coachingVolunteer: false }, membership: { permissions: ["manage_beginners_courses"] } }), false);
  assert.equal(canAccessCoachingHub({ meta: { coachingVolunteer: true } }), true);
});
test("scheduled hours reject malformed and negative durations", () => {
  assert.equal(scheduledHours(lesson), 2);
  assert.equal(scheduledHours({ ...lesson, endTime: "17:00" }), 0);
  assert.equal(scheduledHours({ ...lesson, date: "invalid" }), 0);
  assert.equal(sessionEnd(lesson), new Date("2026-10-13T20:00").getTime());
});
test("CSV quotes values and neutralises spreadsheet formulas", () => {
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
  assert.equal(csvCell("=SUM(A1:A2)"), '"\'=SUM(A1:A2)"');
  assert.equal(csvCell(2), '"2"');
});
