import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceReport, MemberJourneyReport, RangeVisitReport } from "../../../api/reportingApi";
import { buildAccessInsights, buildJourneyInsights, buildVisitInsights, filterAccessRows, focusChartValues } from "./reportingInsights";
import { buildCsv, buildMemberJourneyCsv, buildRangeVisitCsv } from "./reportingUtils";

const report: AttendanceReport = {
  startDate: "2026-10-24", endDate: "2026-10-26", includeMembers: true, includeGuests: true,
  memberTypeCounts: [], total: 4, members: 3, guests: 1,
  daily: [
    { usageDate: "2026-10-24", label: "24", fullLabel: "2026-10-24", members: 2, guests: 0, total: 2 },
    { usageDate: "2026-10-25", label: "25", fullLabel: "2026-10-25", members: 0, guests: 1, total: 1 },
    { usageDate: "2026-10-26", label: "26", fullLabel: "2026-10-26", members: 1, guests: 0, total: 1 },
  ],
  rows: [
    { id: "m1", type: "Member", date: "2026-10-24", time: "09:00:00", name: "Alex", username: "alex", loginMethod: "rfid", membershipStatus: "member", programmeType: "none", role: "member", archeryGbMembershipNumber: "", attendingWith: "", attendingWithUsername: "" },
    { id: "m2", type: "Member", date: "2026-10-24", time: "10:00:00", name: "Alex", username: "alex", loginMethod: "mobile-app", membershipStatus: "member", programmeType: "none", role: "member", archeryGbMembershipNumber: "", attendingWith: "", attendingWithUsername: "" },
    { id: "g1", type: "Guest", date: "2026-10-25", time: "11:00:00", name: "Guest", username: "", loginMethod: "guest", membershipStatus: "guest", programmeType: "none", role: "guest", archeryGbMembershipNumber: "", attendingWith: "", attendingWithUsername: "" },
    { id: "m3", type: "Member", date: "2026-10-26", time: "12:00:00", name: "Sam", username: "sam", loginMethod: "password", membershipStatus: "member", programmeType: "none", role: "member", archeryGbMembershipNumber: "", attendingWith: "", attendingWithUsername: "" },
  ],
};

test("access charts reconcile with event rows and drilled CSV", () => {
  const insights = buildAccessInsights(report);
  assert.equal(insights.trend.reduce((total, bucket) => total + bucket.total, 0), report.total);
  assert.equal(insights.weekdays.reduce((total, day) => total + day.total, 0), report.total);
  assert.equal(insights.methods.reduce((total, method) => total + method.count, 0), report.members);
  assert.equal(insights.uniqueMemberLogins, 2);
  assert.equal(insights.busiestDay?.usageDate, "2026-10-24");
  const selected = filterAccessRows(report.rows, { kind: "bucket", startDate: "2026-10-24", endDate: "2026-10-24" });
  assert.equal(selected.length, insights.trend[0].total);
  assert.equal(buildCsv({ ...report, rows: selected }).split("\r\n").length - 1, selected.length);
  const sunday = filterAccessRows(report.rows, { kind: "weekday", day: 0 });
  assert.equal(sunday.length, insights.weekdays[0].total);
});

test("chart dropdown focus changes the plotted values and resets to the full series", () => {
  const values = [3, 0, 7, 2];
  assert.deepEqual(focusChartValues(values, 2), [0, 0, 7, 0]);
  assert.deepEqual(focusChartValues(values, 0), [3, 0, 0, 0]);
  assert.deepEqual(focusChartValues(values, null), values);
});

test("long ranges group dates into bounded weekly trend buckets", () => {
  const daily = Array.from({ length: 90 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
    return { usageDate: date, label: String(index + 1), fullLabel: date, members: 1, guests: 0, total: 1 };
  });
  const insights = buildAccessInsights({ ...report, daily });
  assert.equal(insights.trend.length, 13);
  assert.equal(insights.trend.reduce((total, bucket) => total + bucket.total, 0), 90);
  assert.equal(insights.trend[12].total, 6);
});

test("visit metrics and CSV use deduplicated visit rows rather than login events", () => {
  const visits: RangeVisitReport = { startDate: report.startDate, endDate: report.endDate, total: 3, rows: [
    { id: "m1", date: "2026-10-24", time: "09:00:00", name: "Alex", username: "alex", loginMethod: "rfid" },
    { id: "m2", date: "2026-10-26", time: "12:00:00", name: "Alex", username: "alex", loginMethod: "mobile-app" },
    { id: "g1", date: "2026-10-25", time: "11:00:00", name: "Guest", username: "", loginMethod: "guest" },
  ] };
  const insights = buildVisitInsights(visits);
  assert.deepEqual([insights.members, insights.guests, insights.uniqueMembers], [2, 1, 1]);
  assert.equal(insights.hours.reduce((total, hour) => total + hour.members + hour.guests, 0), visits.total);
  assert.equal(buildRangeVisitCsv(visits.rows).split("\r\n").length - 1, visits.total);
});

test("journey comparison and CSV count the same cohort", () => {
  const journeys: MemberJourneyReport = { startDate: report.startDate, endDate: report.endDate,
    summary: {} as MemberJourneyReport["summary"], rows: [
      { id: "1", username: "a", name: "Alex", joinedAtDate: "2026-10-24", joinedAtTime: "09:00:00", originCourseType: "beginners", currentCourseType: "beginners", journey: "Beginners Course", convertedToMember: true, convertedAtDate: "2026-10-26", convertedAtTime: "10:00:00", membershipStatus: "member", programmeType: "none", role: "member" },
      { id: "2", username: "b", name: "Blair", joinedAtDate: "2026-10-25", joinedAtTime: "09:00:00", originCourseType: "taster-session", currentCourseType: "taster-session", journey: "Taster Session", convertedToMember: false, convertedAtDate: "", convertedAtTime: "", membershipStatus: "non-member", programmeType: "taster-session", role: "non-member" },
    ] };
  const groups = buildJourneyInsights(journeys);
  assert.equal(groups.reduce((total, group) => total + group.started, 0), journeys.rows.length);
  assert.equal(groups.reduce((total, group) => total + group.converted, 0), 1);
  assert.equal(buildMemberJourneyCsv(journeys.rows).split("\r\n").length - 1, journeys.rows.length);
});

test("reporting CSV treats spreadsheet formulas as text", () => {
  const csv = buildRangeVisitCsv([{ id: "guest-1", date: "2026-10-26", time: "12:00:00", name: "=IMPORTDATA(1)", username: "", loginMethod: "guest" }]);
  assert.match(csv, /'=IMPORTDATA\(1\)/u);
});
