import { LOGIN_METHOD_GROUPS } from "../../../shared/loginActivity.js";
import { DASHBOARD_PERIODS, DEFAULT_DASHBOARD_PERIOD } from "../../../shared/attendancePolicy.js";

export function resolveDashboardPeriod(period = DEFAULT_DASHBOARD_PERIOD, now = new Date()) {
  const selectedPeriod = DASHBOARD_PERIODS.find(({ value }) => value === period);
  if (!selectedPeriod) {
    throw new Error("Choose Last 7 days, Last 30 days, Last 90 days, This year or All time.");
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(today);
  if (period === "year") start.setUTCMonth(0, 1);
  else if (selectedPeriod.days) start.setUTCDate(start.getUTCDate() - selectedPeriod.days + 1);
  return {
    key: period,
    startDate: period === "all" ? null : start.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

export function buildLoginMethodReport(rows, period) {
  const counts = new Map(rows.map((row) => [row.login_method, Number(row.count)]));
  const methods = LOGIN_METHOD_GROUPS.map(({ method, label, values }) => ({
    method, label, count: values.reduce((sum, value) => sum + (counts.get(value) ?? 0), 0),
  }));
  const knownValues = new Set(LOGIN_METHOD_GROUPS.flatMap(({ values }) => values));
  const otherCount = rows.reduce((sum, row) => sum + (knownValues.has(row.login_method) ? 0 : Number(row.count)), 0);
  if (otherCount > 0) methods.push({ method: "other", label: "Other", count: otherCount });
  const total = methods.reduce((sum, entry) => sum + entry.count, 0);
  return { period, total, excludedOtherCount: 0, methods: methods.map((entry) => ({
    ...entry, percentage: total === 0 ? 0 : Math.round(entry.count / total * 10000) / 100,
  })) };
}
