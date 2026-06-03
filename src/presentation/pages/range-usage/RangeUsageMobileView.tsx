import { DatePicker } from "../../components/DatePicker";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
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

export function RangeUsageMobileView({
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
    <div className="range-usage-dashboard range-usage-dashboard--mobile">
      <p className="range-usage-title">Range Usage Dashboard</p>

      <form className="usage-filter-form usage-filter-panel range-usage-filter-form--mobile">
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
            <MobileSectionHeader
              title="My Range Usage"
              description={myRangeGraphConfig?.subtitle}
            />
            {activePersonalData ? (
              <div className="range-usage-mobile-graph-wrap">
                <PersonalUsageGraph
                  key={`personal-${activeView}-${activePersonalData.startDate}-${activePersonalData.endDate}`}
                  rows={myRangeGraphConfig.rows}
                  keyField={myRangeGraphConfig.keyField}
                  className={myRangeGraphConfig.className}
                />
              </div>
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <MobileSectionHeader
              title="Usage By Hour"
              description={activeData?.label}
            />
            <UsageGraphLegend />
            {activeData ? (
              <div className="range-usage-mobile-graph-wrap">
                <HourlyUsageGraph
                  key={`${activeView}-${activeData.startDate}-${activeData.endDate}`}
                  rows={activeData.hourly}
                />
              </div>
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <MobileSectionHeader
              title="Usage By Day Of Week"
              description={`Monday to Sunday for ${activeData?.label}`}
            />
            <UsageGraphLegend />
            {activeData ? (
              <div className="range-usage-mobile-graph-wrap">
                <WeekdayUsageGraph
                  key={`weekday-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                  rows={activeData.weekday}
                />
              </div>
            ) : null}
          </section>

          <section className="usage-hourly-panel">
            <MobileSectionHeader
              title="Usage By Date In Month"
              description={`Fixed day-of-month view from 1 to 31, aggregated across ${activeData?.label}`}
            />
            <UsageGraphLegend />
            {activeData ? (
              <div className="range-usage-mobile-graph-wrap">
                <DailyUsageGraph
                  key={`daily-${activeView}-${activeData.startDate}-${activeData.endDate}`}
                  rows={aggregatedMonthRows}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
