const ukFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});

export function ukReportTime(date: string, time: string) {
  if (!date || !time) {
    return { date: date ?? "", time: time ?? "", hour: Number.NaN, zone: "" };
  }
  const instant = new Date(`${date}T${time}Z`);
  if (Number.isNaN(instant.getTime())) {
    return { date, time, hour: Number.NaN, zone: "" };
  }
  const parts = Object.fromEntries(ukFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    hour: Number(parts.hour),
    zone: parts.timeZoneName,
  };
}

export function ukReportClock(parts: ReturnType<typeof ukReportTime>) {
  return [parts.time, parts.zone].filter(Boolean).join(" ");
}
