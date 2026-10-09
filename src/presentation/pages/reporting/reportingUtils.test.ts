import assert from "node:assert/strict";
import { test } from "node:test";
import type { AttendanceReportRow } from "../../../api/reportingApi";
import {
  buildCsv,
  buildMemberRangeAttendanceCsv,
  formatMemberType,
  summarizeAttendanceBreakdown,
  summarizeCurrentMemberTypes,
} from "./reportingUtils.ts";

test("buildCsv includes membership and programme classification columns", () => {
  const csv = buildCsv({
    startDate: "2026-08-01",
    endDate: "2026-08-12",
    includeMembers: true,
    includeGuests: true,
    memberTypeCounts: [],
    total: 2,
    members: 1,
    nonMembers: 0,
    guests: 1,
    daily: [],
    rows: [
      {
        id: "member-1",
        type: "Member",
        date: "2026-08-12",
        time: "18:30:00",
        name: "Taylor Archer",
        username: "tarcher",
        loginMethod: "rfid",
        membershipStatus: "non-member",
        programmeType: "taster-session",
        role: "have-a-go",
        archeryGbMembershipNumber: "",
        attendingWith: "",
        attendingWithUsername: "",
      },
    ],
  });

  const [headerLine, firstRow] = csv.split("\r\n");

  assert.equal(
    headerLine,
    "Date,Time,Type,Member Type,Programme Type,Role,Name,Username,Login Method,Archery GB Number,Attending With,Attending With Username",
  );
  assert.match(firstRow, /non-member,taster-session,have-a-go,Taylor Archer/);
});

test("summarizeAttendanceBreakdown groups rows by membership status and programme type", () => {
  const summary = summarizeAttendanceBreakdown([
    {
      id: "member-1",
      type: "Member",
      date: "2026-08-12",
      time: "18:00:00",
      name: "Morgan Member",
      username: "morgan.member",
      loginMethod: "password",
      membershipStatus: "member",
      programmeType: "none",
      role: "general",
      archeryGbMembershipNumber: "",
      attendingWith: "",
      attendingWithUsername: "",
    },
    {
      id: "member-2",
      type: "Member",
      date: "2026-08-12",
      time: "18:05:00",
      name: "Taylor Taster",
      username: "taylor.taster",
      loginMethod: "password",
      membershipStatus: "non-member",
      programmeType: "taster-session",
      role: "have-a-go",
      archeryGbMembershipNumber: "",
      attendingWith: "",
      attendingWithUsername: "",
    },
    {
      id: "associate-1",
      type: "Member",
      date: "2026-08-12",
      time: "18:07:00",
      name: "Avery Associate",
      username: "avery.associate",
      loginMethod: "rfid",
      membershipStatus: "associate-member",
      programmeType: "none",
      role: "general",
      archeryGbMembershipNumber: "",
      attendingWith: "",
      attendingWithUsername: "",
    },
    {
      id: "guest-1",
      type: "Guest",
      date: "2026-08-12",
      time: "18:10:00",
      name: "Gary Guest",
      username: "",
      loginMethod: "guest",
      membershipStatus: "guest",
      programmeType: "none",
      role: "guest",
      archeryGbMembershipNumber: "",
      attendingWith: "Morgan Member",
      attendingWithUsername: "morgan.member",
    },
  ]);

  assert.deepEqual(summary, {
    membershipStatuses: [
      { key: "member", label: "Member", count: 1 },
      { key: "associate-member", label: "Associate Member", count: 1 },
      { key: "parent", label: "Parent", count: 0 },
      { key: "volunteer", label: "Volunteer", count: 0 },
      { key: "non-member", label: "Non-member", count: 1 },
      { key: "guest", label: "Guest", count: 1 },
    ],
    programmeTypes: [
      { key: "none", label: "No programme", count: 3 },
      { key: "taster-session", label: "Taster Session", count: 1 },
    ],
  });
});

test("member type breakdown shows zero attendance for types absent from the selected range", () => {
  const memberRow: AttendanceReportRow = {
    id: "member-1", type: "Member", date: "2026-10-07", time: "18:00:00",
    name: "Morgan Member", username: "morgan.member", loginMethod: "rfid",
    membershipStatus: "member", programmeType: "none", role: "general",
    archeryGbMembershipNumber: "", attendingWith: "", attendingWithUsername: "",
  };

  assert.deepEqual(summarizeAttendanceBreakdown([memberRow]).membershipStatuses, [
    { key: "member", label: "Member", count: 1 },
    { key: "associate-member", label: "Associate Member", count: 0 },
    { key: "parent", label: "Parent", count: 0 },
    { key: "volunteer", label: "Volunteer", count: 0 },
    { key: "non-member", label: "Non-member", count: 0 },
    { key: "guest", label: "Guest", count: 0 },
  ]);
  assert.deepEqual(summarizeAttendanceBreakdown([]).membershipStatuses.map(({ count }) => count), [0, 0, 0, 0, 0, 0]);
});

test("current member type breakdown counts active profiles without login events", () => {
  assert.deepEqual(summarizeCurrentMemberTypes([
    { membership_status: "member", count: 8 },
    { membership_status: "associate-member", count: 1 },
  ]), [
    { key: "member", label: "Member", count: 8 },
    { key: "associate-member", label: "Associate Member", count: 1 },
    { key: "parent", label: "Parent", count: 0 },
    { key: "volunteer", label: "Volunteer", count: 0 },
    { key: "non-member", label: "Non-member", count: 0 },
    { key: "guest", label: "Guest", count: 0 },
  ]);
});

test("member range export includes associate member type and report labels are readable", () => {
  const csv = buildMemberRangeAttendanceCsv([{
    username: "avery", name: "Avery Archer", emailAddress: "avery@example.org",
    membershipStatus: "associate-member", role: "general", visitDays: 2,
    totalVisitDays: 5, lastVisitAt: "2026-08-12T18:00:00", hasRecordedVisit: true,
  }]);
  const [header, row] = csv.split("\r\n");
  assert.match(header, /Member Type/);
  assert.match(row, /Avery Archer,avery,associate-member,avery@example.org/);
  assert.equal(formatMemberType("associate-member"), "Associate Member");
});
