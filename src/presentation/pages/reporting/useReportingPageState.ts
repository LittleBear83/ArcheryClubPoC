import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAttendanceReport, getMemberJourneyReport, getMemberRangeAttendanceReport } from "../../../api/reportingApi";
import { hasPermission } from "../../../utils/userProfile";
import type { UserProfile } from "../../../types/app";
import {
  aggregateMonthDayRows,
  buildCsv,
  buildMemberRangeAttendanceCsv,
  getMonthStartString,
  getRangeLabel,
  getTodayString,
  saveCsv,
  summarizeAttendanceBreakdown,
} from "./reportingUtils";

export function useReportingPageState(currentUserProfile: UserProfile | null) {
  const [startDate, setStartDate] = useState(getMonthStartString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [includeMembers, setIncludeMembers] = useState(true);
  const [includeGuests, setIncludeGuests] = useState(true);
  const [exportError, setExportError] = useState("");
  const [memberRangeDays, setMemberRangeDays] = useState(90);
  const [memberRangeFilter, setMemberRangeFilter] = useState<"no-visit" | "attended" | "all">("no-visit");
  const [memberRangeExportError, setMemberRangeExportError] = useState("");
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canViewReports = hasPermission(currentUserProfile, "view_reports");
  const canViewMemberRangeAttendance = canViewReports &&
    ["admin", "developer"].includes(String(currentUserProfile?.membership?.role ?? "").toLowerCase());
  const hasDataSource = includeMembers || includeGuests;

  const queryResult = useQuery({
    queryKey: [
      "attendance-report",
      actorUsername,
      startDate,
      endDate,
      includeMembers,
      includeGuests,
    ],
    queryFn: async () => {
      const result = await getAttendanceReport(actorUsername, {
        startDate,
        endDate,
        includeMembers,
        includeGuests,
      });

      return result.report;
    },
    enabled: canViewReports && Boolean(actorUsername) && hasDataSource,
  });
  const memberJourneyQuery = useQuery({
    queryKey: ["member-journey-report", actorUsername, startDate, endDate],
    queryFn: async () => {
      const result = await getMemberJourneyReport(actorUsername, {
        startDate,
        endDate,
      });

      return result.report;
    },
    enabled: canViewReports && Boolean(actorUsername),
  });
  const memberRangeQuery = useQuery({
    queryKey: ["member-range-attendance", actorUsername, memberRangeDays],
    queryFn: async () => {
      const result = await getMemberRangeAttendanceReport(actorUsername, memberRangeDays);
      return result.report;
    },
    enabled: canViewMemberRangeAttendance && Boolean(actorUsername),
  });
  const memberRangeRows = useMemo(() => (memberRangeQuery.data?.rows ?? []).filter((row) =>
    memberRangeFilter === "all" ||
    (memberRangeFilter === "attended" ? row.hasRecordedVisit : !row.hasRecordedVisit)),
  [memberRangeFilter, memberRangeQuery.data]);

  const rangeLabel = useMemo(
    () => getRangeLabel(startDate, endDate),
    [endDate, startDate],
  );
  const aggregatedMonthRows = useMemo(
    () => (queryResult.data ? aggregateMonthDayRows(queryResult.data.daily) : []),
    [queryResult.data],
  );
  const attendanceBreakdown = useMemo(
    () =>
      queryResult.data
        ? summarizeAttendanceBreakdown(queryResult.data.rows)
        : { membershipStatuses: [], programmeTypes: [] },
    [queryResult.data],
  );

  const handleExport = async () => {
    if (!queryResult.data) {
      return;
    }

    setExportError("");

    try {
      await saveCsv(
        `attendance-report-${queryResult.data.startDate}-to-${queryResult.data.endDate}.csv`,
        buildCsv(queryResult.data),
      );
    } catch (saveError) {
      if (saveError instanceof DOMException && saveError.name === "AbortError") {
        return;
      }

      setExportError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to export the report.",
      );
    }
  };

  const handleMemberRangeExport = async () => {
    if (!memberRangeQuery.data) return;
    setMemberRangeExportError("");
    try {
      await saveCsv(
        `member-range-attendance-${memberRangeFilter}-${memberRangeDays}-days.csv`,
        buildMemberRangeAttendanceCsv(memberRangeRows),
      );
    } catch (saveError) {
      if (saveError instanceof DOMException && saveError.name === "AbortError") return;
      setMemberRangeExportError(saveError instanceof Error ? saveError.message : "Unable to export member attendance.");
    }
  };

  return {
    actorUsername,
    aggregatedMonthRows,
    attendanceBreakdown,
    canViewReports,
    data: queryResult.data,
    endDate,
    error: queryResult.error,
    exportError,
    getTodayString,
    handleExport,
    hasDataSource,
    includeGuests,
    includeMembers,
    isFetching: queryResult.isFetching,
    isLoadingMemberJourneys: memberJourneyQuery.isFetching,
    memberJourneyData: memberJourneyQuery.data,
    memberJourneyError: memberJourneyQuery.error,
    memberRangeAttendance: {
      canView: canViewMemberRangeAttendance,
      data: memberRangeQuery.data,
      days: memberRangeDays,
      error: memberRangeQuery.error,
      exportError: memberRangeExportError,
      filter: memberRangeFilter,
      handleExport: handleMemberRangeExport,
      isFetching: memberRangeQuery.isFetching,
      rows: memberRangeRows,
      setDays: setMemberRangeDays,
      setFilter: setMemberRangeFilter,
    },
    rangeLabel,
    setEndDate,
    setIncludeGuests,
    setIncludeMembers,
    setStartDate,
    startDate,
  };
}
