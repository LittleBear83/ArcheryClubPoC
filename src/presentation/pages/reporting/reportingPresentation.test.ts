import assert from "node:assert/strict";
import test from "node:test";
import type { AttendanceReportRow, MemberJourneyReportRow } from "../../../api/reportingApi";
import {
  attendanceReportItems,
  formatAttendanceReportRow,
  formatMemberJourneyRow,
  memberJourneyItems,
  REPORTING_PREVIEW_LIMIT,
} from "./reportingPresentation";

test("desktop and mobile attendance values share dates, membership labels and blank fallbacks", () => {
  const row = {
    id: "visit-1", date: "2026-10-21", time: "18:30:00", type: "Member", name: "A Archer",
    membershipStatus: "non-member", programmeType: "", role: "", archeryGbMembershipNumber: "", attendingWith: "",
  } as AttendanceReportRow;
  const display = formatAttendanceReportRow(row);
  const items = attendanceReportItems(row);
  assert.equal(display.memberType, "Non-member");
  assert.equal(display.programme, "-");
  assert.equal(display.role, "-");
  assert.equal(items.find((item) => item.label === "Date")?.value, display.date);
  assert.equal(items.find((item) => item.label === "Member type")?.value, display.memberType);
  assert.equal(items.find((item) => item.label === "Archery GB")?.value, "-");
  assert.equal(REPORTING_PREVIEW_LIMIT, 25);
});

test("desktop and mobile journey values agree for converted and active participants", () => {
  const row = {
    id: "journey-1", joinedAtDate: "2026-10-01", name: "B Archer",
    membershipStatus: "non-member", convertedToMember: false, convertedAtDate: "",
  } as MemberJourneyReportRow;
  assert.equal(formatMemberJourneyRow(row).converted, "No");
  assert.equal(memberJourneyItems(row).find((item) => item.label === "Converted At")?.value, "-");
  assert.equal(formatMemberJourneyRow({ ...row, convertedToMember: true, convertedAtDate: "2026-10-21" }).converted, "Yes");
});
