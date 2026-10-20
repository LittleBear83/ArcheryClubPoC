import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import {
  DailyUsageGraph,
  HourlyUsageGraph,
  PersonalUsageGraph,
  UsageGraphLegend,
  WeekdayUsageGraph,
} from "./RangeUsageGraph";
import type { useRangeUsagePageState } from "./useRangeUsagePageState";

type RangeUsagePageState = ReturnType<typeof useRangeUsagePageState>;

const PERIODS = [
  { value: "currentWeek", label: "This week" },
  { value: "currentMonth", label: "This month" },
  { value: "filteredRange", label: "Choose dates" },
] as const;

export function RangeUsageView({
  activeData,
  activePersonalData,
  activeView,
  dashboard,
  dailyGraphConfig,
  endDate,
  error,
  isLoading,
  maxEndDate,
  minStartDate,
  myRangeGraphConfig,
  setActiveView,
  setEndDate,
  setStartDate,
  startDate,
}: RangeUsagePageState) {
  return (
    <div className="range-usage-dashboard">
      <p className="reporting-table-note">
        See when the range is used and how often you have visited. RFID and on-site mobile check-ins count as visits; repeat check-ins within two hours count once. Dates use UTC.
      </p>

      <div className="range-usage-periods" role="group" aria-label="Choose range usage period">
        {PERIODS.map((period) => (
          <Button
            key={period.value}
            type="button"
            variant="ghost"
            className={`range-usage-period ${activeView === period.value ? "is-active" : ""}`}
            aria-pressed={activeView === period.value}
            onClick={() => setActiveView(period.value)}
          >
            {period.label}
          </Button>
        ))}
      </div>

      {activeView === "filteredRange" ? (
        <div className="usage-filter-form usage-filter-panel range-usage-filter-form">
          <DatePicker label="From" value={startDate} onChange={setStartDate} min={minStartDate} max={endDate} />
          <DatePicker label="To" value={endDate} onChange={setEndDate} min={startDate} max={maxEndDate} />
          <p className="range-usage-date-note">Choose up to 366 days. The summary updates when you change a date.</p>
        </div>
      ) : null}

      {isLoading ? <p role="status">Loading range visits...</p> : null}
      {error ? <p className="usage-error" role="alert">{error instanceof Error ? error.message : "Unable to load range usage."}</p> : null}

      {dashboard && activeData && activePersonalData && myRangeGraphConfig ? (
        <>
          <section className="range-usage-summary" aria-label="Range visits for selected period">
            <div>
              <p className="range-usage-summary-eyebrow">Selected period</p>
              <h3>{activeData.label}</h3>
            </div>
            <div className="range-usage-summary-stats">
              <div><span>Your visits</span><strong>{activePersonalData.members}</strong></div>
              <div><span>Member visits</span><strong>{activeData.members}</strong></div>
              <div><span>Guest visits</span><strong>{activeData.guests}</strong></div>
              <div><span>Total visits</span><strong>{activeData.total}</strong></div>
            </div>
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>My visits</h3>
              <p>{myRangeGraphConfig.subtitle}</p>
            </div>
            {activePersonalData.members > 0 ? (
              <div className="range-usage-graph-wrap">
                <PersonalUsageGraph
                  rows={myRangeGraphConfig.rows}
                  keyField={myRangeGraphConfig.keyField}
                  className={myRangeGraphConfig.className}
                />
              </div>
            ) : <p className="usage-empty-state">No visits recorded for you in this period.</p>}
          </section>

          <details className="range-usage-trends usage-hourly-panel">
            <summary>Explore club visit patterns</summary>
            <p className="reporting-table-note">Member and guest visits for {activeData.label}.</p>
            {activeData.total > 0 ? <>
              <UsageGraphLegend />
              <div className="range-usage-trends-grid">
              <section>
                <h4>By hour of day</h4>
                <div className="range-usage-graph-wrap"><HourlyUsageGraph rows={activeData.hourly} /></div>
              </section>
              <section>
                <h4>By day of week</h4>
                <div className="range-usage-graph-wrap"><WeekdayUsageGraph rows={activeData.weekday} /></div>
              </section>
              <section>
                <h4>By date</h4>
                <p className="reporting-table-note">{dailyGraphConfig.subtitle}</p>
                <div className="range-usage-graph-wrap"><DailyUsageGraph rows={dailyGraphConfig.rows} /></div>
              </section>
              </div>
            </> : <p className="usage-empty-state">No club visits recorded in this period.</p>}
          </details>
        </>
      ) : null}
    </div>
  );
}
