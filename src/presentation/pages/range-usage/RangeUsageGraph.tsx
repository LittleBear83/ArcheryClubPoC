export function UsageGraph({ rows, keyField, className = "" }) {
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

export function PersonalUsageGraph({ rows, keyField, className = "" }) {
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

export function HourlyUsageGraph({ rows }) {
  return <UsageGraph rows={rows} keyField="hour" />;
}

export function WeekdayUsageGraph({ rows }) {
  return (
    <UsageGraph rows={rows} keyField="dayOfWeek" className="usage-graph-week" />
  );
}

export function DailyUsageGraph({ rows }) {
  return (
    <UsageGraph rows={rows} keyField="usageDate" className="usage-graph-date" />
  );
}

export function UsageGraphLegend() {
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
