import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { formatClockTime, formatDate } from "../../../utils/dateTime";
import type { AttendanceReportRow } from "../../../api/reportingApi";
import { ReportingGraph } from "./ReportingGraph";
import type { useReportingPageState } from "./useReportingPageState";

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
            <th>Status</th>
            <th>Programme</th>
            <th>Role</th>
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
              <td>{row.membershipStatus || "-"}</td>
              <td>{row.programmeType || "-"}</td>
              <td>{row.role || "-"}</td>
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

type ReportingPageState = ReturnType<typeof useReportingPageState>;

function BreakdownList({
  items,
}: {
  items: Array<{ key: string; label: string; count: number }>;
}) {
  if (!items.length) {
    return <p className="reporting-breakdown-empty">No grouped data available.</p>;
  }

  return (
    <div className="reporting-breakdown-list">
      {items.map((item) => (
        <p key={item.key}>
          <strong>{item.count}</strong> {item.label}
        </p>
      ))}
    </div>
  );
}

export function ReportingDesktopView({
  aggregatedMonthRows,
  attendanceBreakdown,
  data,
  endDate,
  error,
  exportError,
  getTodayString,
  handleExport,
  hasDataSource,
  includeGuests,
  includeMembers,
  isFetching,
  rangeLabel,
  setEndDate,
  setIncludeGuests,
  setIncludeMembers,
  setStartDate,
  startDate,
}: ReportingPageState) {
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

      {!hasDataSource ? <p className="usage-error">Select Members, Guests, or both.</p> : null}
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
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Membership Status Breakdown</p>
              <BreakdownList items={attendanceBreakdown.membershipStatuses} />
            </div>
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Programme Breakdown</p>
              <BreakdownList items={attendanceBreakdown.programmeTypes} />
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
              <p>Rows now include membership status, programme type, role, and guest attendance details.</p>
            </div>
            <ReportingTable rows={data.rows} />
          </section>
        </>
      ) : null}
    </div>
  );
}
