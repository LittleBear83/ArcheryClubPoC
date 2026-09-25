import { Button } from "../../components/Button";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { formatDate } from "../../../utils/dateTime";
import type { useReportingPageState } from "./useReportingPageState";

type AttendanceState = ReturnType<typeof useReportingPageState>["memberRangeAttendance"];

function lastVisitLabel(value: string | null) {
  return value ? formatDate(value.slice(0, 10)) : "Never recorded";
}

function contactLink(emailAddress: string) {
  return emailAddress
    ? <a href={`mailto:${encodeURIComponent(emailAddress)}`}>{emailAddress}</a>
    : <span>No email on file</span>;
}

export function MemberRangeAttendanceSection({
  attendance,
  mobile = false,
}: {
  attendance: AttendanceState;
  mobile?: boolean;
}) {
  if (!attendance.canView) return null;

  return (
    <section className="usage-hourly-panel reporting-panel member-range-attendance">
      <div className="usage-hourly-header">
        <h3>Member range attendance and follow-up</h3>
        <p>Find members without a recorded range visit in the selected window.</p>
      </div>
      <div className="member-range-attendance-controls">
        <label>
          Look back
          <select value={attendance.days} onChange={(event) => attendance.setDays(Number(event.target.value))}>
            {[30, 60, 90, 180, 365].map((days) => (
              <option key={days} value={days}>Last {days} days</option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select value={attendance.filter} onChange={(event) =>
            attendance.setFilter(event.target.value as AttendanceState["filter"])}>
            <option value="no-visit">No recorded visit</option>
            <option value="attended">Recorded visit</option>
            <option value="all">All current members</option>
          </select>
        </label>
        <Button type="button" onClick={attendance.handleExport} disabled={!attendance.data || attendance.isFetching}>
          Export shown members
        </Button>
      </div>
      <p className="reporting-table-note">
        Range visits use RFID and on-site mobile check-ins. A missing check-in does not prove that someone has not attended; check before contacting them.
      </p>
      {attendance.error ? (
        <p className="usage-error">{attendance.error instanceof Error ? attendance.error.message : "Unable to load member range attendance."}</p>
      ) : null}
      {attendance.exportError ? <p className="usage-error">{attendance.exportError}</p> : null}
      {attendance.isFetching && !attendance.data ? <p>Loading member range attendance...</p> : null}
      {attendance.data ? (
        <>
          <div className="member-range-attendance-summary">
            <p><strong>{attendance.data.totalMembers}</strong> current members</p>
            <p><strong>{attendance.data.attended}</strong> with a recorded visit</p>
            <p><strong>{attendance.data.noRecordedVisit}</strong> without a recorded visit</p>
            <p><strong>{attendance.data.neverRecorded}</strong> never recorded</p>
          </div>
          <p className="reporting-table-note">
            {formatDate(attendance.data.startDate)} to {formatDate(attendance.data.endDate)} · Showing {attendance.rows.length} member{attendance.rows.length === 1 ? "" : "s"}.
          </p>
          {attendance.rows.length === 0 ? (
            <p className="usage-empty-state">No members match this view.</p>
          ) : mobile ? (
            <MobileCardList className="reporting-mobile-row-list">
              {attendance.rows.map((row) => (
                <article key={row.username} className="reporting-mobile-row-card">
                  <p className="reporting-mobile-row-title">{row.name}</p>
                  <MobileKeyValueList items={[
                    { label: "Status", value: row.hasRecordedVisit ? "Recorded visit" : "No recorded visit" },
                    { label: "Days in period", value: String(row.visitDays) },
                    { label: "Total days", value: String(row.totalVisitDays) },
                    { label: "Last visit", value: lastVisitLabel(row.lastVisitAt) },
                    { label: "Email", value: row.emailAddress || "No email on file" },
                  ]} />
                  {row.emailAddress ? contactLink(row.emailAddress) : null}
                </article>
              ))}
            </MobileCardList>
          ) : (
            <div className="reporting-table-wrap">
              <table className="committee-roles-table reporting-table">
                <thead><tr><th>Name</th><th>Status</th><th>Days in period</th><th>Total days</th><th>Last recorded visit</th><th>Email</th></tr></thead>
                <tbody>
                  {attendance.rows.map((row) => (
                    <tr key={row.username}>
                      <td>{row.name}</td>
                      <td>{row.hasRecordedVisit ? "Recorded visit" : "No recorded visit"}</td>
                      <td>{row.visitDays}</td>
                      <td>{row.totalVisitDays}</td>
                      <td>{lastVisitLabel(row.lastVisitAt)}</td>
                      <td>{contactLink(row.emailAddress)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
