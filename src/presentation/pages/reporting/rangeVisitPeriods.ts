export const RANGE_VISIT_PERIODS = [
  { value: "current-month", label: "Current month" },
  { value: "last-30-days", label: "Last 30 days" },
  { value: "last-90-days", label: "Last 90 days" },
  { value: "year-to-date", label: "Year to date" },
  { value: "current-year", label: "Current year" },
] as const;

export type RangeVisitPeriod = (typeof RANGE_VISIT_PERIODS)[number]["value"];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getRangeVisitPeriod(period: RangeVisitPeriod, now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  if (period === "current-month") {
    return { startDate: isoDate(new Date(Date.UTC(year, month, 1))), endDate: isoDate(today) };
  }
  if (period === "last-30-days" || period === "last-90-days") {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (period === "last-30-days" ? 29 : 89));
    return { startDate: isoDate(start), endDate: isoDate(today) };
  }
  if (period === "year-to-date") {
    return { startDate: `${year}-01-01`, endDate: isoDate(today) };
  }
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}
