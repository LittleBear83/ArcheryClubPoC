import type { AttendanceReportDailyRow } from "../../../api/reportingApi";

export function ReportingGraph({ rows }: { rows: AttendanceReportDailyRow[] }) {
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
