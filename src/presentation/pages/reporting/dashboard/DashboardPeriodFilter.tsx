import { useId } from "react";
import type { DashboardPeriod } from "../../../../api/reportingDashboardApi";
import { DASHBOARD_PERIODS } from "../../../../../shared/attendancePolicy.js";

export function DashboardPeriodFilter({ period, onChange }: { period: DashboardPeriod; onChange: (period: DashboardPeriod) => void }) {
  const id = useId();
  return <label htmlFor={id} className="reporting-dashboard-period">
    Dashboard period
    <select id={id} value={period} onChange={(event) => onChange(event.target.value as DashboardPeriod)}>
      {DASHBOARD_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
