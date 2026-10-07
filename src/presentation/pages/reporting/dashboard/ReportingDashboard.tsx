import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loginMethodQueryOptions, type DashboardPeriod } from "../../../../api/reportingDashboardApi";
import { DashboardPeriodFilter, DASHBOARD_PERIODS } from "./DashboardPeriodFilter";
import { LoginMethodChartCard } from "./LoginMethodChartCard";

export function ReportingDashboard({ actorUsername }: { actorUsername: string }) {
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const query = useQuery(loginMethodQueryOptions(actorUsername, period));
  const periodLabel = DASHBOARD_PERIODS.find((option) => option.value === period)!.label;
  return <section className="reporting-dashboard" aria-label="Reporting dashboard">
    <header className="reporting-dashboard-header"><div><h2>Dashboard</h2><p className="reporting-dashboard-caption">Access activity · UTC calendar days</p></div>
      <DashboardPeriodFilter period={period} onChange={setPeriod} />
    </header>
    <div className="reporting-dashboard-grid" aria-busy={query.isFetching}>
      {query.isPending ? <p role="status">Loading dashboard…</p> : query.isError ? <div role="alert"><p>Unable to load login methods: {query.error.message}</p><button type="button" onClick={() => void query.refetch()}>Retry</button></div>
        : <LoginMethodChartCard key={period} report={query.data} periodLabel={`${periodLabel} · ${query.data.period.startDate ?? "earliest history"} to ${query.data.period.endDate} (UTC)`} />}
    </div>
  </section>;
}
