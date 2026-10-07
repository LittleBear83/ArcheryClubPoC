import { useId } from "react";
import type { DashboardPeriod } from "../../../../api/reportingDashboardApi";

export const DASHBOARD_PERIODS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" }, { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

export function DashboardPeriodFilter({ period, onChange }: { period: DashboardPeriod; onChange: (period: DashboardPeriod) => void }) {
  const id = useId();
  return <label htmlFor={id} className="reporting-dashboard-period">
    Dashboard period
    <select id={id} value={period} onChange={(event) => onChange(event.target.value as DashboardPeriod)}>
      {DASHBOARD_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
