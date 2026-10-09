import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canAccessCoachingHub, csvCell, isCoachingOpportunityEligible, scheduledHours, sessionEnd, splitAssignments, type CoachAssignment, type CoachingOpportunity } from "./coachingHubModel.ts";
import { CoachingParticipantsList } from "./CoachingParticipantsList";

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
test("next session is the nearest current or future assignment and is excluded from upcoming", () => {
  const now = new Date("2026-10-07T12:00:00").getTime();
  const clock = (value: number) => {
    const date = new Date(value);
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    };
  };
  const currentStart = clock(now - 30 * 60000);
  const currentEnd = clock(now + 30 * 60000);
  const sessions: CoachAssignment[] = [
    { ...lesson, id: "past", date: "2026-10-06", startTime: "10:00", endTime: "11:00" },
    { ...lesson, id: "current", date: currentStart.date, startTime: currentStart.time, endTime: currentEnd.time },
    { ...lesson, id: "next", date: "2026-10-13", startTime: "18:00", endTime: "20:00" },
    { ...lesson, id: "later", date: "2026-10-20", startTime: "18:00", endTime: "20:00" },
  ];
  const result = splitAssignments(sessions, now);
  assert.equal(result.next?.id, "current");
  assert.deepEqual(result.upcoming.map((session) => session.id), ["next", "later"]);
  assert.deepEqual(result.past.map((session) => session.id), ["past"]);
  assert.deepEqual(splitAssignments([], now), { next: null, upcoming: [], past: [] });
});
test("coaches-wanted eligibility requires future coverage and excludes own assignments", () => {
  const opportunity: CoachingOpportunity = {
    lessonId: 12, courseId: 4, courseType: "beginners", lessonNumber: 1,
    date: "2026-10-13", startTime: "18:00", endTime: "20:00", coordinatorName: "Coordinator",
    participantCount: 5, coachNames: ["Another coach"], requiredCoachCount: 2,
  };
  const now = new Date("2026-10-07T12:00:00").getTime();
  assert.equal(isCoachingOpportunityEligible(opportunity, now, new Set()), true);
  assert.equal(isCoachingOpportunityEligible(opportunity, now, new Set(["12"])), false);
  assert.equal(isCoachingOpportunityEligible({ ...opportunity, coachNames: ["A", "B"] }, now, new Set()), false);
  assert.equal(isCoachingOpportunityEligible({ ...opportunity, date: "2026-10-06" }, now, new Set()), false);
});
test("session participant list renders member type, equipment details and no-show status", () => {
  const markup = renderToStaticMarkup(createElement(CoachingParticipantsList, { participants: [{
    id: 1, firstName: "Robin", surname: "Hood", sizeCategory: "junior", handedness: "left",
    eyeDominance: "right", drawLength: "24 in", noShowRecorded: true,
  }] }));
  for (const text of ["Robin Hood", "Junior", "left", "right", "24 in", "No-show recorded"]) assert.ok(markup.includes(text), text);
  assert.doesNotMatch(markup, /Mark attended|Remove manual record/);
  assert.equal((markup.match(/<dt>/g) ?? []).length, 5);
  assert.match(renderToStaticMarkup(createElement(CoachingParticipantsList, { participants: [] })), /No participants are enrolled/);
});
test("CSV quotes values and neutralises spreadsheet formulas", () => {
  assert.equal(csvCell('A, "B"'), '"A, ""B"""');
  assert.equal(csvCell("=SUM(A1:A2)"), '"\'=SUM(A1:A2)"');
  assert.equal(csvCell(2), '"2"');
});
