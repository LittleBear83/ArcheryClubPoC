import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRangeVisitReport } from "../../../api/reportingApi";
import { formatDate } from "../../../utils/dateTime";
import { Button } from "../../components/Button";
import { ProfileAccordion } from "../profile/ProfileAccordion";
import { getRangeVisitPeriod, RANGE_VISIT_PERIODS, type RangeVisitPeriod } from "./rangeVisitPeriods";
import { ukReportClock, ukReportTime } from "./reportingTime";

function methodLabel(method: string) {
  if (method === "rfid") return "RFID";
  if (method === "mobile-app") return "On-site mobile check-in";
  if (method === "guest") return "Guest sign-in";
  return method;
}

export function RangeVisitHistory({ actorUsername }: { actorUsername: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [period, setPeriod] = useState<RangeVisitPeriod>("current-month");
  const { startDate, endDate } = getRangeVisitPeriod(period, new Date());
  const visitsQuery = useQuery({
    queryKey: ["range-visit-history", actorUsername, startDate, endDate],
    queryFn: async () => (await getRangeVisitReport(actorUsername, startDate, endDate)).report,
    enabled: isOpen && Boolean(actorUsername),
  });
  const report = visitsQuery.data;

  return (
    <ProfileAccordion
      className="range-visit-history"
      title="Range visit history"
      detail="View member and guest visits by date"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <div className="range-visit-filters" role="group" aria-label="Range visit period">
        {RANGE_VISIT_PERIODS.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={period === value ? "primary" : "secondary"}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="reporting-table-note">
        {formatDate(startDate)} to {formatDate(endDate)}. Visit times are shown in UK local time (BST/GMT). RFID and on-site mobile check-ins count as member visits. Repeat check-ins within two hours count once; each guest sign-in counts once.
      </p>
      {visitsQuery.isPending || visitsQuery.isFetching ? <p role="status">Loading range visits...</p> : null}
      {visitsQuery.error ? <p className="usage-error" role="alert">{visitsQuery.error instanceof Error ? visitsQuery.error.message : "Unable to load range visits."}</p> : null}
      {report && !visitsQuery.isFetching ? (
        <>
          <p className="reporting-table-note">{report.total} visit{report.total === 1 ? "" : "s"} in this period.</p>
          {report.rows.length ? (
            <div className="reporting-table-wrap">
              <table className="committee-roles-table reporting-table">
                <thead>
                  <tr><th>UK date</th><th>UK time (BST/GMT)</th><th>Name</th><th>Username</th><th>Check-in method</th></tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => {
                    const local = ukReportTime(row.date, row.time);
                    return <tr key={row.id}>
                      <td>{formatDate(local.date)}</td>
                      <td>{ukReportClock(local)}</td>
                      <td>{row.name || row.username || "Guest"}</td>
                      <td>{row.username || "—"}</td>
                      <td>{methodLabel(row.loginMethod)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="usage-empty-state">No recorded visits in this period.</p>}
        </>
      ) : null}
    </ProfileAccordion>
  );
}
