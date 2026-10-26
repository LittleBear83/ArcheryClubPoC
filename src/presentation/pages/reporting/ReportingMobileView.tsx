import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { formatDate } from "../../../utils/dateTime";
import { ReportingGraph } from "./ReportingGraph";
import { MemberRangeAttendanceSection } from "./MemberRangeAttendanceSection";
import { attendanceReportItems, memberJourneyItems, REPORTING_PREVIEW_LIMIT } from "./reportingPresentation";
import { MemberJourneySummary, ReportingErrors, ReportingFilters, ReportingGraphLegend, ReportingSummaryCards } from "./ReportingSharedSections";
import type { useReportingPageState } from "./useReportingPageState";
import { ProfileAccordion } from "../profile/ProfileAccordion";

type ReportingPageState = ReturnType<typeof useReportingPageState>;

export function ReportingMobileView(state: ReportingPageState) {
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
    <div className="range-usage-dashboard reporting-page reporting-page--mobile">
      <p className="range-usage-title">Reporting</p>
      <p className="reporting-table-note">Member access events include sign-ins and on-site check-ins. Match Dashboard totals using the same dates; range visits use a two-hour rule.</p>

      <ReportingFilters state={state} mobile />
      <ReportingErrors state={state} />

      <MemberRangeAttendanceSection attendance={memberRangeAttendance} mobile />

      {data ? (
        <>
          <ReportingSummaryCards state={state} />

          <ProfileAccordion title="Usage By Date" detail={`Fixed day-of-month view across ${rangeLabel}.`}>
            <ReportingGraphLegend />
            <div className="reporting-mobile-graph-wrap">
              <ReportingGraph rows={aggregatedMonthRows} />
            </div>
          </ProfileAccordion>

          <ProfileAccordion title="New Member Journey Funnel" detail={`Participants who started between ${formatDate(memberJourneyData?.startDate ?? startDate)} and ${formatDate(memberJourneyData?.endDate ?? endDate)}.`}>
            {isLoadingMemberJourneys && !memberJourneyData ? (
              <p>Loading member journey reporting...</p>
            ) : memberJourneyData?.rows.length === 0 ? (
              <MobileEmptyState message="No participant journeys started in this period." />
            ) : memberJourneyData ? (
              <>
                <MemberJourneySummary state={state} />
                <MobileCardList className="reporting-mobile-row-list">
                  {memberJourneyData.rows.slice(0, REPORTING_PREVIEW_LIMIT).map((row) => (
                    <article key={row.id} className="reporting-mobile-row-card">
                      <p className="reporting-mobile-row-title">{row.name}</p>
                      <MobileKeyValueList items={memberJourneyItems(row)} />
                    </article>
                  ))}
                </MobileCardList>
              </>
            ) : null}
          </ProfileAccordion>

          <ProfileAccordion title="Report Rows" detail={`Showing ${Math.min(data.rows.length, REPORTING_PREVIEW_LIMIT)} of ${data.rows.length} row${data.rows.length === 1 ? "" : "s"}.`}>
            {data.rows.length > 0 ? (
              <MobileCardList className="reporting-mobile-row-list">
                {data.rows.slice(0, REPORTING_PREVIEW_LIMIT).map((row) => (
                  <article key={row.id} className="reporting-mobile-row-card">
                    <p className="reporting-mobile-row-title">{row.name}</p>
                    <MobileKeyValueList items={attendanceReportItems(row)} />
                  </article>
                ))}
              </MobileCardList>
            ) : (
              <MobileEmptyState message="No rows match the selected data." />
            )}
          </ProfileAccordion>
        </>
      ) : null}
    </div>
  );
}
