const londonClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function getGoldenRecordsNightlyDate(scheduledAt) {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(londonClock.formatToParts(date).map(({ type, value }) => [type, value]));
  const isSpringClockChange = date.getUTCMonth() === 2 &&
    date.getUTCDay() === 0 && date.getUTCDate() + 7 > 31 &&
    date.getUTCHours() === 1;
  if (parts.hour !== "01" && !(isSpringClockChange && parts.hour === "02")) return null;

  return `${parts.year}-${parts.month}-${parts.day}`;
}
