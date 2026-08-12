import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAttendanceReport } from "../../../api/reportingApi";
import { hasPermission } from "../../../utils/userProfile";
import type { UserProfile } from "../../../types/app";
import {
  aggregateMonthDayRows,
  buildCsv,
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
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canViewReports = hasPermission(currentUserProfile, "view_reports");
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
    rangeLabel,
    setEndDate,
    setIncludeGuests,
    setIncludeMembers,
    setStartDate,
    startDate,
  };
}
