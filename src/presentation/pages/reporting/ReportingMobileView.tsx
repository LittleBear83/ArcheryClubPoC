import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { MobileActionBar } from "../../components/mobile/MobileActionBar";
import { MobileCardList } from "../../components/mobile/MobileCardList";
import { MobileEmptyState } from "../../components/mobile/MobileEmptyState";
import { MobileKeyValueList } from "../../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../../components/mobile/MobileSectionHeader";
import { formatClockTime, formatDate } from "../../../utils/dateTime";
import type { MemberJourneyReportRow } from "../../../api/reportingApi";
import { ReportingGraph } from "./ReportingGraph";
import type { useReportingPageState } from "./useReportingPageState";

type ReportingPageState = ReturnType<typeof useReportingPageState>;

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function BreakdownList({
  items,
}: {
  items: Array<{ key: string; label: string; count: number }>;
}) {
  if (!items.length) {
    return <p className="reporting-breakdown-empty">No grouped data available.</p>;
  }

  return (
    <div className="reporting-breakdown-list">
      {items.map((item) => (
        <p key={item.key}>
          <strong>{item.count}</strong> {item.label}
        </p>
      ))}
    </div>
  );
}

export function ReportingMobileView({
  aggregatedMonthRows,
  attendanceBreakdown,
  data,
  endDate,
  error,
  exportError,
  getTodayString,
  handleExport,
  hasDataSource,
  includeGuests,
  includeMembers,
  isFetching,
  isLoadingMemberJourneys,
  memberJourneyData,
  memberJourneyError,
  rangeLabel,
  setEndDate,
  setIncludeGuests,
  setIncludeMembers,
  setStartDate,
  startDate,
}: ReportingPageState) {
  return (
    <div className="range-usage-dashboard reporting-page reporting-page--mobile">
      <p className="range-usage-title">Reporting</p>

      <section className="usage-filter-panel reporting-filter-panel reporting-filter-panel--mobile">
        <form className="usage-filter-form reporting-filter-form reporting-filter-form--mobile">
          <label>
            <DatePicker
              label="Date from"
              value={startDate}
              onChange={setStartDate}
              max={endDate}
            />
          </label>

          <label>
            <DatePicker
              label="Date to"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
              max={getTodayString()}
            />
          </label>

          <div
            className="reporting-source-fieldset reporting-source-fieldset--mobile"
            role="group"
            aria-label="Included data sources"
          >
            <span className="reporting-source-label">Include</span>
            <label className="profile-checkbox">
              <input
                type="checkbox"
                checked={includeMembers}
                onChange={(event) => setIncludeMembers(event.target.checked)}
              />
              <span>Members</span>
            </label>
            <label className="profile-checkbox">
              <input
                type="checkbox"
                checked={includeGuests}
                onChange={(event) => setIncludeGuests(event.target.checked)}
              />
              <span>Guests</span>
            </label>
          </div>

          <MobileActionBar>
            <Button
              type="button"
              onClick={handleExport}
              disabled={!data || !hasDataSource || isFetching}
              fullWidth
            >
              Export CSV
            </Button>
          </MobileActionBar>
        </form>
      </section>

      {!hasDataSource ? <p className="usage-error">Select Members, Guests, or both.</p> : null}
      {error ? (
        <p className="usage-error">
          {error instanceof Error
            ? error.message
            : "Unable to load the attendance report."}
        </p>
      ) : null}
      {exportError ? <p className="usage-error">{exportError}</p> : null}
      {memberJourneyError ? (
        <p className="usage-error">
          {memberJourneyError instanceof Error
            ? memberJourneyError.message
            : "Unable to load member journey reporting."}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="usage-cards reporting-summary-cards">
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Selected Range</p>
              <p className="usage-card-range">{rangeLabel}</p>
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
            </div>
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Membership Status Breakdown</p>
              <BreakdownList items={attendanceBreakdown.membershipStatuses} />
            </div>
            <div className="usage-card reporting-summary-card">
              <p className="usage-card-title">Programme Breakdown</p>
              <BreakdownList items={attendanceBreakdown.programmeTypes} />
            </div>
          </div>

          <section className="usage-hourly-panel reporting-panel">
            <MobileSectionHeader
              title="Usage By Date"
              description={`Fixed day-of-month view across ${rangeLabel}.`}
            />
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
            <div className="reporting-mobile-graph-wrap">
              <ReportingGraph rows={aggregatedMonthRows} />
            </div>
          </section>

          <section className="usage-hourly-panel reporting-panel">
            <MobileSectionHeader
              title="New Member Journey Funnel"
              description={`Participants who started between ${formatDate(
                memberJourneyData?.startDate ?? startDate,
              )} and ${formatDate(memberJourneyData?.endDate ?? endDate)}.`}
            />
            {isLoadingMemberJourneys && !memberJourneyData ? (
              <p>Loading member journey reporting...</p>
            ) : memberJourneyData ? (
              <>
                <div className="usage-cards reporting-summary-cards">
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">New Starters</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>{memberJourneyData.summary.totalParticipants}</strong> people
                        started in this period
                      </p>
                    </div>
                  </div>
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">Full Member Conversions</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>{memberJourneyData.summary.convertedToMembers}</strong>{" "}
                        converted to full members
                      </p>
                    </div>
                  </div>
                  <div className="usage-card reporting-summary-card">
                    <p className="usage-card-title">Beginners To Member Rate</p>
                    <div className="reporting-breakdown-list">
                      <p>
                        <strong>
                          {formatPercentage(
                            memberJourneyData.summary.beginnersCourseConversionRate,
                          )}
                        </strong>{" "}
                        overall
                      </p>
                    </div>
                  </div>
                </div>
                {memberJourneyData.rows.length > 0 ? (
                  <MobileCardList className="reporting-mobile-row-list">
                    {memberJourneyData.rows.slice(0, 25).map((row: MemberJourneyReportRow) => (
                      <article key={row.id} className="reporting-mobile-row-card">
                        <p className="reporting-mobile-row-title">{row.name}</p>
                        <MobileKeyValueList
                          items={[
                            { label: "Joined", value: formatDate(row.joinedAtDate) },
                            {
                              label: "Converted",
                              value: row.convertedToMember ? "Yes" : "No",
                            },
                            {
                              label: "Converted At",
                              value: row.convertedAtDate
                                ? formatDate(row.convertedAtDate)
                                : "-",
                            },
                          ]}
                        />
                      </article>
                    ))}
                  </MobileCardList>
                ) : (
                  <MobileEmptyState message="No participant journeys started in the selected date range." />
                )}
              </>
            ) : null}
          </section>

          <section className="usage-hourly-panel reporting-panel">
            <MobileSectionHeader
              title="Report Rows"
              description={`Showing ${Math.min(data.rows.length, 25)} of ${data.rows.length} row${data.rows.length === 1 ? "" : "s"}.`}
            />
            {data.rows.length > 0 ? (
              <MobileCardList className="reporting-mobile-row-list">
                {data.rows.slice(0, 25).map((row) => (
                  <article key={row.id} className="reporting-mobile-row-card">
                    <p className="reporting-mobile-row-title">{row.name}</p>
                    <MobileKeyValueList
                      items={[
                        { label: "Date", value: formatDate(row.date) },
                        { label: "Time", value: formatClockTime(row.time) },
                        { label: "Type", value: row.type },
                        { label: "Status", value: row.membershipStatus || "-" },
                        { label: "Programme", value: row.programmeType || "-" },
                        { label: "Role", value: row.role || "-" },
                        {
                          label: "Archery GB",
                          value: row.archeryGbMembershipNumber || "-",
                        },
                        {
                          label: "Attending With",
                          value: row.attendingWith || "-",
                        },
                      ]}
                    />
                  </article>
                ))}
              </MobileCardList>
            ) : (
              <MobileEmptyState message="No rows match the selected data." />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
