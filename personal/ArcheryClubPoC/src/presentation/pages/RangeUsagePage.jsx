import { useEffect, useState } from "react";

function getUtcDateString(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

function getTodayString() {
  return getUtcDateString(new Date());
}

function normalizeUsageWindow(windowData, fallbackLabel = "") {
  if (!windowData) {
    return {
      label: fallbackLabel,
      startDate: "",
      endDate: "",
      members: 0,
      guests: 0,
      total: 0,
      hourly: [],
    };
  }

  return {
    label: windowData.label ?? fallbackLabel,
    startDate: windowData.startDate ?? "",
    endDate: windowData.endDate ?? "",
    members: windowData.members ?? 0,
    guests: windowData.guests ?? 0,
    total: windowData.total ?? 0,
    hourly: Array.isArray(windowData.hourly) ? windowData.hourly : [],
  };
}

function UsageCard({ active, data, onClick, title }) {
  return (
    <button
      type="button"
      className={`usage-card ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <p className="usage-card-title">{title}</p>
      <p className="usage-card-range">{data.label}</p>
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
    </button>
  );
}

function HourlyUsageGraph({ rows }) {
  if (!rows.length) {
    return <p className="usage-empty-state">No range usage data for this period.</p>;
  }

  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  return (
    <div className="usage-graph">
      {rows.map((row) => {
        const totalHeight = `${(row.total / maxTotal) * 100}%`;
        const memberHeight =
          row.total > 0 ? `${(row.members / row.total) * 100}%` : "0%";
        const guestHeight =
          row.total > 0 ? `${(row.guests / row.total) * 100}%` : "0%";

        return (
          <div key={row.hour} className="usage-graph-column">
            <span className="usage-graph-total">{row.total}</span>
            <div className="usage-graph-track">
              <div
                className="usage-graph-stack"
                style={{ height: totalHeight }}
                title={`${row.label}: ${row.members} members, ${row.guests} guests`}
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

export function RangeUsagePage() {
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState(getTodayString());
  const [activeView, setActiveView] = useState("filteredRange");
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      try {
        const params = new URLSearchParams({
          start: startDate,
          end: endDate,
        });
        const response = await fetch(
          `/api/range-usage-dashboard?${params.toString()}`,
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
          if (isMounted) {
            setError(result.message ?? "Unable to load range usage dashboard.");
          }
          return;
        }

        if (isMounted) {
          setDashboard({
            currentMonth: normalizeUsageWindow(result.currentMonth, "Current month"),
            currentWeek: normalizeUsageWindow(result.currentWeek, "Current week"),
            filteredRange: normalizeUsageWindow(
              result.filteredRange,
              `${startDate} to ${endDate}`,
            ),
          });
          setError("");
        }
      } catch {
        if (isMounted) {
          setError("Unable to load range usage dashboard.");
        }
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  const activeData = dashboard
    ? normalizeUsageWindow(dashboard[activeView])
    : null;

  return (
    <div className="range-usage-dashboard">
      <p>Range usage dashboard for members and guests.</p>

      <form className="usage-filter-form">
        <label>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            max={endDate}
          />
        </label>

        <label>
          End date
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            min={startDate}
            max={getTodayString()}
          />
        </label>
      </form>

      {error ? <p className="usage-error">{error}</p> : null}

      {dashboard ? (
        <>
          <div className="usage-cards">
            <UsageCard
              title="Current Month"
              data={dashboard.currentMonth}
              active={activeView === "currentMonth"}
              onClick={() => setActiveView("currentMonth")}
            />
            <UsageCard
              title="Current Week"
              data={dashboard.currentWeek}
              active={activeView === "currentWeek"}
              onClick={() => setActiveView("currentWeek")}
            />
            <UsageCard
              title="Selected Date Range"
              data={dashboard.filteredRange}
              active={activeView === "filteredRange"}
              onClick={() => setActiveView("filteredRange")}
            />
          </div>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Hour Of Day</h3>
              <p>{activeData?.label}</p>
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
            {activeData ? (
              <HourlyUsageGraph
                key={`${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={activeData.hourly}
              />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
