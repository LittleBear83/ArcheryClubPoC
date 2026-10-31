export const clubSyncTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatGoldenRecordsSyncHeading(job) {
  if (!job) return "Not run";
  const lastAttempt = job.startedAt ?? job.queuedAt;
  return lastAttempt
    ? `${job.state} · Last Attempt: ${clubSyncTimeFormatter.format(new Date(lastAttempt))}`
    : job.state;
}
