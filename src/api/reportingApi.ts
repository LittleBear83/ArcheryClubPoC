import { buildActorHeaders, fetchApi } from "./client";

export type AttendanceReportRow = {
  id: string;
  type: "Member" | "Guest";
  date: string;
  time: string;
  name: string;
  username: string;
  loginMethod: string;
  membershipStatus: string;
  programmeType: string;
  role: string;
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

export type MemberJourneyReportRow = {
  id: string;
  username: string;
  name: string;
  joinedAtDate: string;
  joinedAtTime: string;
  originCourseType: string;
  currentCourseType: string;
  journey: string;
  convertedToMember: boolean;
  convertedAtDate: string;
  convertedAtTime: string;
  membershipStatus: string;
  programmeType: string;
  role: string;
};

export type MemberJourneyReportSummary = {
  totalParticipants: number;
  directBeginnersParticipants: number;
  tasterParticipants: number;
  haveAGoParticipants: number;
  tasterToBeginnersParticipants: number;
  convertedToMembers: number;
  convertedFromDirectBeginners: number;
  convertedFromTasterPath: number;
  beginnersCourseCohortCount: number;
  beginnersCourseConvertedCount: number;
  beginnersCourseConversionRate: number;
  directBeginnersConversionRate: number;
  tasterPathConversionRate: number;
};

export type MemberJourneyReport = {
  startDate: string;
  endDate: string;
  rows: MemberJourneyReportRow[];
  summary: MemberJourneyReportSummary;
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

export async function getMemberJourneyReport(
  actorUsername: string,
  params: {
    startDate: string;
    endDate: string;
  },
) {
  const searchParams = new URLSearchParams({
    start: params.startDate,
    end: params.endDate,
  });

  return fetchApi<{
    success: true;
    report: MemberJourneyReport;
  }>(`/api/reporting/member-journeys?${searchParams.toString()}`, {
    headers: buildActorHeaders(actorUsername),
    cache: "no-store",
  });
}
