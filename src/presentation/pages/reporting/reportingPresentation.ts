import { formatClockTime, formatDate } from "../../../utils/dateTime";
import type { AttendanceReportRow, MemberJourneyReportRow } from "../../../api/reportingApi";
import { formatMemberType } from "./reportingUtils";

export const REPORTING_PREVIEW_LIMIT = 25;

export function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatAttendanceReportRow(row: AttendanceReportRow) {
  return {
    date: formatDate(row.date),
    time: formatClockTime(row.time),
    type: row.type,
    memberType: formatMemberType(row.membershipStatus),
    programme: row.programmeType || "-",
    role: row.role || "-",
    name: row.name,
    archeryGb: row.archeryGbMembershipNumber || "-",
    attendingWith: row.attendingWith || "-",
  };
}

export function attendanceReportItems(row: AttendanceReportRow) {
  const display = formatAttendanceReportRow(row);
  return [
    { label: "Date", value: display.date },
    { label: "Time", value: display.time },
    { label: "Type", value: display.type },
    { label: "Member type", value: display.memberType },
    { label: "Programme", value: display.programme },
    { label: "Role", value: display.role },
    { label: "Archery GB", value: display.archeryGb },
    { label: "Attending With", value: display.attendingWith },
  ];
}

export function formatMemberJourneyRow(row: MemberJourneyReportRow) {
  return {
    joined: formatDate(row.joinedAtDate),
    name: row.name,
    memberType: formatMemberType(row.membershipStatus),
    converted: row.convertedToMember ? "Yes" : "No",
    convertedAt: row.convertedAtDate ? formatDate(row.convertedAtDate) : "-",
  };
}

export function memberJourneyItems(row: MemberJourneyReportRow) {
  const display = formatMemberJourneyRow(row);
  return [
    { label: "Joined", value: display.joined },
    { label: "Member type", value: display.memberType },
    { label: "Converted", value: display.converted },
    { label: "Converted At", value: display.convertedAt },
  ];
}
