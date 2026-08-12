import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCsv,
  summarizeAttendanceBreakdown,
} from "./reportingUtils.ts";

test("buildCsv includes membership and programme classification columns", () => {
  const csv = buildCsv({
    startDate: "2026-08-01",
    endDate: "2026-08-12",
    includeMembers: true,
    includeGuests: true,
    total: 2,
    members: 1,
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
    "Date,Time,Type,Membership Status,Programme Type,Role,Name,Username,Login Method,Archery GB Number,Attending With,Attending With Username",
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
      { key: "guest", label: "Guest", count: 1 },
      { key: "member", label: "Member", count: 1 },
      { key: "non-member", label: "Non-member", count: 1 },
    ],
    programmeTypes: [
      { key: "none", label: "No programme", count: 2 },
      { key: "taster-session", label: "Taster Session", count: 1 },
    ],
  });
});
