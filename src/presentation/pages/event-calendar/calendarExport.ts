import type { BeginnersCourseCalendarLesson, CoachingSession } from "../../../types/app";

export type CalendarExport = {
  kind: "event" | "coaching" | "lesson";
  id: string | number;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  portalUrl: string;
};

type ClubEvent = Omit<CalendarExport, "kind" | "description" | "location" | "portalUrl"> & {
  details?: string;
  type: string;
  types?: string[];
  venue?: string;
  isApproved?: boolean;
  isPendingApproval?: boolean;
  isRejected?: boolean;
  isCancelled?: boolean;
};

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function londonParts(date: Date) {
  return Object.fromEntries(londonFormatter.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
}

export function londonDateTimeToUtc(date: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute, second] = timeMatch.slice(1).map((part) => Number(part ?? 0));
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(local);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  // Both GMT and BST are checked. During the autumn overlap, use the first occurrence.
  for (const offsetHours of [1, 0]) {
    const candidate = new Date(local - offsetHours * 3_600_000);
    const parts = londonParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day &&
        parts.hour === hour && parts.minute === minute && parts.second === second) return candidate;
  }
  return null; // The local clock time does not exist during the spring change.
}

export function calendarTimes(item: CalendarExport) {
  const start = londonDateTimeToUtc(item.date, item.startTime);
  const end = londonDateTimeToUtc(item.date, item.endTime);
  return start && end && end > start ? { start, end } : null;
}

function venueLabel(venue?: string) {
  return ({ indoor: "Indoor", outdoor: "Outdoor", both: "Indoor and outdoor" })[venue ?? ""] ?? venue?.trim() ?? "";
}

export function eventCalendarExport(event: ClubEvent, portalUrl: string): CalendarExport | null {
  const types = event.types?.length ? event.types : [event.type];
  if (event.isCancelled || event.isRejected || event.isPendingApproval || event.isApproved === false ||
      types.includes("range-closed") ||
      !types.some((type) => type === "competition" || type === "social")) return null;
  return { kind: "event", id: event.id, title: event.title, description: event.details,
    date: event.date, startTime: event.startTime, endTime: event.endTime,
    location: venueLabel(event.venue), portalUrl };
}

export function coachingCalendarExport(session: CoachingSession, portalUrl: string): CalendarExport | null {
  if (session.isCancelled || session.isRejected || session.isPendingApproval || session.isApproved === false) return null;
  return { kind: "coaching", id: session.id, title: session.topic, description: session.summary,
    date: session.date, startTime: session.startTime, endTime: session.endTime,
    location: venueLabel(session.venue), portalUrl };
}

export function lessonCalendarExport(lesson: BeginnersCourseCalendarLesson, portalUrl: string): CalendarExport | null {
  if (lesson.isCancelled || !["beginners", "have-a-go", "taster-session"].includes(lesson.courseType ?? "beginners")) return null;
  return { kind: "lesson", id: lesson.id,
    title: `${lesson.title} — ${lesson.courseType === "beginners" || !lesson.courseType ? "Lesson" : "Session"} ${lesson.lessonNumber}`,
    description: `Coordinator: ${lesson.coordinatorName}${lesson.coachNames.length ? `\nCoaches: ${lesson.coachNames.join(", ")}` : ""}`,
    date: lesson.date, startTime: lesson.startTime, endTime: lesson.endTime,
    portalUrl };
}

export function googleCalendarUrl(item: CalendarExport): string | null {
  const times = calendarTimes(item);
  if (!times) return null;
  const params = new URLSearchParams({ action: "TEMPLATE", text: item.title,
    dates: `${stamp(times.start)}/${stamp(times.end)}`,
    details: [item.description?.trim(), item.portalUrl].filter(Boolean).join("\n\n"),
    ctz: "Europe/London" });
  if (item.location?.trim()) params.set("location", item.location.trim());
  return `https://calendar.google.com/calendar/render?${params}`;
}

function stamp(date: Date) { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }

function fold(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { chunks.push(chunk); chunk = " "; bytes = 1; }
    chunk += char; bytes += size;
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
}

export function createIcs(item: CalendarExport, generatedAt = new Date()): string | null {
  const times = calendarTimes(item);
  if (!times) return null;
  const uid = `${item.kind}-${encodeURIComponent(String(item.id))}@selbyarcheryclub.portal`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Selby Archery Club//Portal Calendar//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${uid}`,
    `DTSTAMP:${stamp(generatedAt)}`, `DTSTART:${stamp(times.start)}`, `DTEND:${stamp(times.end)}`,
    `SUMMARY:${escapeIcs(item.title)}`,
    `DESCRIPTION:${escapeIcs([item.description?.trim(), item.portalUrl].filter(Boolean).join("\n\n"))}`,
    `URL:${item.portalUrl}`];
  if (item.location?.trim()) lines.push(`LOCATION:${escapeIcs(item.location.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
