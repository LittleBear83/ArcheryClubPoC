const PERIODS = { "7d": 7, "30d": 30, "90d": 90 };
const METHODS = [
  { method: "rfid", label: "RFID", values: ["rfid"] },
  { method: "mobile", label: "Mobile", values: ["mobile-app"] },
  { method: "website", label: "Website", values: ["password", "password-mobile"] },
];

export function resolveDashboardPeriod(period = "30d", now = new Date()) {
  if (![...Object.keys(PERIODS), "year", "all"].includes(period)) {
    throw new Error("Choose Last 7 days, Last 30 days, Last 90 days, This year or All time.");
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(today);
  if (period === "year") start.setUTCMonth(0, 1);
  else if (PERIODS[period]) start.setUTCDate(start.getUTCDate() - PERIODS[period] + 1);
  return {
    key: period,
    startDate: period === "all" ? null : start.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  };
}

export function buildLoginMethodReport(rows, period) {
  const counts = new Map(rows.map((row) => [row.login_method, Number(row.count)]));
  const methods = METHODS.map(({ method, label, values }) => ({
    method, label, count: values.reduce((sum, value) => sum + (counts.get(value) ?? 0), 0),
  }));
  const total = methods.reduce((sum, entry) => sum + entry.count, 0);
  const knownValues = new Set(METHODS.flatMap(({ values }) => values));
  const excludedOtherCount = rows.reduce((sum, row) => sum + (knownValues.has(row.login_method) ? 0 : Number(row.count)), 0);
  return { period, total, excludedOtherCount, methods: methods.map((entry) => ({
    ...entry, percentage: total === 0 ? 0 : Math.round(entry.count / total * 10000) / 100,
  })) };
}
