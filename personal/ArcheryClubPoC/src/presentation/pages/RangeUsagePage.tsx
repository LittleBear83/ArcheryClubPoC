import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/Button";
import {
  formatDate,
  formatDateRangeLabel,
  formatHourLabel,
} from "../../utils/dateTime";
import { fetchApi } from "../../lib/api";

function getUtcDateString(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function getTodayString() {
  return getUtcDateString(new Date());
}

function normalizeUsageWindow(windowData, fallbackLabel = "") {
  if (!windowData) {
    return {
      label: fallbackLabel,
      startDate: "",
      endDate: "",
      members: 0,
      guests: 0,
      total: 0,
      hourly: [],
      weekday: [],
      daily: [],
      monthDaily: [],
    };
  }

  const startDate = windowData.startDate ?? "";
  const endDate = windowData.endDate ?? "";
  const label =
    startDate && endDate
      ? formatDateRangeLabel(startDate, endDate)
      : (windowData.label ?? fallbackLabel);

  return {
    label,
    startDate,
    endDate,
    members: windowData.members ?? 0,
    guests: windowData.guests ?? 0,
    total: windowData.total ?? 0,
    hourly: Array.isArray(windowData.hourly)
      ? windowData.hourly.map((row) => ({
          ...row,
          label: formatHourLabel(row.hour),
          fullLabel: formatHourLabel(row.hour),
        }))
      : [],
    weekday: Array.isArray(windowData.weekday) ? windowData.weekday : [],
    daily: Array.isArray(windowData.daily)
      ? windowData.daily.map((row) => ({
          ...row,
          fullLabel: formatDate(row.usageDate),
        }))
      : [],
    monthDaily: Array.isArray(windowData.monthDaily)
      ? windowData.monthDaily.map((row) => ({
          ...row,
          fullLabel: row.fullLabel ?? `Day ${row.label}`,
        }))
      : [],
  };
}

function UsageCard({ active, data, onClick, title }) {
  return (
    <Button
      className={`usage-card ${active ? "active" : ""}`}
      onClick={onClick}
      variant="unstyled"
    >
      <p className="usage-card-title">{title}</p>
      <p className="usage-card-range">{data.label}</p>
      <div className="usage-card-stats">
        <div>
          <span className="usage-stat-label">Members</span>
          <strong>{data.members}</strong>
        </div>
        <div>
          <span className="usage-stat-label">Guests</span>
          <strong>{data.guests}</strong>
        </div>
        <div>
          <span className="usage-stat-label">Total</span>
          <strong>{data.total}</strong>
        </div>
      </div>
    </Button>
  );
}

function HourlyUsageGraph({ rows }) {
  return <UsageGraph rows={rows} keyField="hour" />;
}

function WeekdayUsageGraph({ rows }) {
  return (
    <UsageGraph rows={rows} keyField="dayOfWeek" className="usage-graph-week" />
  );
}

function DailyUsageGraph({ rows }) {
  return (
    <UsageGraph rows={rows} keyField="usageDate" className="usage-graph-date" />
  );
}

function PersonalUsageGraph({ rows, keyField, className = "" }) {
  if (!rows.length) {
    return (
      <p className="usage-empty-state">
        No personal range usage data for this period.
      </p>
    );
  }

  const maxValue = Math.max(
    ...rows.map((row) => row.members ?? row.total ?? 0),
    1,
  );
  const graphClassName = ["usage-graph", className].filter(Boolean).join(" ");

  return (
    <div className={graphClassName}>
      {rows.map((row) => {
        const value = row.members ?? row.total ?? 0;

        return (
          <div key={row[keyField]} className="usage-graph-column">
            <span className="usage-graph-total usage-graph-total-members">
              {value}
            </span>
            <div className="usage-graph-track">
              <div
                className="usage-graph-stack"
                style={{ height: `${(value / maxValue) * 100}%` }}
                title={`${row.fullLabel ?? row.label}: ${value} member visits`}
              >
                <div
                  className="usage-graph-segment usage-graph-members"
                  style={{ height: "100%" }}
                />
              </div>
            </div>
            <span className="usage-graph-label">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function UsageGraphLegend() {
  return (
    <div className="usage-graph-legend">
      <span className="usage-legend-item">
        <span className="usage-legend-swatch usage-graph-members" />
        Members
      </span>
      <span className="usage-legend-item">
        <span className="usage-legend-swatch usage-graph-guests" />
        Guests
      </span>
    </div>
  );
}

function aggregateMonthDayRows(rows) {
  const aggregatedRows = Array.from({ length: 31 }, (_, index) => ({
    usageDate: `day-${index + 1}`,
    label: String(index + 1),
    fullLabel: `Day ${index + 1}`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of rows) {
    const usageDate = typeof row.usageDate === "string" ? row.usageDate : "";
    const dayOfMonth = Number.parseInt(usageDate.slice(-2), 10);

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      continue;
    }

    const aggregateRow = aggregatedRows[dayOfMonth - 1];
    aggregateRow.members += row.members ?? 0;
    aggregateRow.guests += row.guests ?? 0;
    aggregateRow.total += row.total ?? 0;
  }

  return aggregatedRows;
}

function getSelectedRangeLengthInDays(data) {
  if (!data?.startDate || !data?.endDate) {
    return 0;
  }

  const start = new Date(`${data.startDate}T00:00:00Z`);
  const end = new Date(`${data.endDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function UsageGraph({ rows, keyField, className = "" }) {
  if (!rows.length) {
    return (
      <p className="usage-empty-state">No range usage data for this period.</p>
    );
  }

  const maxTotal = Math.max(...rows.map((row) => row.total), 1);
  const graphClassName = ["usage-graph", className].filter(Boolean).join(" ");

  return (
    <div className={graphClassName}>
      {rows.map((row) => {
        const totalHeight = `${(row.total / maxTotal) * 100}%`;
        const memberHeight =
          row.total > 0 ? `${(row.members / row.total) * 100}%` : "0%";
        const guestHeight =
          row.total > 0 ? `${(row.guests / row.total) * 100}%` : "0%";

        return (
          <div key={row[keyField]} className="usage-graph-column">
            <span className="usage-graph-total">{row.total}</span>
            <div className="usage-graph-track">
              <div
                className="usage-graph-stack"
                style={{ height: totalHeight }}
                title={`${row.fullLabel ?? row.label}: ${row.members} members, ${row.guests} guests`}
              >
                <div
                  className="usage-graph-segment usage-graph-members"
                  style={{ height: memberHeight }}
                />
                <div
                  className="usage-graph-segment usage-graph-guests"
                  style={{ height: guestHeight }}
                />
              </div>
            </div>
            <span className="usage-graph-label">{row.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RangeUsagePage({ currentUserProfile }) {
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [activeView, setActiveView] = useState("filteredRange");
  const actorUsername = currentUserProfile?.auth?.username ?? "";

  const { data: dashboard, error } = useQuery({
    queryKey: ["range-usage-dashboard", actorUsername, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
      });
      const result = await fetchApi<{
        success: true;
        currentMonth?: unknown;
        currentWeek?: unknown;
        filteredRange?: unknown;
        myCurrentMonth?: unknown;
        myCurrentWeek?: unknown;
        myFilteredRange?: unknown;
      }>(`/api/range-usage-dashboard?${params.toString()}`, {
        headers: {
          "x-actor-username": actorUsername,
        },
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
    () => (dashboard ? dashboard[activeView] : null),
    [activeView, dashboard],
  );
  const activePersonalData = useMemo(() => {
    if (!dashboard) {
      return null;
    }

    const personalKey =
      activeView === "currentMonth"
        ? "myCurrentMonth"
        : activeView === "currentWeek"
          ? "myCurrentWeek"
          : "myFilteredRange";

    return dashboard[personalKey];
  }, [activeView, dashboard]);
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

  return (
    <div className="range-usage-dashboard">
      <p className="range-usage-title">Range Usage Dashboard</p>

      <form className="usage-filter-form usage-filter-panel">
        <label>
          From
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            max={endDate}
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            min={startDate}
            max={getTodayString()}
          />
        </label>
      </form>

      {error ? <p className="usage-error">{error instanceof Error ? error.message : "Unable to load range usage dashboard."}</p> : null}

      {dashboard ? (
        <>
          <div className="usage-cards">
            <UsageCard
              title="Current Month"
              data={dashboard.currentMonth}
              active={activeView === "currentMonth"}
              onClick={() => setActiveView("currentMonth")}
            />
            <UsageCard
              title="Current Week"
              data={dashboard.currentWeek}
              active={activeView === "currentWeek"}
              onClick={() => setActiveView("currentWeek")}
            />
            <UsageCard
              title="Selected Date Range"
              data={dashboard.filteredRange}
              active={activeView === "filteredRange"}
              onClick={() => setActiveView("filteredRange")}
            />
          </div>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>My Range Usage</h3>
              <p>{myRangeGraphConfig?.subtitle}</p>
            </div>
            {activePersonalData ? (
              <PersonalUsageGraph
                key={`personal-${activeView}-${activePersonalData.startDate}-${activePersonalData.endDate}`}
                rows={myRangeGraphConfig.rows}
                keyField={myRangeGraphConfig.keyField}
                className={myRangeGraphConfig.className}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Hour Of Day</h3>
              <p>{activeData?.label}</p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <HourlyUsageGraph
                key={`${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={activeData.hourly}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Day Of Week</h3>
              <p>Monday to Sunday for {activeData?.label}</p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <WeekdayUsageGraph
                key={`weekday-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={activeData.weekday}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Date In Month</h3>
              <p>
                Fixed day-of-month view from 1 to 31, aggregated across{" "}
                {activeData?.label}
              </p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <DailyUsageGraph
                key={`daily-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={aggregatedMonthRows}
              />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
