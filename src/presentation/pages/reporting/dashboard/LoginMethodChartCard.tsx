import { useMemo, useState, useId } from "react";
import { PieChart } from "@mui/x-charts/PieChart";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useTheme } from "../../../../theme/useTheme";
import type { LoginMethodReport } from "../../../../api/reportingDashboardApi";
import { DashboardCard } from "./DashboardCard";

export function LoginMethodChartCard({ report, periodLabel }: { report: LoginMethodReport; periodLabel: string }) {
  const { theme } = useTheme();
  const descriptionId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const muiTheme = useMemo(() => createTheme({ palette: {
    mode: theme.colorScheme,
    primary: { main: theme.variables["--accent"] },
    background: { paper: theme.variables["--bg-elevated"] },
    text: { primary: theme.variables["--text"], secondary: theme.variables["--text-muted"] },
  } }), [theme]);
  const colors = [theme.variables["--accent"], theme.variables["--info"], theme.variables["--success"]];
  const describe = (index: number) => {
    const method = report.methods[index];
    return `${method.label}: ${method.count.toLocaleString("en-GB")} · ${method.percentage.toLocaleString("en-GB", { maximumFractionDigits: 2 })}% of displayed total`;
  };

  return <DashboardCard title="Member login methods" periodLabel={periodLabel}>
    <p id={descriptionId} className="reporting-dashboard-caption">Successful access events, not unique people or range visits. Website includes password logins from phones.</p>
    <div className="login-method-visual">
      <div className="login-method-chart">
        {report.total === 0 ? <p className="usage-empty-state" role="status">No recorded login activity for this period.</p> : <ThemeProvider theme={muiTheme}>
          <PieChart height={260} hideLegend skipAnimation
            title="Member login methods" desc={report.methods.map((_, index) => describe(index)).join(". ")}
            aria-describedby={descriptionId}
            tooltipItem={selected === null ? null : { seriesId: "login-methods", dataIndex: selected }}
            onTooltipItemChange={(item) => setSelected(item?.dataIndex ?? null)}
            series={[{ id: "login-methods", innerRadius: "58%", outerRadius: "90%", paddingAngle: 2,
              data: report.methods.map((method, index) => ({ id: method.method, label: method.label, value: method.count, color: colors[index] })),
              valueFormatter: (_value, { dataIndex }) => describe(dataIndex),
            }]}
            onItemClick={(_event, item) => setSelected(item.dataIndex)}
            slotProps={{ tooltip: { trigger: "item" } }}
          />
        </ThemeProvider>}
        <p className="login-method-total"><strong>{report.total.toLocaleString("en-GB")}</strong> total access events</p>
      </div>
      <ul className="login-method-callouts" aria-label="Login method counts and percentages">
        {report.methods.map((method, index) => <li key={method.method}>
          <button type="button" onClick={() => setSelected(index)} aria-pressed={selected === index}>
            <span className="login-method-swatch" style={{ background: colors[index] }} aria-hidden="true" />
            <span><strong>{method.label}</strong><span>{method.count.toLocaleString("en-GB")} · {method.percentage.toLocaleString("en-GB", { maximumFractionDigits: 2 })}%</span></span>
          </button>
        </li>)}
      </ul>
    </div>
    <p className="reporting-dashboard-caption" aria-live="polite">{selected === null ? report.total === 0 ? "Select a category to inspect its values." : "Hover a slice, or tap a slice or category to inspect its values." : describe(selected)}</p>
    {report.excludedOtherCount > 0 ? <p className="reporting-dashboard-caption">{report.excludedOtherCount.toLocaleString("en-GB")} legacy/other method events are excluded from this total and its percentages.</p> : null}
  </DashboardCard>;
}
