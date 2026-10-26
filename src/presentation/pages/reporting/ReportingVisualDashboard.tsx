import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { getRangeVisitReport } from "../../../api/reportingApi";
import { formatDate } from "../../../utils/dateTime";
import { useTheme } from "../../../theme/useTheme";
import { Button } from "../../components/Button";
import { ProfileAccordion } from "../profile/ProfileAccordion";
import { MemberRangeAttendanceSection } from "./MemberRangeAttendanceSection";
import { RangeVisitHistory } from "./RangeVisitHistory";
import { ReportingExportModal } from "./ReportingExportModal";
import { BreakdownList, ReportingErrors, ReportingFilters } from "./ReportingSharedSections";
import { ReportingDashboard } from "./dashboard/ReportingDashboard";
import "./dashboard/reportingDashboard.css";
import { buildAccessInsights, buildJourneyInsights, buildVisitInsights, filterAccessRows, focusChartValues, type AccessSelection } from "./reportingInsights";
import { getRangeVisitPeriod } from "./rangeVisitPeriods";
import type { useReportingPageState } from "./useReportingPageState";

type ReportingState = ReturnType<typeof useReportingPageState>;

function Kpi({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <div className="reporting-visual-kpi">
    <span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("en-GB") : value}</strong><small>{detail}</small>
  </div>;
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="reporting-visual-panel">
    <header><h2>{title}</h2><p>{subtitle}</p></header>{children}
  </section>;
}

function EmptyChart() {
  return <p className="usage-empty-state">No recorded activity in this period.</p>;
}

