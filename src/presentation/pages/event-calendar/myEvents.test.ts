import assert from "node:assert/strict";
import test from "node:test";
import { createIcs, googleCalendarUrl } from "./calendarExport.ts";
import { getMyEvents } from "./myEvents.ts";
import type { BeginnersCourseCalendarLesson, CoachingSession } from "../../../types/app";

const portalUrl = "https://club.example/event-calendar";
const event = { id: 1, title: "Summer competition", type: "competition", venue: "indoor",
  date: "2026-07-01", startTime: "18:00", endTime: "20:00", isBookedOn: true,
  isApproved: true };
const coaching = { id: 2, topic: "Coaching", summary: "Practice", venue: "outdoor",
  date: "2026-07-01", startTime: "17:00", endTime: "19:00", isBookedOn: true,
  isApproved: true, coach: { username: "coach", fullName: "Coach" } } as CoachingSession;

const assignedLesson = { id: "beginners-course-4-lesson-9", lessonId: 9, courseId: 4,
  courseType: "beginners", title: "Beginners course", lessonNumber: 2,
  date: "2026-07-01", startTime: "16:00", endTime: "18:00",
  coordinatorName: "Coordinator", coachNames: ["Coach"], beginnerCount: 2,
  beginnerCapacity: 6, placesRemaining: 4 } as BeginnersCourseCalendarLesson;

test("combines booked events and coaching in start order without month or filter inputs", () => {
  const result = getMyEvents([event], [coaching], new Date("2026-06-30T23:00:00Z"), portalUrl);
  assert.deepEqual(result.map(({ item }) => [item.kind, item.title]),
    [["coaching", "Coaching"], ["event", "Summer competition"]]);
  assert.equal(result[0].start.toISOString(), "2026-07-01T16:00:00.000Z");
  assert.equal(result[1].start.toISOString(), "2026-07-01T17:00:00.000Z");
});

test("keeps a running booking until its London end time, then excludes it", () => {
  assert.equal(getMyEvents([event], [], new Date("2026-07-01T18:30:00Z"), portalUrl).length, 1);
  assert.equal(getMyEvents([event], [], new Date("2026-07-01T19:00:00Z"), portalUrl).length, 0);
  assert.equal(getMyEvents([event], [], new Date("2026-07-02T00:00:00Z"), portalUrl).length, 0);
});

test("excludes unbooked, withdrawn, rejected, cancelled and invalid activities", () => {
  const events = [event, { ...event, id: 3, isBookedOn: false },
    { ...event, id: 4, isRejected: true }, { ...event, id: 5, isCancelled: true },
    { ...event, id: 6, date: "invalid" }, { ...event, id: 7, type: "range-closed" },
    { ...event, id: 8, isPendingApproval: true }];
  const sessions = [coaching, { ...coaching, id: 9, isBookedOn: false },
    { ...coaching, id: 10, isRejected: true }, { ...coaching, id: 11, isCancelled: true }];
  assert.deepEqual(getMyEvents(events, sessions, new Date("2026-06-30T00:00:00Z"), portalUrl)
    .map(({ item }) => item.id), [2, 1]);
  assert.deepEqual(getMyEvents([], [], new Date(), portalUrl), []);
});

test("GMT and BST boundaries use the same export data as detail views", () => {
  const winter = { ...event, id: 12, date: "2026-12-01", startTime: "09:00", endTime: "10:00" };
  const items = getMyEvents([winter, event], [], new Date("2026-01-01T00:00:00Z"), portalUrl);
  assert.deepEqual(items.map(({ start }) => start.toISOString()),
    ["2026-07-01T17:00:00.000Z", "2026-12-01T09:00:00.000Z"]);
  for (const { item } of items) {
    assert.match(createIcs(item)!, /UID:event-/);
    assert.equal(new URL(googleCalendarUrl(item)!).searchParams.get("ctz"), "Europe/London");
  }
});

test("includes a named coach's session once even without a participant booking", () => {
  const coachOnly = { ...coaching, isBookedOn: false };
  const now = new Date("2026-06-30T00:00:00Z");
  assert.deepEqual(getMyEvents([], [coachOnly], now, portalUrl, { actorUsername: "coach" })
    .map(({ item }) => item.kind), ["coaching"]);
  assert.equal(getMyEvents([], [coachOnly], now, portalUrl, { actorUsername: "other" }).length, 0);
  assert.equal(getMyEvents([], [{ ...coaching, isBookedOn: true }], now, portalUrl, { actorUsername: "coach" }).length, 1);
});

test("includes actual assigned course lessons but excludes unassigned, cancelled and finished lessons", () => {
  const now = new Date("2026-06-30T00:00:00Z");
  const options = { assignedLessonIds: [9], lessons: [assignedLesson] };
  const items = getMyEvents([], [], now, portalUrl, options);
  assert.deepEqual(items.map(({ item }) => [item.kind, item.id]), [["lesson", assignedLesson.id]]);
  assert.match(createIcs(items[0].item)!, /UID:lesson-beginners-course-4-lesson-9/);
  assert.equal(getMyEvents([], [], now, portalUrl, { ...options, assignedLessonIds: [] }).length, 0);
  assert.equal(getMyEvents([], [], now, portalUrl, { ...options, lessons: [{ ...assignedLesson, isCancelled: true }] }).length, 0);
  assert.equal(getMyEvents([], [], new Date("2026-07-01T17:00:00Z"), portalUrl, options).length, 0);
});

test("sorts club bookings, coaching sessions and assigned lessons together", () => {
  const items = getMyEvents(
    [event],
    [coaching],
    new Date("2026-06-30T00:00:00Z"),
    portalUrl,
    { assignedLessonIds: [9], lessons: [assignedLesson] },
  );
  assert.deepEqual(items.map(({ item }) => item.kind), ["lesson", "coaching", "event"]);
});
