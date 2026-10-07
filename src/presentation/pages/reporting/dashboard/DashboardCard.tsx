import { useId, type ReactNode } from "react";

export function DashboardCard({ title, periodLabel, children }: { title: string; periodLabel: string; children: ReactNode }) {
  const id = useId();
  return <article className="reporting-dashboard-card" aria-labelledby={id}>
    <header><h3 id={id}>{title}</h3><p className="reporting-dashboard-caption">{periodLabel}</p></header>
    {children}
  </article>;
}