export function ReportingVisualDashboard({ state }: { state: ReportingState }) {
  const { theme } = useTheme();
  const [selection, setSelection] = useState<AccessSelection>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [customFiltersOpen, setCustomFiltersOpen] = useState(false);
  const [visitHour, setVisitHour] = useState<number | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const { data, memberJourneyData, actorUsername, startDate, endDate, memberRangeAttendance } = state;
  const colors = [theme.variables["--accent"], theme.variables["--info"], theme.variables["--success"], theme.variables["--text-muted"]];
  const muiTheme = useMemo(() => createTheme({ palette: {
    mode: theme.colorScheme,
    primary: { main: theme.variables["--accent"] },
    background: { paper: theme.variables["--bg-elevated"] },
    text: { primary: theme.variables["--text"], secondary: theme.variables["--text-muted"] },
  } }), [theme]);
  const insights = useMemo(() => data ? buildAccessInsights(data) : null, [data]);
  const journeyGroups = useMemo(() => memberJourneyData ? buildJourneyInsights(memberJourneyData) : [], [memberJourneyData]);
  const validSelection = selection?.kind === "bucket" && (
    selection.startDate < startDate || selection.endDate > endDate ||
    !insights?.trend.some((bucket) => bucket.startDate === selection.startDate && bucket.endDate === selection.endDate)
  ) ? null : selection;
  const selectedRows = data ? filterAccessRows(data.rows, validSelection) : [];
  const selectedBucket = validSelection?.kind === "bucket" ? validSelection.startDate : null;
  const selectedWeekday = validSelection?.kind === "weekday" ? validSelection.day : null;
  const selectedBucketIndex = selectedBucket ? insights?.trend.findIndex((bucket) => bucket.startDate === selectedBucket) ?? -1 : null;
  const visitQuery = useQuery({
    queryKey: ["reporting-visual-visits", actorUsername, startDate, endDate],
    queryFn: async () => (await getRangeVisitReport(actorUsername, startDate, endDate)).report,
    enabled: memberRangeAttendance.canView && Boolean(actorUsername),
  });
  const visits = visitQuery.data;
  const visitInsights = useMemo(() => visits ? buildVisitInsights(visits) : null, [visits]);
  const selectedVisits = visits?.rows.filter((row) => visitHour === null || Number(row.time.slice(0, 2)) === visitHour) ?? [];
  const selectedJourneys = memberJourneyData?.rows.filter((row) => !selectedOrigin || row.originCourseType === selectedOrigin) ?? [];
  const selectedJourneyConversions = selectedJourneys.filter((row) => row.convertedToMember).length;

  const selectionLabel = validSelection?.kind === "bucket"
    ? `${formatDate(validSelection.startDate)} to ${formatDate(validSelection.endDate)}`
    : validSelection?.kind === "weekday" ? `${insights?.weekdays[validSelection.day].label} across selected dates` : "all selected dates";

  function applyPeriod(period: "current-month" | "last-30-days" | "last-90-days" | "year-to-date") {
    const range = getRangeVisitPeriod(period, new Date());
    state.setStartDate(range.startDate);
    state.setEndDate(range.endDate);
    setSelection(null);
    setVisitHour(null);
  }

  const activePeriod = (["current-month", "last-30-days", "last-90-days", "year-to-date"] as const)
    .find((period) => {
      const range = getRangeVisitPeriod(period, new Date());
      return range.startDate === startDate && range.endDate === endDate;
    });

  return <div className="range-usage-dashboard reporting-page reporting-visual-page">
    <header className="reporting-visual-header">
      <div><h1 className="range-usage-title">Reporting</h1>
        <p className="reporting-table-note">Understand recorded activity, member engagement and programme journeys.</p></div>
      <span className="reporting-visual-date">{formatDate(startDate)} – {formatDate(endDate)} · UTC</span>
    </header>

    <div className="reporting-visual-toolbar">
      <div className="reporting-visual-toolbar-group" role="group" aria-label="Date range">
        <span className="reporting-visual-toolbar-label">Date range</span>
        <div className="reporting-visual-presets">
          {([[
            "current-month", "This month"], ["last-30-days", "Last 30 days"],
            ["last-90-days", "Last 90 days"], ["year-to-date", "Year to date"],
          ] as const).map(([value, label]) =>
            <Button key={value} size="sm" variant="secondary" aria-pressed={activePeriod === value} onClick={() => applyPeriod(value)}>{label}</Button>)}
          <Button size="sm" variant="secondary" aria-expanded={customFiltersOpen} aria-controls="reporting-custom-filters" onClick={() => setCustomFiltersOpen((open) => !open)}>Custom dates &amp; sources</Button>
        </div>
      </div>
      <div className="reporting-visual-toolbar-group" role="group" aria-label="Exports">
        <span className="reporting-visual-toolbar-label">Exports</span>
        <div className="reporting-visual-export-actions">
          <Button size="sm" variant="secondary" onClick={() => setExportOpen(true)}>Export data</Button>
          <Button size="sm" variant="secondary" disabled={!data} title="Opens the print dialog; choose Save as PDF" onClick={() => window.print()}>Export visuals as PDF</Button>
        </div>
      </div>
    </div>
    {customFiltersOpen ? <div id="reporting-custom-filters" className="reporting-visual-custom-filters"><ReportingFilters state={state} showExport={false} /></div> : null}
    {exportOpen ? <ReportingExportModal
      onClose={() => setExportOpen(false)}
      data={{ access: data, journeys: memberJourneyData, visits, followUp: memberRangeAttendance.data, accessSelection: validSelection }}
      canViewMemberVisits={memberRangeAttendance.canView}
      loading={{ access: state.isFetching, journeys: state.isLoadingMemberJourneys, visits: visitQuery.isFetching, "follow-up": memberRangeAttendance.isFetching }}
      initialVisitHour={visitHour}
      initialJourneyOrigin={selectedOrigin}
      initialFollowUpStatus={memberRangeAttendance.filter}
    /> : null}
    <ReportingErrors state={state} />
    {state.isFetching && !data ? <p role="status">Loading reporting data…</p> : null}

    {data && insights ? <ThemeProvider theme={muiTheme}>
      <section className="reporting-visual-kpis" aria-label="Access activity key figures">
        <Kpi label="Access events" value={data.total} detail="Member sign-ins and guest sign-ins" />
        <Kpi label="Member access events" value={data.members} detail="Includes on-site check-ins and account sign-ins" />
        <Kpi label="Guest sign-ins" value={data.guests} detail="Each recorded guest sign-in" />
        <Kpi label="Accounts with access activity" value={insights.uniqueMemberLogins} detail="Distinct usernames among member access events" />
      </section>
      <p className="reporting-visual-definition">Access events are not range visits. A member may sign in more than once without attending the range.</p>

      <div className="reporting-visual-grid">
        <ChartPanel title="Access activity over time" subtitle={insights.trend.length > 62 ? "Weekly totals" : data.daily.length > 62 ? "Weekly totals" : "Daily totals"}>
          {data.total ? <div className="reporting-visual-chart-scroll"><div style={{ minWidth: Math.max(560, insights.trend.length * 24) }}>
            <BarChart height={240}
              xAxis={[{ data: insights.trend.map((bucket) => bucket.label), scaleType: "band", tickLabelInterval: (_, index) => index % Math.max(1, Math.ceil(insights.trend.length / 12)) === 0 }]}
              series={[
                { data: focusChartValues(insights.trend.map((bucket) => bucket.members), selectedBucketIndex), label: "Member access events", stack: "events", color: colors[0] },
                { data: focusChartValues(insights.trend.map((bucket) => bucket.guests), selectedBucketIndex), label: "Guest sign-ins", stack: "events", color: colors[1] },
              ]}
              onItemClick={(_, item) => { const bucket = insights.trend[item.dataIndex]; if (bucket.total > 0) setSelection({ kind: "bucket", startDate: bucket.startDate, endDate: bucket.endDate }); }}
            />
          </div></div> : <EmptyChart />}
          <label className="reporting-visual-drill-control">Inspect dates
            <select value={validSelection?.kind === "bucket" ? validSelection.startDate : ""} onChange={(event) => {
              const bucket = insights.trend.find((item) => item.startDate === event.target.value);
              setSelection(bucket ? { kind: "bucket", startDate: bucket.startDate, endDate: bucket.endDate } : null);
            }}><option value="">All dates</option>{insights.trend.filter((bucket) => bucket.total > 0).map((bucket) => <option key={bucket.startDate} value={bucket.startDate}>{formatDate(bucket.startDate)}{bucket.startDate !== bucket.endDate ? ` to ${formatDate(bucket.endDate)}` : ""} · {bucket.total}</option>)}</select>
          </label>
          {selectedBucket ? <div className="reporting-visual-selection" role="status">
            <strong>{selectedRows.length} events · {selectionLabel}</strong>
            <span>{selectedRows.filter((row) => row.type === "Member").length} member access events · {selectedRows.filter((row) => row.type === "Guest").length} guest sign-ins</span>
            <Button size="sm" variant="ghost" onClick={() => setSelection(null)}>Show all dates</Button>
          </div> : <p className="reporting-visual-hint">Select a bar or date to focus the chart and inspect its events.</p>}
        </ChartPanel>
        <ChartPanel title="Activity by weekday" subtitle="Total recorded access events for each UTC weekday">
          {data.total ? <BarChart height={240} hideLegend
            xAxis={[{ data: insights.weekdays.map((day) => day.label), scaleType: "band" }]}
            series={[{ data: focusChartValues(insights.weekdays.map((day) => day.total), selectedWeekday), label: "Access events", color: colors[0] }]}
            onItemClick={(_, item) => { if (insights.weekdays[item.dataIndex].total > 0) setSelection({ kind: "weekday", day: item.dataIndex }); }}
          /> : <EmptyChart />}
          <label className="reporting-visual-drill-control">Inspect weekday
            <select value={validSelection?.kind === "weekday" ? validSelection.day : ""} onChange={(event) => setSelection(event.target.value === "" ? null : { kind: "weekday", day: Number(event.target.value) })}>
              <option value="">All weekdays</option>{insights.weekdays.filter((day) => day.total > 0).map((day) => <option key={day.day} value={day.day}>{day.label} · {day.total}</option>)}
            </select>
          </label>
          {selectedWeekday !== null ? <div className="reporting-visual-selection" role="status">
            <strong>{selectedRows.length} events · {selectionLabel}</strong>
            <span>Across {data.daily.length} UTC dates in the selected range.</span>
            <Button size="sm" variant="ghost" onClick={() => setSelection(null)}>Show all weekdays</Button>
          </div> : <p className="reporting-visual-hint">Select a weekday to focus the chart and inspect its events.</p>}
        </ChartPanel>
      </div>

      <div className="reporting-visual-grid reporting-visual-grid--secondary">
        <ChartPanel title="Member access methods" subtitle="Member events only; all use the selected date range">
          {data.members ? <PieChart height={210} hideLegend
            series={[{ innerRadius: 50, outerRadius: 85, paddingAngle: 2, data: insights.methods
              .map((method, index) => ({ id: method.method, value: method.count, label: method.label, color: colors[index % colors.length] }))
              .filter((method) => method.value > 0) }]}
          /> : <EmptyChart />}
          <ul className="reporting-visual-legend">{insights.methods.map((method) =>
            <li key={method.method}>{method.label} <strong>{method.count}</strong></li>)}</ul>
        </ChartPanel>
        <ChartPanel title="Committee cues" subtitle="Questions suggested by recorded activity">
          <div className="reporting-visual-cues">
            <p><strong>{insights.busiestDay ? formatDate(insights.busiestDay.usageDate) : "No busiest day yet"}</strong><span>Busiest recorded day · {insights.busiestDay?.total ?? 0} access events</span></p>
            <p><strong>{insights.busiestWeekday?.label ?? "—"}</strong><span>Busiest weekday across the selected period · {insights.busiestWeekday?.total ?? 0} events</span></p>
            <p><strong>{Number(data.memberTypeCounts.find((row) => row.membership_status === "member")?.count ?? 0) + Number(data.memberTypeCounts.find((row) => row.membership_status === "associate-member")?.count ?? 0)}</strong><span>Current active member and associate member profiles · a snapshot, not a membership trend</span></p>
          </div>
        </ChartPanel>
      </div>

      {memberRangeAttendance.canView ? <section className="reporting-visual-section" aria-label="Recorded range visits">
        <header><h2>Recorded range visits</h2><p>RFID and on-site mobile check-ins within two hours count as one member visit. Each guest sign-in counts once.</p></header>
        {visitQuery.isPending || visitQuery.isFetching ? <p role="status">Loading range visits…</p> : null}
        {visitQuery.isError ? <p className="usage-error" role="alert">{visitQuery.error.message}</p> : null}
        {visits && visitInsights && !visitQuery.isFetching ? <>
          <div className="reporting-visual-kpis">
            <Kpi label="Range visits" value={visits.total} detail="Member visits and guest sign-ins" />
            <Kpi label="Member visits" value={visitInsights.members} detail="Two-hour repeat check-ins counted once" />
            <Kpi label="Unique checked-in accounts" value={visitInsights.uniqueMembers} detail="Distinct usernames with a recorded on-site check-in" />
            <Kpi label="Guest visits" value={visitInsights.guests} detail="Guest sign-ins in the selected period" />
          </div>
          <ChartPanel title="When recorded visits start" subtitle="UTC hour of the first check-in for each member visit, plus guest sign-ins">
            {visits.total ? <div className="reporting-visual-chart-scroll"><div style={{ minWidth: 680 }}><BarChart height={230}
              xAxis={[{ data: visitInsights.hours.map((hour) => hour.label), scaleType: "band", tickLabelInterval: (_, index) => index % 2 === 0 }]}
              series={[
                { data: focusChartValues(visitInsights.hours.map((hour) => hour.members), visitHour), label: "Member visits", stack: "visits", color: colors[0] },
                { data: focusChartValues(visitInsights.hours.map((hour) => hour.guests), visitHour), label: "Guest visits", stack: "visits", color: colors[1] },
              ]}
              onItemClick={(_, item) => { if (visitInsights.hours[item.dataIndex].members + visitInsights.hours[item.dataIndex].guests > 0) setVisitHour(item.dataIndex); }}
            /></div></div> : <EmptyChart />}
            <label className="reporting-visual-drill-control">Inspect hour
              <select value={visitHour ?? ""} onChange={(event) => setVisitHour(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">All hours</option>{visitInsights.hours.filter((hour) => hour.members + hour.guests > 0).map((hour) => <option key={hour.hour} value={hour.hour}>{hour.label} · {hour.members + hour.guests}</option>)}
              </select>
            </label>
            {visitHour !== null ? <div className="reporting-visual-selection" role="status">
              <strong>{selectedVisits.length} visits starting at {String(visitHour).padStart(2, "0")}:00 UTC</strong>
              <span>{selectedVisits.filter((row) => row.loginMethod !== "guest").length} member visits · {selectedVisits.filter((row) => row.loginMethod === "guest").length} guest visits</span>
              <Button size="sm" variant="ghost" onClick={() => setVisitHour(null)}>Show all hours</Button>
            </div> : <p className="reporting-visual-hint">Select an hour to focus the chart and inspect its visits.</p>}
          </ChartPanel>
          <ProfileAccordion title="Visit records" detail={visitHour === null ? `${visits.total} visits` : `${selectedVisits.length} visits starting at ${String(visitHour).padStart(2, "0")}:00 UTC`}>
            {visitHour !== null ? <Button variant="ghost" onClick={() => setVisitHour(null)}>Show all hours</Button> : null}
            <div className="reporting-table-wrap"><table className="committee-roles-table reporting-table"><thead><tr><th>Date</th><th>Time UTC</th><th>Name</th><th>Username</th><th>Method</th></tr></thead><tbody>
              {selectedVisits.slice(0, 100).map((row) => <tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.time}</td><td>{row.name || row.username || "Guest"}</td><td>{row.username || "—"}</td><td>{row.loginMethod}</td></tr>)}
            </tbody></table></div>
            {selectedVisits.length > 100 ? <p className="reporting-table-note">Showing 100 of {selectedVisits.length} rows. Export data includes all matching visits.</p> : null}
          </ProfileAccordion>
        </> : null}
      </section> : null}

      <section className="reporting-visual-section" aria-label="Programme journeys">
        <header><h2>Programme journeys</h2><p>People who started a programme in the selected dates; conversions may occur later.</p></header>
        {state.isLoadingMemberJourneys && !memberJourneyData ? <p role="status">Loading programme journeys…</p> : null}
        {memberJourneyData ? <>
          <div className="reporting-visual-kpis reporting-visual-kpis--journey">
            <Kpi label="New starters" value={memberJourneyData.summary.totalParticipants} detail="Programme participants in this cohort" />
            <Kpi label="Converted to members" value={memberJourneyData.summary.convertedToMembers} detail="Recorded conversion at any later date" />
            <Kpi label="Beginners conversion" value={`${memberJourneyData.summary.beginnersCourseConversionRate}%`} detail="Beginners course cohort, including taster route" />
          </div>
          <ChartPanel title="Started versus converted" subtitle="Grouped by original programme in this cohort">
            {memberJourneyData.rows.length ? <BarChart height={230}
              xAxis={[{ data: journeyGroups.map((group) => group.label), scaleType: "band" }]}
              series={[
                { data: focusChartValues(journeyGroups.map((group) => group.started), selectedOrigin ? journeyGroups.findIndex((group) => group.key === selectedOrigin) : null), label: "Started", color: colors[0] },
                { data: focusChartValues(journeyGroups.map((group) => group.converted), selectedOrigin ? journeyGroups.findIndex((group) => group.key === selectedOrigin) : null), label: "Converted", color: colors[2] },
              ]}
              onItemClick={(_, item) => { if (journeyGroups[item.dataIndex].started > 0) setSelectedOrigin(journeyGroups[item.dataIndex].key); }}
            /> : <EmptyChart />}
            <label className="reporting-visual-drill-control">Inspect programme
              <select value={selectedOrigin ?? ""} onChange={(event) => setSelectedOrigin(event.target.value || null)}>
                <option value="">All programmes</option>{journeyGroups.filter((group) => group.started > 0).map((group) => <option key={group.key} value={group.key}>{group.label} · {group.started} started</option>)}
              </select>
            </label>
            {selectedOrigin ? <div className="reporting-visual-selection" role="status">
              <strong>{selectedJourneys.length} starters · {journeyGroups.find((group) => group.key === selectedOrigin)?.label}</strong>
              <span>{selectedJourneyConversions} recorded member conversions in this cohort.</span>
              <Button size="sm" variant="ghost" onClick={() => setSelectedOrigin(null)}>Show all programmes</Button>
            </div> : <p className="reporting-visual-hint">Select a programme to focus the chart and inspect its participants.</p>}
          </ChartPanel>
          <ProfileAccordion title="Programme cohort" detail={`${selectedJourneys.length} participant${selectedJourneys.length === 1 ? "" : "s"}`}>
            {selectedOrigin ? <Button variant="ghost" onClick={() => setSelectedOrigin(null)}>Show all programmes</Button> : null}
            <div className="reporting-table-wrap"><table className="committee-roles-table reporting-table"><thead><tr><th>Joined</th><th>Name</th><th>Username</th><th>Origin</th><th>Journey</th><th>Member type</th><th>Converted</th><th>Converted at</th></tr></thead><tbody>
              {selectedJourneys.slice(0, 100).map((row) => <tr key={row.id}><td>{formatDate(row.joinedAtDate)}</td><td>{row.name}</td><td>{row.username}</td><td>{row.originCourseType}</td><td>{row.journey}</td><td>{row.membershipStatus}</td><td>{row.convertedToMember ? "Yes" : "No"}</td><td>{row.convertedAtDate ? formatDate(row.convertedAtDate) : "—"}</td></tr>)}
            </tbody></table></div>
            {selectedJourneys.length > 100 ? <p className="reporting-table-note">Showing 100 of {selectedJourneys.length} rows. Export data includes all matching participants.</p> : null}
          </ProfileAccordion>
        </> : null}
      </section>

      <section className="reporting-visual-section reporting-visual-details" aria-label="Detailed access events">
        <header><h2>Explore the records</h2><p>Inspect the figures behind the charts. Use Export data to build a CSV.</p></header>
        <ProfileAccordion title="Access event records" detail={`${selectedRows.length} events · ${selectionLabel}`}>
          {validSelection ? <Button variant="ghost" onClick={() => setSelection(null)}>Show all dates</Button> : null}
          {selectedRows.length ? <div className="reporting-table-wrap"><table className="committee-roles-table reporting-table"><thead><tr><th>Date</th><th>Time UTC</th><th>Type</th><th>Name</th><th>Username</th><th>Member type</th><th>Programme</th><th>Role</th><th>Method</th><th>Archery GB</th><th>Attending with</th></tr></thead><tbody>
            {selectedRows.slice(0, 100).map((row) => <tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.time}</td><td>{row.type}</td><td>{row.name}</td><td>{row.username || "—"}</td><td>{row.membershipStatus}</td><td>{row.programmeType}</td><td>{row.role}</td><td>{row.loginMethod}</td><td>{row.archeryGbMembershipNumber || "—"}</td><td>{row.attendingWith || "—"}</td></tr>)}
          </tbody></table></div> : <p className="usage-empty-state">No events match this selection.</p>}
          {selectedRows.length > 100 ? <p className="reporting-table-note">Showing 100 of {selectedRows.length} rows. Export data includes all matching events.</p> : null}
        </ProfileAccordion>
        <ProfileAccordion title="Profile and programme breakdowns" detail="Current profile snapshot and selected-range access events">
          <h3>Current active profiles by membership status</h3>
          <p className="reporting-table-note">Current snapshot, including people with no activity in this range.</p>
          <BreakdownList items={state.attendanceBreakdown.membershipStatuses} />
          <h3>Programme access events</h3>
          <p className="reporting-table-note">Successful sign-ins in the selected dates, grouped by programme.</p>
          <BreakdownList items={state.attendanceBreakdown.programmeTypes} />
        </ProfileAccordion>
        <ProfileAccordion title="Login methods over longer periods" detail="7, 30 and 90 days, this year, or all history">
          <ReportingDashboard actorUsername={actorUsername} />
        </ProfileAccordion>
        {memberRangeAttendance.canView ? <>
          <MemberRangeAttendanceSection attendance={memberRangeAttendance} showExport={false} />
          <RangeVisitHistory actorUsername={actorUsername} />
        </> : null}
      </section>
    </ThemeProvider> : null}
  </div>;
}
