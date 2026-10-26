import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { MobileActionBar } from "../../components/mobile/MobileActionBar";
import { ProfileAccordion } from "../profile/ProfileAccordion";
import type { useReportingPageState } from "./useReportingPageState";
import { formatPercentage } from "./reportingPresentation";

type ReportingPageState = ReturnType<typeof useReportingPageState>;

export function ReportingFilters({ state, mobile = false, showExport = true }: { state: ReportingPageState; mobile?: boolean; showExport?: boolean }) {
  const {
    data, endDate, handleExport, hasDataSource, includeGuests, includeMembers, isFetching,
    maxEndDate, minStartDate, setEndDate, setIncludeGuests, setIncludeMembers, setStartDate, startDate,
  } = state;
  const exportButton = (
    <Button type="button" onClick={handleExport} disabled={!data || !hasDataSource || isFetching} fullWidth={mobile}>
      Export CSV
    </Button>
  );

  return (
    <section className={`usage-filter-panel reporting-filter-panel${mobile ? " reporting-filter-panel--mobile" : ""}`}>
      <form className={`usage-filter-form reporting-filter-form${mobile ? " reporting-filter-form--mobile" : ""}`}>
        <label>
          <DatePicker label="Date from" value={startDate} onChange={setStartDate} min={minStartDate} max={endDate} />
        </label>
        <label>
          <DatePicker label="Date to" value={endDate} onChange={setEndDate} min={startDate} max={maxEndDate} />
        </label>
        <div className={`reporting-source-fieldset${mobile ? " reporting-source-fieldset--mobile" : ""}`} role="group" aria-label="Included data sources">
          <span className="reporting-source-label">Include</span>
          <label className="profile-checkbox">
            <input type="checkbox" checked={includeMembers} onChange={(event) => setIncludeMembers(event.target.checked)} />
            <span>Members</span>
          </label>
          <label className="profile-checkbox">
            <input type="checkbox" checked={includeGuests} onChange={(event) => setIncludeGuests(event.target.checked)} />
            <span>Guests</span>
          </label>
        </div>
        {showExport ? (mobile ? <MobileActionBar>{exportButton}</MobileActionBar> : <div className="reporting-export-panel">{exportButton}</div>) : null}
      </form>
    </section>
  );
}

export function ReportingErrors({ state }: { state: ReportingPageState }) {
  const { error, exportError, hasDataSource, memberJourneyError } = state;
  return <>
    {!hasDataSource ? <p className="usage-error">Select Members, Guests, or both.</p> : null}
    {error ? <p className="usage-error">{error instanceof Error ? error.message : "Unable to load the attendance report."}</p> : null}
    {exportError ? <p className="usage-error">{exportError}</p> : null}
    {memberJourneyError ? <p className="usage-error">{memberJourneyError instanceof Error ? memberJourneyError.message : "Unable to load member journey reporting."}</p> : null}
  </>;
}

export function BreakdownList({ items }: { items: Array<{ key: string; label: string; count: number }> }) {
  if (!items.length) return <p className="reporting-breakdown-empty">No grouped data available.</p>;
  return <div className="reporting-breakdown-list">
    {items.map((item) => <p key={item.key}><strong>{item.count}</strong> {item.label}</p>)}
  </div>;
}

export function ReportingSummaryCards({ state }: { state: ReportingPageState }) {
  const { attendanceBreakdown, data, rangeLabel } = state;
  if (!data) return null;
  return <div className="usage-cards reporting-summary-cards">
    <ProfileAccordion title="Selected Range" detail={rangeLabel}>
      <p className="usage-card-range">{rangeLabel}</p>
      <div className="usage-card-stats">
        <div><span className="usage-stat-label">Member access events</span><strong>{data.members}</strong></div>
        <div><span className="usage-stat-label">Guest logins</span><strong>{data.guests}</strong></div>
        <div><span className="usage-stat-label">Total access events</span><strong>{data.total}</strong></div>
      </div>
    </ProfileAccordion>
    <ProfileAccordion title="Member Type Breakdown">
      <p className="reporting-table-note">Current active profiles, including members with no visits.</p>
      <BreakdownList items={attendanceBreakdown.membershipStatuses} />
    </ProfileAccordion>
    <ProfileAccordion title="Programme Breakdown">
      <p className="reporting-table-note">Logins in the selected range.</p>
      <BreakdownList items={attendanceBreakdown.programmeTypes} />
    </ProfileAccordion>
  </div>;
}

export function ReportingGraphLegend() {
  return <div className="usage-graph-legend">
    <span className="usage-legend-item"><span className="usage-legend-swatch usage-graph-members" />Members</span>
    <span className="usage-legend-item"><span className="usage-legend-swatch usage-graph-guests" />Guests</span>
  </div>;
}

export function MemberJourneySummary({ state }: { state: ReportingPageState }) {
  const summary = state.memberJourneyData?.summary;
  if (!summary) return null;
  return <div className="usage-cards reporting-summary-cards reporting-journey-summary">
    <div className="usage-card reporting-summary-card">
      <p className="usage-card-title">New Starters</p>
      <div className="reporting-breakdown-list"><p><strong>{summary.totalParticipants}</strong> people started</p></div>
    </div>
    <div className="usage-card reporting-summary-card">
      <p className="usage-card-title">Full Member Conversions</p>
      <div className="reporting-breakdown-list"><p><strong>{summary.convertedToMembers}</strong>{" "}converted</p></div>
    </div>
    <div className="usage-card reporting-summary-card">
      <p className="usage-card-title">Beginners To Member Rate</p>
      <div className="reporting-breakdown-list"><p><strong>{formatPercentage(summary.beginnersCourseConversionRate)}</strong>{" "}overall</p></div>
    </div>
  </div>;
}
