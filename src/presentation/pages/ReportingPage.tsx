import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { formatClockTime, formatDate, formatDateRangeLabel } from "../../utils/dateTime";
import { getAttendanceReport } from "../../api/reportingApi";
import { hasPermission } from "../../utils/userProfile";
import type {
  AttendanceReport,
  AttendanceReportDailyRow,
  AttendanceReportRow,
} from "../../api/reportingApi";
import type { UserProfile } from "../../types/app";

function getUtcDateString(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function getTodayString() {
  return getUtcDateString(new Date());
}

function getMonthStartString() {
  const today = new Date();

  return getUtcDateString(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
  );
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? "");

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(report: AttendanceReport) {
  const headers = [
    "Date",
    "Time",
    "Type",
    "Name",
    "Username",
    "Login Method",
    "Archery GB Number",
    "Attending With",
    "Attending With Username",
  ];
  const lines = report.rows.map((row) =>
    [
      formatDate(row.date),
      formatClockTime(row.time),
      row.type,
      row.name,
      row.username,
      row.loginMethod,
      row.archeryGbMembershipNumber,
      row.attendingWith,
      row.attendingWithUsername,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\r\n");
}

async function saveCsv(filename: string, csv: string) {
  const pickerWindow = window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (contents: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  if (pickerWindow.showSaveFilePicker) {
    const fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "CSV file",
          accept: { "text/csv": [".csv"] },
        },
      ],
    });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ReportingGraph({ rows }: { rows: AttendanceReportDailyRow[] }) {
  if (!rows.length) {
    return <p className="usage-empty-state">No reporting data for this period.</p>;
  }

  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  return (
    <div className="usage-graph usage-graph-date reporting-graph">
      {rows.map((row) => {
        const totalHeight = `${(row.total / maxTotal) * 100}%`;
        const memberHeight =
          row.total > 0 ? `${(row.members / row.total) * 100}%` : "0%";
        const guestHeight =
          row.total > 0 ? `${(row.guests / row.total) * 100}%` : "0%";

        return (
          <div key={row.usageDate} className="usage-graph-column">
            <span className="usage-graph-total">{row.total}</span>
            <div className="usage-graph-track">
              <div
                className="usage-graph-stack"
                style={{ height: totalHeight }}
                title={`${row.fullLabel}: ${row.members} members, ${row.guests} guests`}
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

function aggregateMonthDayRows(rows: AttendanceReportDailyRow[]) {
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

function ReportingTable({ rows }: { rows: AttendanceReportRow[] }) {
  if (!rows.length) {
    return <p className="usage-empty-state">No rows match the selected data.</p>;
  }

  return (
    <div className="reporting-table-wrap">
      <table className="committee-roles-table reporting-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Type</th>
            <th>Name</th>
            <th>Archery GB</th>
            <th>Attending With</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.date)}</td>
              <td>{formatClockTime(row.time)}</td>
              <td>{row.type}</td>
              <td>{row.name}</td>
              <td>{row.archeryGbMembershipNumber || "-"}</td>
              <td>{row.attendingWith || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 ? (
        <p className="reporting-table-note">
          Showing the first 25 rows. Export includes all {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
}

export function ReportingPage({
  currentUserProfile,
}: {
  currentUserProfile: UserProfile | null;
}) {
  const [startDate, setStartDate] = useState(getMonthStartString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [includeMembers, setIncludeMembers] = useState(true);
  const [includeGuests, setIncludeGuests] = useState(true);
  const [exportError, setExportError] = useState("");
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canViewReports = hasPermission(currentUserProfile, "view_reports");
  const hasDataSource = includeMembers || includeGuests;

  const { data, error, isFetching } = useQuery({
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
    () => formatDateRangeLabel(startDate, endDate),
    [endDate, startDate],
  );
  const aggregatedMonthRows = useMemo(
    () => (data ? aggregateMonthDayRows(data.daily) : []),
    [data],
  );

  const handleExport = async () => {
    if (!data) {
      return;
    }

    setExportError("");

    try {
      await saveCsv(
        `attendance-report-${data.startDate}-to-${data.endDate}.csv`,
        buildCsv(data),
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

  if (!canViewReports) {
    return <p>You do not have permission to view reports.</p>;
  }

  return (
    <div className="range-usage-dashboard reporting-page">
      <p className="range-usage-title">Reporting</p>

      <section className="usage-filter-panel reporting-filter-panel">
        <form className="usage-filter-form reporting-filter-form">
          <label>
            <DatePicker
              label="Date from"
              value={startDate}
              onChange={setStartDate}
              max={endDate}
            />
          </label>

          <label>
            <DatePicker
              label="Date to"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
              max={getTodayString()}
            />
          </label>

          <div className="reporting-source-fieldset" role="group" aria-label="Included data sources">
            <span className="reporting-source-label">Include</span>
            <label className="profile-checkbox">
              <input
                type="checkbox"
                checked={includeMembers}
                onChange={(event) => setIncludeMembers(event.target.checked)}
              />
              <span>Members</span>
            </label>
            <label className="profile-checkbox">
              <input
                type="checkbox"
                checked={includeGuests}
                onChange={(event) => setIncludeGuests(event.target.checked)}
              />
              <span>Guests</span>
            </label>
          </div>

          <div className="reporting-export-panel">
            <Button
              type="button"
              onClick={handleExport}
              disabled={!data || !hasDataSource || isFetching}
            >
              Export CSV
            </Button>
          </div>
        </form>
      </section>

      {!hasDataSource ? (
        <p className="usage-error">Select Members, Guests, or both.</p>
      ) : null}
      {error ? (
        <p className="usage-error">
          {error instanceof Error
            ? error.message
            : "Unable to load the attendance report."}
        </p>
      ) : null}
      {exportError ? <p className="usage-error">{exportError}</p> : null}

      {data ? (
        <>
          <div className="usage-cards reporting-summary-cards">
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Selected Range</p>
              <p className="usage-card-range">{rangeLabel}</p>
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
            </div>
          </div>

          <section className="usage-hourly-panel reporting-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Date In Month</h3>
              <p>
                Fixed day-of-month view from 1 to 31, aggregated across{" "}
                {rangeLabel}
              </p>
            </div>
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
            <ReportingGraph rows={aggregatedMonthRows} />
          </section>

          <section className="usage-hourly-panel reporting-panel">
            <div className="usage-hourly-header">
              <h3>Report Rows</h3>
              <p>
                Guest rows include Archery GB number and attending with details.
              </p>
            </div>
            <ReportingTable rows={data.rows} />
          </section>
        </>
      ) : null}
    </div>
  );
}
