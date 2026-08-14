import { useMemo } from "react";
import type {
  BeginnersCourseCalendarLesson,
  CoachingSession,
} from "../../../types/app";

type CalendarEventBase = {
  id: string | number;
  date: string;
  startTime: string;
  type: string;
  types?: string[];
  isRejected?: boolean;
  isCancelled?: boolean;
  isPendingApproval?: boolean;
};

export type EventCalendarFilterKey = CalendarEventBase["type"] | "coaching" | "beginners";

export type EventCalendarEventItem<TEvent extends CalendarEventBase> = TEvent & {
  kind: "event";
};

export type EventCalendarCoachingItem = CoachingSession & {
  kind: "coaching";
};

export type EventCalendarBeginnersLessonItem = BeginnersCourseCalendarLesson & {
  kind: "beginners";
};

export type EventCalendarScheduleItem<TEvent extends CalendarEventBase> =
  | EventCalendarEventItem<TEvent>
  | EventCalendarCoachingItem
  | EventCalendarBeginnersLessonItem;

export function getEventTypes(event: Pick<CalendarEventBase, "type" | "types">) {
  const normalizedTypes = [...new Set(
    (event.types?.length ? event.types : [event.type])
      .filter((type): type is string => typeof type === "string")
      .map((type) => type.trim())
      .filter(Boolean),
  )];

  return normalizedTypes.length > 0 ? normalizedTypes : ["competition"];
}

export function eventMatchesType(
  event: Pick<CalendarEventBase, "type" | "types">,
  filterKey: CalendarEventBase["type"],
) {
  return getEventTypes(event).includes(filterKey);
}

