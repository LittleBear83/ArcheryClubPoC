import type { CoachingSession } from "../../../types/app";
import {
  calendarTimes, coachingCalendarExport, eventCalendarExport,
  type CalendarExport,
} from "./calendarExport";

type BookedClubEvent = Parameters<typeof eventCalendarExport>[0] & {
  isBookedOn?: boolean;
};

export type MyEvent = {
  item: CalendarExport;
  start: Date;
  end: Date;
};

export function getMyEvents(
  events: BookedClubEvent[],
  coachingSessions: CoachingSession[],
  now: Date,
  portalUrl: string,
): MyEvent[] {
  const booked = [
    ...events.filter((event) => event.isBookedOn)
      .map((event) => eventCalendarExport(event, portalUrl)),
    ...coachingSessions.filter((session) => session.isBookedOn)
      .map((session) => coachingCalendarExport(session, portalUrl)),
  ];

  return booked.flatMap((item) => {
    if (!item) return [];
    const times = calendarTimes(item);
    return times && times.end > now ? [{ item, start: times.start, end: times.end }] : [];
  }).sort((left, right) =>
    left.start.getTime() - right.start.getTime() ||
    left.item.kind.localeCompare(right.item.kind) ||
    String(left.item.id).localeCompare(String(right.item.id)),
  );
}
