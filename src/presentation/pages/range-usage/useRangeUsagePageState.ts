import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateRangeLabel } from "../../../utils/dateTime";
import { getRangeUsageDashboard } from "../../../api/rangeUsageApi";
import {
  aggregateMonthDayRows,
  getCurrentWeekStartString,
  getSelectedRangeLengthInDays,
  getTodayString,
  normalizeUsageWindow,
} from "./rangeUsageUtils";

export function useRangeUsagePageState(currentUserProfile) {
  const [startDate, setStartDate] = useState(getCurrentWeekStartString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [activeView, setActiveView] = useState("currentWeek");
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const queryResult = useQuery({
    queryKey: ["range-usage-dashboard", actorUsername, startDate, endDate],
    queryFn: async () => {
      const result = await getRangeUsageDashboard(actorUsername, {
        startDate,
        endDate,
      });

      const normalizedCurrentMonth = normalizeUsageWindow(
        result.currentMonth,
        "Current month",
      );
      const normalizedCurrentWeek = normalizeUsageWindow(
        result.currentWeek,
        "Current week",
      );
      const normalizedFilteredRange = normalizeUsageWindow(
        result.filteredRange,
        formatDateRangeLabel(startDate, endDate),
      );

      return {
        currentMonth: normalizedCurrentMonth,
        currentWeek: normalizedCurrentWeek,
        filteredRange: normalizedFilteredRange,
        myCurrentMonth: normalizeUsageWindow(
          result.myCurrentMonth ?? result.currentMonth,
          "Current month",
        ),
        myCurrentWeek: normalizeUsageWindow(
          result.myCurrentWeek ?? result.currentWeek,
          "Current week",
        ),
        myFilteredRange: normalizeUsageWindow(
          result.myFilteredRange ?? result.filteredRange,
          formatDateRangeLabel(startDate, endDate),
        ),
      };
    },
    enabled: Boolean(actorUsername),
  });

  const activeData = useMemo(
    () => (queryResult.data ? queryResult.data[activeView] : null),
    [activeView, queryResult.data],
  );
  const activePersonalData = useMemo(() => {
    if (!queryResult.data) {
      return null;
    }

    const personalKey =
      activeView === "currentMonth"
        ? "myCurrentMonth"
        : activeView === "currentWeek"
          ? "myCurrentWeek"
          : "myFilteredRange";

    return queryResult.data[personalKey];
  }, [activeView, queryResult.data]);
  const aggregatedMonthRows = useMemo(
    () => (activeData ? aggregateMonthDayRows(activeData.daily) : []),
    [activeData],
  );
  const aggregatedPersonalMonthRows = useMemo(
    () =>
      activePersonalData ? aggregateMonthDayRows(activePersonalData.daily) : [],
    [activePersonalData],
  );
  const selectedRangeLengthInDays = useMemo(
    () => getSelectedRangeLengthInDays(activePersonalData),
    [activePersonalData],
  );
  const myRangeGraphConfig = useMemo(() => {
    if (!activePersonalData) {
      return null;
    }

    if (activeView === "currentMonth") {
      return {
        rows: aggregatedPersonalMonthRows,
        keyField: "usageDate",
        className: "usage-graph-date",
        subtitle: activePersonalData.label,
      };
    }

    if (activeView === "currentWeek") {
      return {
        rows: activePersonalData.weekday,
        keyField: "dayOfWeek",
        className: "usage-graph-week",
        subtitle: activePersonalData.label,
      };
    }

    if (selectedRangeLengthInDays <= 14) {
      return {
        rows: activePersonalData.daily,
        keyField: "usageDate",
        className: "usage-graph-date",
        subtitle: `${activePersonalData.label} by day`,
      };
    }

    return {
      rows: aggregatedPersonalMonthRows,
      keyField: "usageDate",
      className: "usage-graph-date",
      subtitle: `${activePersonalData.label} aggregated by day of month`,
    };
  }, [
    activePersonalData,
    activeView,
    aggregatedPersonalMonthRows,
    selectedRangeLengthInDays,
  ]);

  return {
    activeData,
    activePersonalData,
    activeView,
    aggregatedMonthRows,
    dashboard: queryResult.data,
    endDate,
    error: queryResult.error,
    getTodayString,
    myRangeGraphConfig,
    setActiveView,
    setEndDate,
    setStartDate,
    startDate,
  };
}
