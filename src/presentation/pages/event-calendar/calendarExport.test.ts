import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarTimes, coachingCalendarExport, createIcs, eventCalendarExport,
  googleCalendarUrl, lessonCalendarExport, londonDateTimeToUtc,
} from "./calendarExport.ts";

const portalUrl = "https://club.example/event-calendar";
const event = { kind: "event" as const, id: 42, title: "Club, social; evening",
  description: "Tea, cake\nand archery", date: "2026-07-01", startTime: "18:30",
  endTime: "20:00", location: "Indoor", portalUrl };

test("converts London winter and summer times to UTC", () => {
  assert.equal(londonDateTimeToUtc("2026-01-15", "18:30")?.toISOString(), "2026-01-15T18:30:00.000Z");
  assert.equal(londonDateTimeToUtc("2026-07-01", "18:30")?.toISOString(), "2026-07-01T17:30:00.000Z");
  assert.equal(londonDateTimeToUtc("2026-03-29", "01:30"), null);
  assert.equal(londonDateTimeToUtc("2026-10-25", "01:30")?.toISOString(), "2026-10-25T00:30:00.000Z");
});

test("rejects malformed dates and reversed or missing times", () => {
  for (const date of ["2026-02-30", "2026-13-01", "bad"]) assert.equal(londonDateTimeToUtc(date, "10:00"), null);
  for (const time of ["25:00", "12:90", "", "9:00"]) assert.equal(londonDateTimeToUtc("2026-07-01", time), null);
  assert.equal(calendarTimes({ ...event, endTime: "17:00" }), null);
  assert.equal(createIcs({ ...event, date: "bad" }), null);
  assert.equal(googleCalendarUrl({ ...event, endTime: "17:00" }), null);
});

test("creates stable, escaped and folded standards-compliant iCalendar content", () => {
  const ics = createIcs({ ...event, description: `${event.description}\n${"é".repeat(90)}` }, new Date("2026-01-01T00:00:00Z"))!;
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.match(unfolded, /UID:event-42@selbyarcheryclub\.portal/);
  assert.match(unfolded, /DTSTART:20260701T173000Z/);
  assert.match(unfolded, /DTEND:20260701T190000Z/);
  assert.match(unfolded, /SUMMARY:Club\\, social\\; evening/);
  assert.match(unfolded, /DESCRIPTION:Tea\\, cake\\nand archery/);
  assert.match(unfolded, /LOCATION:Indoor/);
  assert.match(unfolded, /URL:https:\/\/club\.example\/event-calendar/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(createIcs(event, new Date("2027-01-01"))?.match(/UID:.+/)?.[0], createIcs(event)?.match(/UID:.+/)?.[0]);
});

test("Google link contains the same UTC times and optional fields", () => {
  const url = new URL(googleCalendarUrl(event)!);
  assert.equal(url.hostname, "calendar.google.com");
  assert.equal(url.searchParams.get("dates"), "20260701T173000Z/20260701T190000Z");
  assert.equal(url.searchParams.get("text"), event.title);
  assert.equal(url.searchParams.get("location"), "Indoor");
  assert.equal(url.searchParams.get("ctz"), "Europe/London");
  assert.match(url.searchParams.get("details")!, /club\.example\/event-calendar/);
  const withoutVenue = { ...event, location: "", description: "" };
  assert.equal(new URL(googleCalendarUrl(withoutVenue)!).searchParams.has("location"), false);
  assert.equal(createIcs(withoutVenue)?.includes("LOCATION:"), false);
});

test("maps supported visible activity types and excludes ineligible entries", () => {
  const base = { id: 1, title: "Competition", date: event.date, startTime: event.startTime,
    endTime: event.endTime, type: "competition", isApproved: true };
  assert.equal(eventCalendarExport(base, portalUrl)?.kind, "event");
  assert.equal(eventCalendarExport({ ...base, type: "social" }, portalUrl)?.kind, "event");
  for (const change of [{ type: "range-closed" }, { isCancelled: true }, { isRejected: true },
    { isPendingApproval: true }, { isApproved: false }, { types: ["competition", "range-closed"] }]) {
    assert.equal(eventCalendarExport({ ...base, ...change }, portalUrl), null);
  }
  const coaching = { id: 2, topic: "Coaching", summary: "Skills", date: event.date,
    startTime: event.startTime, endTime: event.endTime, venue: "outdoor", isApproved: true };
  assert.equal(coachingCalendarExport(coaching as Parameters<typeof coachingCalendarExport>[0], portalUrl)?.location, "Outdoor");
  assert.equal(coachingCalendarExport({ ...coaching, isCancelled: true } as Parameters<typeof coachingCalendarExport>[0], portalUrl), null);
  for (const courseType of ["beginners", "taster-session", "have-a-go"] as const) {
    const lesson = { id: 3, title: "Course", courseType, lessonNumber: 2,
      coordinatorName: "Alex", coachNames: [], date: event.date,
      startTime: event.startTime, endTime: event.endTime };
    assert.equal(lessonCalendarExport(lesson as Parameters<typeof lessonCalendarExport>[0], portalUrl)?.kind, "lesson");
    assert.equal(lessonCalendarExport({ ...lesson, isCancelled: true } as Parameters<typeof lessonCalendarExport>[0], portalUrl), null);
  }
});
