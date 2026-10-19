import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { formatClockTime, formatDate } from "../../../utils/dateTime";
import type { AttendanceReportRow, MemberJourneyReportRow } from "../../../api/reportingApi";
import { ReportingGraph } from "./ReportingGraph";
import { MemberRangeAttendanceSection } from "./MemberRangeAttendanceSection";
import { formatMemberType } from "./reportingUtils";
import type { useReportingPageState } from "./useReportingPageState";
import { ProfileAccordion } from "../profile/ProfileAccordion";

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
            <th>Member type</th>
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
              <td>{formatMemberType(row.membershipStatus)}</td>
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

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function MemberJourneyTable({ rows }: { rows: MemberJourneyReportRow[] }) {
  if (!rows.length) {
    return <p className="usage-empty-state">No participant journeys started in the selected date range.</p>;
  }

  return (
    <div className="reporting-table-wrap">
      <table className="committee-roles-table reporting-table">
        <thead>
          <tr>
            <th>Joined</th>
            <th>Name</th>
            <th>Member type</th>
            <th>Converted</th>
            <th>Converted At</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.joinedAtDate)}</td>
              <td>{row.name}</td>
              <td>{formatMemberType(row.membershipStatus)}</td>
              <td>{row.convertedToMember ? "Yes" : "No"}</td>
              <td>{row.convertedAtDate ? formatDate(row.convertedAtDate) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 25 ? (
        <p className="reporting-table-note">
          Showing the first 25 journey rows from {rows.length} participants in this cohort.
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
  isLoadingMemberJourneys,
  memberJourneyData,
  memberJourneyError,
  memberRangeAttendance,
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
      <p className="reporting-table-note">Access event totals include every successful member sign-in and on-site check-in, plus guest sign-ins. Match the Dashboard by selecting the same UTC dates and comparing member events; range visits use a separate two-hour rule.</p>

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
              <span>Portal accounts</span>
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

      {!hasDataSource ? <p className="usage-error">Select portal accounts, guests, or both.</p> : null}
      {error ? (
        <p className="usage-error">
          {error instanceof Error
            ? error.message
            : "Unable to load the attendance report."}
        </p>
      ) : null}
      {exportError ? <p className="usage-error">{exportError}</p> : null}
      {memberJourneyError ? (
        <p className="usage-error">
          {memberJourneyError instanceof Error
            ? memberJourneyError.message
            : "Unable to load member journey reporting."}
        </p>
      ) : null}

      <MemberRangeAttendanceSection attendance={memberRangeAttendance} />

      {data ? (
        <>
          <div className="usage-cards reporting-summary-cards">
            <ProfileAccordion title="Selected Range" detail={rangeLabel}>
              <p className="usage-card-range">{rangeLabel}</p>
              <div className="usage-card-stats">
                <div>
                  <span className="usage-stat-label">Member access events</span>
                  <strong>{data.members}</strong>
                </div>
                <div>
                  <span className="usage-stat-label">Non-member logins</span>
                  <strong>{data.nonMembers}</strong>
                </div>
                <div>
                  <span className="usage-stat-label">Guest logins</span>
                  <strong>{data.guests}</strong>
                </div>
                <div>
                  <span className="usage-stat-label">Total access events</span>
                  <strong>{data.total}</strong>
                </div>
              </div>
            </ProfileAccordion>
            <ProfileAccordion title="Member Type Breakdown">
              <p className="reporting-table-note">Current active profiles, including people with no visits.</p>
              <BreakdownList items={attendanceBreakdown.membershipStatuses} />
            </ProfileAccordion>
            <ProfileAccordion title="Programme Breakdown">
              <p className="reporting-table-note">Logins in the selected range.</p>
              <BreakdownList items={attendanceBreakdown.programmeTypes} />
            </ProfileAccordion>
          </div>

          <ProfileAccordion title="Usage By Date In Month" detail={`Fixed day-of-month view from 1 to 31, aggregated across ${rangeLabel}`}>
            <div className="usage-graph-legend">
              <span className="usage-legend-item">
                <span className="usage-legend-swatch usage-graph-members" />
                Members
              </span>
              <span className="usage-legend-item">
                <span className="usage-legend-swatch usage-graph-non-members" />
                Non-members
              </span>
              <span className="usage-legend-item">
                <span className="usage-legend-swatch usage-graph-guests" />
                Guests
              </span>
            </div>
            <ReportingGraph rows={aggregatedMonthRows} />
          </ProfileAccordion>

          <ProfileAccordion title="Report Rows" detail="Member type, programme, role, and guest attendance details">
            <ReportingTable rows={data.rows} />
          </ProfileAccordion>

          <ProfileAccordion title="New Member Journey Funnel" detail={`Participants who started between ${formatDate(memberJourneyData?.startDate ?? startDate)} and ${formatDate(memberJourneyData?.endDate ?? endDate)}.`}>
            {isLoadingMemberJourneys && !memberJourneyData ? (
              <p>Loading member journey reporting...</p>
            ) : memberJourneyData?.rows.length === 0 ? (
              <p className="usage-empty-state">No participant journeys started in this period.</p>
            ) : memberJourneyData ? (
              <>
                <div className="usage-cards reporting-summary-cards reporting-journey-summary">
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">New Starters</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>{memberJourneyData.summary.totalParticipants}</strong> people started
                      </p>
                    </div>
                  </div>
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">Full Member Conversions</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>{memberJourneyData.summary.convertedToMembers}</strong>{" "}
                        converted
                      </p>
                    </div>
                  </div>
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">Beginners To Member Rate</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>
                          {formatPercentage(
                            memberJourneyData.summary.beginnersCourseConversionRate,
                          )}
                        </strong>{" "}
                        overall
                      </p>
                    </div>
                  </div>
                </div>
                <MemberJourneyTable rows={memberJourneyData.rows} />
              </>
            ) : null}
          </ProfileAccordion>
        </>
      ) : null}
    </div>
  );
}
