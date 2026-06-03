import { DatePicker } from "../../components/DatePicker";
import {
  DailyUsageGraph,
  HourlyUsageGraph,
  PersonalUsageGraph,
  UsageGraphLegend,
  WeekdayUsageGraph,
} from "./RangeUsageGraph";
import { UsageCard } from "./RangeUsageCard";
import type { useRangeUsagePageState } from "./useRangeUsagePageState";

type RangeUsagePageState = ReturnType<typeof useRangeUsagePageState>;

export function RangeUsageDesktopView({
  activeData,
  activePersonalData,
  activeView,
  aggregatedMonthRows,
  dashboard,
  endDate,
  error,
  getTodayString,
  myRangeGraphConfig,
  setActiveView,
  setEndDate,
  setStartDate,
  startDate,
}: RangeUsagePageState) {
  return (
    <div className="range-usage-dashboard">
      <p className="range-usage-title">Range Usage Dashboard</p>

      <form className="usage-filter-form usage-filter-panel">
        <label>
          <DatePicker
            label="From"
            value={startDate}
            onChange={setStartDate}
            max={endDate}
          />
        </label>

        <label>
          <DatePicker
            label="To"
            value={endDate}
            onChange={setEndDate}
            min={startDate}
            max={getTodayString()}
          />
        </label>
      </form>

      {error ? <p className="usage-error">{error instanceof Error ? error.message : "Unable to load range usage dashboard."}</p> : null}

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
              <h3>My Range Usage</h3>
              <p>{myRangeGraphConfig?.subtitle}</p>
            </div>
            {activePersonalData ? (
              <PersonalUsageGraph
                key={`personal-${activeView}-${activePersonalData.startDate}-${activePersonalData.endDate}`}
                rows={myRangeGraphConfig.rows}
                keyField={myRangeGraphConfig.keyField}
                className={myRangeGraphConfig.className}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Hour Of Day</h3>
              <p>{activeData?.label}</p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <HourlyUsageGraph
                key={`${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={activeData.hourly}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Day Of Week</h3>
              <p>Monday to Sunday for {activeData?.label}</p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <WeekdayUsageGraph
                key={`weekday-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={activeData.weekday}
              />
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <div className="usage-hourly-header">
              <h3>Usage By Date In Month</h3>
              <p>
                Fixed day-of-month view from 1 to 31, aggregated across{" "}
                {activeData?.label}
              </p>
            </div>
            <UsageGraphLegend />
            {activeData ? (
              <DailyUsageGraph
                key={`daily-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                rows={aggregatedMonthRows}
              />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
