import { buildActorHeaders, fetchApi } from "./client";

export type AttendanceReportRow = {
  id: string;
  type: "Member" | "Guest";
  date: string;
  time: string;
  name: string;
  username: string;
  loginMethod: string;
  archeryGbMembershipNumber: string;
  attendingWith: string;
  attendingWithUsername: string;
};

export type AttendanceReportDailyRow = {
  usageDate: string;
  label: string;
  fullLabel: string;
  members: number;
  guests: number;
  total: number;
};

export type AttendanceReport = {
  startDate: string;
  endDate: string;
  includeMembers: boolean;
  includeGuests: boolean;
  total: number;
  members: number;
  guests: number;
  daily: AttendanceReportDailyRow[];
  rows: AttendanceReportRow[];
};

export async function getAttendanceReport(
  actorUsername: string,
  params: {
    startDate: string;
    endDate: string;
    includeMembers: boolean;
    includeGuests: boolean;
  },
) {
  const searchParams = new URLSearchParams({
    start: params.startDate,
    end: params.endDate,
    members: String(params.includeMembers),
    guests: String(params.includeGuests),
  });

  return fetchApi<{
    success: true;
    report: AttendanceReport;
  }>(`/api/reporting/attendance?${searchParams.toString()}`, {
    headers: buildActorHeaders(actorUsername),
    cache: "no-store",
  });
}
