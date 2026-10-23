export const ATTENDANCE_MAX_RANGE_DAYS = 366;
export const MEMBER_RANGE_ATTENDANCE_PERIOD_DAYS = Object.freeze([30, 60, 90, 180, 365]);
export const DEFAULT_MEMBER_RANGE_ATTENDANCE_DAYS = 90;

export const DASHBOARD_PERIODS = Object.freeze([
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "year", label: "This year", days: null },
  { value: "all", label: "All time", days: null },
]);
export const DEFAULT_DASHBOARD_PERIOD = "30d";

function shiftUtcDateString(value, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getAttendanceRangeDateBounds(startDate, endDate, todayDate) {
  const maxFromStart = shiftUtcDateString(startDate, ATTENDANCE_MAX_RANGE_DAYS - 1);
  return {
    minStartDate: shiftUtcDateString(endDate, 1 - ATTENDANCE_MAX_RANGE_DAYS) ?? "",
    maxEndDate: maxFromStart ? [todayDate, maxFromStart].sort()[0] : todayDate,
  };
}
