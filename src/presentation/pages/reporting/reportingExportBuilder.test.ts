import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceReport, MemberJourneyReport, MemberRangeAttendanceReport, RangeVisitReport } from "../../../api/reportingApi";
import { availableExportDatasets, prepareReportingExport, type ReportingExportOptions } from "./reportingExportBuilder";

const options: ReportingExportOptions = {
  dataset: "access", accessScope: "all", accessSource: "all",
  journeyOrigin: "all", journeyConversion: "all", visitKind: "all", visitHour: "",
  followUpStatus: "all", followUpMemberType: "all",
};
const access = {
  startDate: "2026-10-01", endDate: "2026-10-26", rows: [
    { id: "member-1", date: "2026-10-12", type: "Member", name: "A", username: "a" },
    { id: "guest-1", date: "2026-10-12", type: "Guest", name: "B", username: "" },
    { id: "member-2", date: "2026-10-13", type: "Member", name: "C", username: "c" },
  ],
} as AttendanceReport;
const journeys = { startDate: access.startDate, endDate: access.endDate, rows: [
  { id: "1", originCourseType: "beginners", convertedToMember: true, name: "A" },
  { id: "2", originCourseType: "beginners", convertedToMember: false, name: "B" },
  { id: "3", originCourseType: "taster-session", convertedToMember: true, name: "C" },
] } as MemberJourneyReport;
const visits = { startDate: access.startDate, endDate: access.endDate, rows: [
  { id: "member-1", date: "2026-10-12", time: "09:00:00", loginMethod: "rfid", name: "A", username: "a" },
  { id: "guest-1", date: "2026-10-12", time: "09:30:00", loginMethod: "guest", name: "B", username: "" },
  { id: "member-2", date: "2026-10-13", time: "10:00:00", loginMethod: "mobile-app", name: "C", username: "c" },
] } as RangeVisitReport;
const followUp = { days: 90, startDate: "2026-07-29", endDate: "2026-10-26", rows: [
  { username: "a", membershipStatus: "member", hasRecordedVisit: false, name: "A" },
  { username: "b", membershipStatus: "associate-member", hasRecordedVisit: false, name: "B" },
  { username: "c", membershipStatus: "member", hasRecordedVisit: true, name: "C" },
] } as MemberRangeAttendanceReport;
const data = { access, journeys, visits, followUp, accessSelection: { kind: "bucket" as const, startDate: "2026-10-12", endDate: "2026-10-12" } };

test("dataset choices follow visit permission", () => {
  assert.deepEqual(availableExportDatasets(false), ["access", "journeys"]);
  assert.deepEqual(availableExportDatasets(true), ["access", "journeys", "visits", "follow-up"]);
});

test("access export respects chart scope and source and CSV row count", () => {
  const prepared = prepareReportingExport(data, { ...options, accessScope: "chart", accessSource: "member" });
  assert.equal(prepared?.count, 1);
  assert.equal(prepared?.csv.split("\r\n").length, 2);
  assert.match(prepared?.filename ?? "", /access-events-2026-10-01/u);
});

test("journey export filters origin and conversion", () => {
  const prepared = prepareReportingExport(data, { ...options, dataset: "journeys", journeyOrigin: "beginners", journeyConversion: "converted" });
  assert.equal(prepared?.count, 1);
  assert.match(prepared?.csv ?? "", /A/u);
});

test("visit export filters member or guest and hour", () => {
  const prepared = prepareReportingExport(data, { ...options, dataset: "visits", visitKind: "member", visitHour: "9" });
  assert.equal(prepared?.count, 1);
  assert.equal(prepared?.csv.split("\r\n").length, 2);
});

test("follow-up export filters recorded status and member type", () => {
  const prepared = prepareReportingExport(data, { ...options, dataset: "follow-up", followUpStatus: "no-visit", followUpMemberType: "associate-member" });
  assert.equal(prepared?.count, 1);
  assert.match(prepared?.csv ?? "", /B/u);
});
