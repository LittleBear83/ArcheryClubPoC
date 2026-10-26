import type { AttendanceReport, MemberJourneyReport, MemberRangeAttendanceReport, RangeVisitReport } from "../../../api/reportingApi";
import { filterAccessRows, type AccessSelection } from "./reportingInsights";
import { buildCsv, buildMemberJourneyCsv, buildMemberRangeAttendanceCsv, buildRangeVisitCsv } from "./reportingUtils";

export type ReportingExportDataset = "access" | "journeys" | "visits" | "follow-up";
export type ReportingExportOptions = {
  dataset: ReportingExportDataset;
  accessScope: "all" | "chart";
  accessSource: "all" | "member" | "guest";
  journeyOrigin: "all" | "beginners" | "taster-session" | "have-a-go";
  journeyConversion: "all" | "converted" | "not-converted";
  visitKind: "all" | "member" | "guest";
  visitHour: string;
  followUpStatus: "all" | "attended" | "no-visit";
  followUpMemberType: "all" | "member" | "associate-member";
};

export type ReportingExportData = {
  access?: AttendanceReport;
  journeys?: MemberJourneyReport;
  visits?: RangeVisitReport;
  followUp?: MemberRangeAttendanceReport;
  accessSelection: AccessSelection;
};

export function availableExportDatasets(canViewMemberVisits: boolean): ReportingExportDataset[] {
  return canViewMemberVisits ? ["access", "journeys", "visits", "follow-up"] : ["access", "journeys"];
}

export function prepareReportingExport(data: ReportingExportData, options: ReportingExportOptions) {
  if (options.dataset === "access") {
    if (!data.access) return null;
    const report = data.access;
    const scoped = options.accessScope === "chart" && data.accessSelection
      ? filterAccessRows(report.rows, data.accessSelection) : report.rows;
    const rows = scoped.filter((row) => options.accessSource === "all" || row.type === (options.accessSource === "member" ? "Member" : "Guest"));
    return {
      count: rows.length,
      csv: buildCsv({ ...report, rows }),
      filename: `access-events-${report.startDate}-to-${report.endDate}-${options.accessSource}-${options.accessScope}.csv`,
      description: `${report.startDate} to ${report.endDate} UTC · successful access events`,
    };
  }
  if (options.dataset === "journeys") {
    if (!data.journeys) return null;
    const report = data.journeys;
    const rows = report.rows.filter((row) =>
      (options.journeyOrigin === "all" || row.originCourseType === options.journeyOrigin) &&
      (options.journeyConversion === "all" || row.convertedToMember === (options.journeyConversion === "converted")));
    return {
      count: rows.length,
      csv: buildMemberJourneyCsv(rows),
      filename: `programme-journeys-${report.startDate}-to-${report.endDate}-${options.journeyOrigin}-${options.journeyConversion}.csv`,
      description: `${report.startDate} to ${report.endDate} UTC · people who started a programme`,
    };
  }
  if (options.dataset === "visits") {
    if (!data.visits) return null;
    const report = data.visits;
    const rows = report.rows.filter((row) =>
      (options.visitKind === "all" || (row.loginMethod === "guest") === (options.visitKind === "guest")) &&
      (options.visitHour === "" || row.time.slice(0, 2) === options.visitHour.padStart(2, "0")));
    return {
      count: rows.length,
      csv: buildRangeVisitCsv(rows),
      filename: `range-visits-${report.startDate}-to-${report.endDate}-${options.visitKind}${options.visitHour ? `-${options.visitHour.padStart(2, "0")}h` : ""}.csv`,
      description: `${report.startDate} to ${report.endDate} UTC · two-hour-deduplicated member visits and guest sign-ins`,
    };
  }
  if (!data.followUp) return null;
  const report = data.followUp;
  const rows = report.rows.filter((row) =>
    (options.followUpStatus === "all" || row.hasRecordedVisit === (options.followUpStatus === "attended")) &&
    (options.followUpMemberType === "all" || row.membershipStatus === options.followUpMemberType));
  return {
    count: rows.length,
    csv: buildMemberRangeAttendanceCsv(rows),
    filename: `member-follow-up-${report.days}-days-${options.followUpStatus}-${options.followUpMemberType}.csv`,
    description: `${report.startDate} to ${report.endDate} UTC · current member profiles and recorded range visits`,
  };
}
