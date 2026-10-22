import {
  formatDate,
  formatDateRangeLabel,
  formatHourLabel,
} from "../../../utils/dateTime";

export function getUtcDateString(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

export function getTodayString() {
  return getUtcDateString(new Date());
}

export function getCurrentWeekStartString() {
  const today = new Date();
  const dayOfWeek = today.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() + mondayOffset);

  return getUtcDateString(weekStart);
}

export function normalizeUsageWindow(windowData, fallbackLabel = "") {
  if (!windowData) {
    return {
      label: fallbackLabel,
      startDate: "",
      endDate: "",
      members: 0,
      guests: 0,
      total: 0,
      hourly: [],
      weekday: [],
      daily: [],
      monthDaily: [],
    };
  }

  const startDate = windowData.startDate ?? "";
  const endDate = windowData.endDate ?? "";
  const label =
    startDate && endDate
      ? formatDateRangeLabel(startDate, endDate)
      : (windowData.label ?? fallbackLabel);

  return {
    label,
    startDate,
    endDate,
    members: windowData.members ?? 0,
    guests: windowData.guests ?? 0,
    total: windowData.total ?? 0,
    hourly: Array.isArray(windowData.hourly)
      ? windowData.hourly.map((row) => ({
          ...row,
          label: formatHourLabel(row.hour),
          fullLabel: formatHourLabel(row.hour),
        }))
      : [],
    weekday: Array.isArray(windowData.weekday) ? windowData.weekday : [],
    daily: Array.isArray(windowData.daily)
      ? windowData.daily.map((row) => ({
          ...row,
          fullLabel: formatDate(row.usageDate),
        }))
      : [],
    monthDaily: Array.isArray(windowData.monthDaily)
      ? windowData.monthDaily.map((row) => ({
          ...row,
          fullLabel: row.fullLabel ?? `Day ${row.label}`,
        }))
      : [],
  };
}

export function aggregateMonthDayRows(rows) {
  const aggregatedRows = Array.from({ length: 31 }, (_, index) => ({
    usageDate: `day-${index + 1}`,
    label: String(index + 1),
    fullLabel: `Day ${index + 1}`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of rows) {
    const usageDate = typeof row.usageDate === "string" ? row.usageDate : "";
    const dayOfMonth = Number.parseInt(usageDate.slice(-2), 10);

    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      continue;
    }

    const aggregateRow = aggregatedRows[dayOfMonth - 1];
    aggregateRow.members += row.members ?? 0;
    aggregateRow.guests += row.guests ?? 0;
    aggregateRow.total += row.total ?? 0;
  }

  return aggregatedRows;
}

export function getSelectedRangeLengthInDays(data) {
  if (!data?.startDate || !data?.endDate) {
    return 0;
  }

  const start = new Date(`${data.startDate}T00:00:00Z`);
  const end = new Date(`${data.endDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}