export function useEventCalendarSchedule<TEvent extends CalendarEventBase>({
  events,
  coachingSessions,
  beginnersLessons,
  activeFilters,
  selectedDate,
  selectedEventId,
  selectedCoachingSessionId,
  cancelEventId,
  year,
  month,
}: {
  events: TEvent[];
  coachingSessions: CoachingSession[];
  beginnersLessons: BeginnersCourseCalendarLesson[];
  activeFilters: EventCalendarFilterKey[];
  selectedDate: string;
  selectedEventId: TEvent["id"] | null;
  selectedCoachingSessionId: CoachingSession["id"] | null;
  cancelEventId: TEvent["id"] | null;
  year: number;
  month: number;
}) {
  const filteredScheduleItems = useMemo(
    () => {
      const isUnfiltered = activeFilters.length === 0;

      return [
        ...events
          .filter(
            (event) =>
              isUnfiltered ||
              activeFilters.some((filterKey) => eventMatchesType(event, filterKey)),
          )
          .map((event) => ({ ...event, kind: "event" as const })),
        ...coachingSessions
          .filter(() => isUnfiltered || activeFilters.includes("coaching"))
          .map((session) => ({
            ...session,
            kind: "coaching" as const,
          })),
        ...beginnersLessons
          .filter(() => isUnfiltered || activeFilters.includes("beginners"))
          .map((lesson) => ({
            ...lesson,
            kind: "beginners" as const,
          })),
      ];
    },
    [activeFilters, beginnersLessons, coachingSessions, events],
  );

  const scheduleItemsByDate = useMemo(
    () =>
      filteredScheduleItems
        .sort((left, right) => {
          const byDate = left.date.localeCompare(right.date);
          if (byDate !== 0) {
            return byDate;
          }

          const byStartTime = left.startTime.localeCompare(right.startTime);
          if (byStartTime !== 0) {
            return byStartTime;
          }

          return String(left.id).localeCompare(String(right.id));
        })
        .reduce<Record<string, EventCalendarScheduleItem<TEvent>[]>>((acc, evt) => {
          (acc[evt.date] = acc[evt.date] || []).push(evt);
          return acc;
        }, {}),
    [filteredScheduleItems],
  );

  const selectedScheduleItems = useMemo(
    () => (selectedDate ? scheduleItemsByDate[selectedDate] || [] : []),
    [scheduleItemsByDate, selectedDate],
  );
  const selectedEvents = useMemo(
    () =>
      selectedScheduleItems.filter(
        (item): item is EventCalendarEventItem<TEvent> => item.kind === "event",
      ),
    [selectedScheduleItems],
  );
  const selectedCoachingSessions = useMemo(
    () =>
      selectedScheduleItems.filter(
        (item): item is EventCalendarCoachingItem => item.kind === "coaching",
      ),
    [selectedScheduleItems],
  );
  const selectedCoachingSessionDetail = useMemo(
    () =>
      selectedCoachingSessions.find(
        (session) => session.id === selectedCoachingSessionId,
      ) ?? null,
    [selectedCoachingSessionId, selectedCoachingSessions],
  );
  const selectedBeginnersLessons = useMemo(
    () =>
      selectedScheduleItems.filter(
        (item): item is EventCalendarBeginnersLessonItem => item.kind === "beginners",
      ),
    [selectedScheduleItems],
  );
  const activeSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => !event.isRejected && !event.isCancelled),
    [selectedEvents],
  );
  const activeSelectedCoachingSessions = useMemo(
    () =>
      selectedCoachingSessions.filter(
        (session) => !session.isRejected && !session.isCancelled,
      ),
    [selectedCoachingSessions],
  );
  const activeSelectedBeginnersLessons = useMemo(
    () => selectedBeginnersLessons.filter((lesson) => !lesson.isCancelled),
    [selectedBeginnersLessons],
  );
  const pendingSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isPendingApproval),
    [selectedEvents],
  );
  const rejectedSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isRejected && !event.isCancelled),
    [selectedEvents],
  );
  const rejectedSelectedCoachingSessions = useMemo(
    () =>
      selectedCoachingSessions.filter(
        (session) => session.isRejected && !session.isCancelled,
      ),
    [selectedCoachingSessions],
  );
  const cancelledSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isCancelled),
    [selectedEvents],
  );
  const cancelledSelectedCoachingSessions = useMemo(
    () => selectedCoachingSessions.filter((session) => session.isCancelled),
    [selectedCoachingSessions],
  );
  const cancelledSelectedBeginnersLessons = useMemo(
    () => selectedBeginnersLessons.filter((lesson) => lesson.isCancelled),
    [selectedBeginnersLessons],
  );
  const selectedEventDetail = useMemo(
    () => selectedEvents.find((event) => event.id === selectedEventId) ?? null,
    [selectedEventId, selectedEvents],
  );
  const cancellableEvents = useMemo(
    () =>
      events.filter((event) => {
        const normalizedId = String(event.id);
        return /^\d+$/.test(normalizedId);
      }),
    [events],
  );
  const cancelEventTarget = useMemo(
    () => cancellableEvents.find((event) => event.id === cancelEventId) ?? null,
    [cancelEventId, cancellableEvents],
  );
  const currentMonthAgendaItems = useMemo(
    () =>
      filteredScheduleItems.filter((item) => {
        const itemDate = new Date(`${item.date}T12:00:00`);

        return itemDate.getFullYear() === year && itemDate.getMonth() === month;
      }),
    [filteredScheduleItems, month, year],
  );

  return {
    filteredScheduleItems,
    scheduleItemsByDate,
    selectedScheduleItems,
    selectedEvents,
    selectedCoachingSessions,
    selectedCoachingSessionDetail,
    selectedBeginnersLessons,
    activeSelectedEvents,
    activeSelectedCoachingSessions,
    activeSelectedBeginnersLessons,
    pendingSelectedEvents,
    rejectedSelectedEvents,
    rejectedSelectedCoachingSessions,
    cancelledSelectedEvents,
    cancelledSelectedCoachingSessions,
    cancelledSelectedBeginnersLessons,
    selectedEventDetail,
    cancellableEvents,
    cancelEventTarget,
    currentMonthAgendaItems,
  };
}
