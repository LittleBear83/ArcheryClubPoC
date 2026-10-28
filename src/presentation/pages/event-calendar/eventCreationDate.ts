import { getClubTodayDate } from "../../../../shared/clubDate.js";

export function resolveEventCreationDate(date: string | null | undefined, now = new Date()) {
  const fallback = getClubTodayDate(now);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fallback;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day ? date : fallback;
}

export function canQuickCreateEvent(canCreateEvents: boolean, date: string | null) {
  return canCreateEvents && date !== null && resolveEventCreationDate(date) === date;
}
