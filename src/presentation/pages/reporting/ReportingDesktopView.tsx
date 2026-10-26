import { formatDate } from "../../../utils/dateTime";
import type { AttendanceReportRow, MemberJourneyReportRow } from "../../../api/reportingApi";
import { ReportingGraph } from "./ReportingGraph";
import { MemberRangeAttendanceSection } from "./MemberRangeAttendanceSection";
import { formatAttendanceReportRow, formatMemberJourneyRow, REPORTING_PREVIEW_LIMIT } from "./reportingPresentation";
import { MemberJourneySummary, ReportingErrors, ReportingFilters, ReportingGraphLegend, ReportingSummaryCards } from "./ReportingSharedSections";
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
          {rows.slice(0, REPORTING_PREVIEW_LIMIT).map((row) => {
            const display = formatAttendanceReportRow(row);
            return (
              <tr key={row.id}>
                <td>{display.date}</td>
                <td>{display.time}</td>
                <td>{display.type}</td>
                <td>{display.memberType}</td>
                <td>{display.programme}</td>
                <td>{display.role}</td>
                <td>{display.name}</td>
                <td>{display.archeryGb}</td>
                <td>{display.attendingWith}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > REPORTING_PREVIEW_LIMIT ? (
        <p className="reporting-table-note">
          Showing the first {REPORTING_PREVIEW_LIMIT} rows. Export includes all {rows.length} rows.
        </p>
      ) : null}
    </div>
  );
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
          {rows.slice(0, REPORTING_PREVIEW_LIMIT).map((row) => {
            const display = formatMemberJourneyRow(row);
            return (
              <tr key={row.id}>
                <td>{display.joined}</td>
                <td>{display.name}</td>
                <td>{display.memberType}</td>
                <td>{display.converted}</td>
                <td>{display.convertedAt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > REPORTING_PREVIEW_LIMIT ? (
        <p className="reporting-table-note">
          Showing the first {REPORTING_PREVIEW_LIMIT} journey rows from {rows.length} participants in this cohort.
        </p>
      ) : null}
    </div>
  );
}

type ReportingPageState = ReturnType<typeof useReportingPageState>;

export function ReportingDesktopView(state: ReportingPageState) {
  const {
    aggregatedMonthRows,
    data,
    endDate,
    isLoadingMemberJourneys,
    memberJourneyData,
    memberRangeAttendance,
    rangeLabel,
    startDate,
  } = state;
  return (
    <div className="range-usage-dashboard reporting-page">
      <p className="range-usage-title">Reporting</p>
      <p className="reporting-table-note">Access event totals include every successful member sign-in and on-site check-in, plus guest sign-ins. Match the Dashboard by selecting the same dates and comparing member events; range visits use a separate two-hour rule.</p>

      <ReportingFilters state={state} />
      <ReportingErrors state={state} />

      <MemberRangeAttendanceSection attendance={memberRangeAttendance} />

      {data ? (
        <>
          <ReportingSummaryCards state={state} />

          <ProfileAccordion title="Usage By Date In Month" detail={`Fixed day-of-month view from 1 to 31, aggregated across ${rangeLabel}`}>
            <ReportingGraphLegend />
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
                <MemberJourneySummary state={state} />
                <MemberJourneyTable rows={memberJourneyData.rows} />
              </>
            ) : null}
          </ProfileAccordion>
        </>
      ) : null}
    </div>
  );
}
