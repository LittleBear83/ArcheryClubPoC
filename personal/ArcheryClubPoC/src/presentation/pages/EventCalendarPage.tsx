import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { Button } from "../components/Button";
import { SummaryDate } from "../components/SummaryDate";
import { SummaryList } from "../components/SummaryList";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import { fetchApi } from "../../lib/api";
import type {
  BeginnersCourseCalendarLesson,
  CoachingSession,
  UserProfile,
} from "../../types/app";

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString: string, daysToAdd: number) {
  const nextDate = new Date(`${dateString}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + daysToAdd);
  return nextDate.toISOString().slice(0, 10);
}

function buildRecurringDates(
  startDate: string,
  repeatUntilDate: string,
  repeatPattern: "weekly" | "monthly",
) {
  if (!startDate || !repeatUntilDate || repeatUntilDate < startDate) {
    return [startDate].filter(Boolean);
  }

  const generatedDates = [startDate];

  if (repeatPattern === "weekly") {
    let nextDate = startDate;

    while (true) {
      nextDate = addDays(nextDate, 7);
      if (nextDate > repeatUntilDate) {
        break;
      }
      generatedDates.push(nextDate);
    }

    return generatedDates;
  }

  const start = new Date(`${startDate}T12:00:00`);
  const targetDay = start.getDate();
  let monthOffset = 1;

  while (monthOffset < 60) {
    const candidate = new Date(
      start.getFullYear(),
      start.getMonth() + monthOffset,
      targetDay,
      12,
      0,
      0,
    );
    monthOffset += 1;

    if (candidate.getDate() !== targetDay) {
      continue;
    }

    const candidateDate = candidate.toISOString().slice(0, 10);

    if (candidateDate > repeatUntilDate) {
      break;
    }

    generatedDates.push(candidateDate);
  }

  return generatedDates;
}

function hasEventEnded(event) {
  if (!event?.date || !event?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(event.endTime)
    ? `${event.endTime}:00`
    : event.endTime;
  const eventEnd = new Date(`${event.date}T${normalizedEndTime}`);

  if (Number.isNaN(eventEnd.getTime())) {
    return false;
  }

  return eventEnd.getTime() <= Date.now();
}

function hasSessionEnded(session) {
  if (!session?.date || !session?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(session.endTime)
    ? `${session.endTime}:00`
    : session.endTime;
  const sessionEnd = new Date(`${session.date}T${normalizedEndTime}`);

  if (Number.isNaN(sessionEnd.getTime())) {
    return false;
  }

  return sessionEnd.getTime() <= Date.now();
}

function buildHeaders(currentUserProfile) {
  return {
    "Content-Type": "application/json",
    "x-actor-username": currentUserProfile?.auth?.username ?? "",
  };
}

function TrainingIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 12h10m0 0-3.2-3.2M14 12l-3.2 3.2M14 12h4m0 0 2-2m-2 2 2 2M8.2 5.6A8 8 0 0 1 8.2 18.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

const EVENT_TYPE_OPTIONS = [
  { value: "competition", label: "Competition", className: "event-type-competition" },
  { value: "social", label: "Social event", className: "event-type-social" },
  { value: "range-closed", label: "Range closed", className: "event-type-range-closed" },
];
const VENUE_OPTIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "both", label: "Indoor and outdoor" },
];

type CalendarEvent = {
  id: string | number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  details?: string;
  type: string;
  venue: string;
  isBookedOn?: boolean;
  isPendingApproval?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
  isApproved?: boolean;
  canApprove?: boolean;
};

type MixedCalendarEvent = CalendarEvent & {
  kind: "event";
};

type MixedCoachingSession = CoachingSession & {
  kind: "coaching";
};

type MixedBeginnersLesson = BeginnersCourseCalendarLesson & {
  kind: "beginners";
};

type CalendarScheduleItem =
  | MixedCalendarEvent
  | MixedCoachingSession
  | MixedBeginnersLesson;

type EventCalendarPageProps = {
  currentUserProfile: UserProfile | null;
  onBookingsChanged?: () => void;
};

type EventCreationMode = "single" | "recurring" | "multiple";
type CoachingCreationMode = "single" | "recurring" | "multiple";
type CalendarFilterKey =
  | CalendarEvent["type"]
  | "coaching"
  | "beginners";

const eventQueryKeys = {
  list: (username: string) => ["events", username] as const,
};

const ALL_CALENDAR_FILTERS: CalendarFilterKey[] = [
  "competition",
  "social",
  "range-closed",
  "coaching",
  "beginners",
];

function getVenueLabel(venue) {
  return (
    VENUE_OPTIONS.find((option) => option.value === venue)?.label ??
    "Indoor and outdoor"
  );
}

async function fetchEvents(actorUsername: string): Promise<CalendarEvent[]> {
  const result = await fetchApi<{ success: true; events?: CalendarEvent[] }>(
    "/api/events",
    {
      headers: actorUsername
        ? { "x-actor-username": actorUsername }
        : undefined,
      cache: "no-store",
    },
  );

  return result.events ?? [];
}

async function fetchCoachingSessions(
  actorUsername: string,
): Promise<CoachingSession[]> {
  const result = await fetchApi<{ success: true; sessions?: CoachingSession[] }>(
    "/api/coaching-sessions",
    {
      headers: actorUsername
        ? { "x-actor-username": actorUsername }
        : undefined,
      cache: "no-store",
    },
  );

  return result.sessions ?? [];
}

async function fetchBeginnersCourseLessons(): Promise<
  BeginnersCourseCalendarLesson[]
> {
  const result = await fetchApi<{
    success: true;
    lessons?: BeginnersCourseCalendarLesson[];
  }>("/api/beginners-courses/calendar", {
    cache: "no-store",
  });

  return result.lessons ?? [];
}

export function EventCalendarPage({
  currentUserProfile,
  onBookingsChanged,
}: EventCalendarPageProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [newEvent, setNewEvent] = useState("");
  const [newEventDate, setNewEventDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] = useState("10:00");
  const [newEventDetails, setNewEventDetails] = useState("");
  const [newEventType, setNewEventType] = useState("competition");
  const [newEventVenue, setNewEventVenue] = useState("indoor");
  const [eventCreationMode, setEventCreationMode] = useState<EventCreationMode>("single");
  const [repeatPattern, setRepeatPattern] = useState<"weekly" | "monthly">("weekly");
  const [repeatUntilDate, setRepeatUntilDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [multiDateModalOpen, setMultiDateModalOpen] = useState(false);
  const [multiDateYear, setMultiDateYear] = useState(today.getFullYear());
  const [multiDateMonth, setMultiDateMonth] = useState(today.getMonth());
  const [selectedMultiDates, setSelectedMultiDates] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<CalendarEvent["id"] | null>(
    null,
  );
  const [cancelEventModalOpen, setCancelEventModalOpen] = useState(false);
  const [cancelEventId, setCancelEventId] = useState<CalendarEvent["id"] | null>(null);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [cancelConfirmationText, setCancelConfirmationText] = useState("");
  const [isCoachingModalOpen, setIsCoachingModalOpen] = useState(false);
  const [selectedCoachingSessionId, setSelectedCoachingSessionId] = useState<
    CoachingSession["id"] | null
  >(null);
  const [coachingCreationMode, setCoachingCreationMode] =
    useState<CoachingCreationMode>("single");
  const [coachingRepeatPattern, setCoachingRepeatPattern] = useState<
    "weekly" | "monthly"
  >("weekly");
  const [coachingRepeatUntilDate, setCoachingRepeatUntilDate] = useState(
    today.toISOString().slice(0, 10),
  );
  const [coachingMultiDateModalOpen, setCoachingMultiDateModalOpen] =
    useState(false);
  const [coachingMultiDateYear, setCoachingMultiDateYear] = useState(
    today.getFullYear(),
  );
  const [coachingMultiDateMonth, setCoachingMultiDateMonth] = useState(
    today.getMonth(),
  );
  const [selectedCoachingMultiDates, setSelectedCoachingMultiDates] = useState<
    string[]
  >([]);
  const [coachingForm, setCoachingForm] = useState({
    topic: "",
    summary: "",
    venue: "indoor",
    date: today.toISOString().slice(0, 10),
    startTime: "18:00",
    endTime: "19:00",
    availableSlots: 4,
  });
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateString());
  const [activeFilters, setActiveFilters] = useState<CalendarFilterKey[]>([]);
  const [bookingMessage, setBookingMessage] = useState("");
  const [eventFormError, setEventFormError] = useState("");
  const [coachingFormError, setCoachingFormError] = useState("");
  const queryClient = useQueryClient();
  const canCreateEvents = hasPermission(
    currentUserProfile,
    "add_events",
  );
  const canApproveEvents = hasPermission(currentUserProfile, "approve_events");
  const canCancelEvents = hasPermission(currentUserProfile, "cancel_events");
  const canManageCoachingSessions = hasPermission(
    currentUserProfile,
    "add_coaching_sessions",
  );
  const canApproveSessions = hasPermission(
    currentUserProfile,
    "approve_coaching_sessions",
  );
  const actorUsername = currentUserProfile?.auth?.username ?? "";
  const canManageBookings = Boolean(actorUsername);

  const getEventTypeDetails = (type) =>
    EVENT_TYPE_OPTIONS.find((option) => option.value === type) ??
    EVENT_TYPE_OPTIONS[0];

  const { data: events = [] } = useQuery({
    queryKey: eventQueryKeys.list(actorUsername),
    queryFn: () => fetchEvents(actorUsername),
    refetchInterval: 60000,
  });

  const { data: coachingSessions = [] } = useQuery({
    queryKey: ["coaching-sessions", actorUsername],
    queryFn: () => fetchCoachingSessions(actorUsername),
    refetchInterval: 60000,
  });

  const { data: beginnersLessons = [] } = useQuery({
    queryKey: ["beginners-course-calendar"],
    queryFn: fetchBeginnersCourseLessons,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      void queryClient.invalidateQueries({
        queryKey: ["coaching-sessions", actorUsername],
      });
      void queryClient.invalidateQueries({
        queryKey: ["beginners-course-calendar"],
      });
    };

    window.addEventListener("event-data-updated", refresh);
    window.addEventListener("coaching-data-updated", refresh);
    window.addEventListener("beginners-course-data-updated", refresh);
    window.addEventListener("member-bookings-updated", refresh);

    return () => {
      window.removeEventListener("event-data-updated", refresh);
      window.removeEventListener("coaching-data-updated", refresh);
      window.removeEventListener("beginners-course-data-updated", refresh);
      window.removeEventListener("member-bookings-updated", refresh);
    };
  }, [actorUsername, queryClient]);

  const addEventMutation = useMutation({
    mutationFn: async (eventDates: string[]) => {
      const headers = {
        "Content-Type": "application/json",
        "x-actor-username": currentUserProfile?.auth?.username ?? "",
      };
      const createdEvents: CalendarEvent[] = [];
      const failures: string[] = [];

      for (const eventDate of eventDates) {
        try {
          const result = await fetchApi<{
            success: true;
            event: CalendarEvent;
            message?: string;
          }>("/api/events", {
            method: "POST",
            headers,
            cache: "no-store",
            body: JSON.stringify({
              date: eventDate,
              startTime: newEventStartTime,
              endTime: newEventEndTime,
              title: newEvent.trim(),
              details: newEventDetails.trim(),
              type: newEventType,
              venue: newEventVenue,
            }),
          });

          createdEvents.push(result.event);
        } catch (error) {
          failures.push(
            `${eventDate}: ${error instanceof Error ? error.message : "Unable to save event."}`,
          );
        }
      }

      if (createdEvents.length === 0) {
        throw new Error(failures[0] ?? "Unable to save event.");
      }

      return {
        createdEvents,
        failures,
      };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setNewEvent("");
      setNewEventDate(today.toISOString().slice(0, 10));
      setNewEventStartTime("09:00");
      setNewEventEndTime("10:00");
      setNewEventDetails("");
      setNewEventType("competition");
      setNewEventVenue("indoor");
      setEventCreationMode("single");
      setRepeatPattern("weekly");
      setRepeatUntilDate(today.toISOString().slice(0, 10));
      setSelectedMultiDates([]);
      setMultiDateModalOpen(false);
      setEventFormError("");
      setIsModalOpen(false);
      setBookingMessage(
        result.failures.length > 0
          ? `${result.createdEvents.length} event${result.createdEvents.length === 1 ? "" : "s"} saved. ${result.failures.length} could not be created.`
          : `${result.createdEvents.length} event${result.createdEvents.length === 1 ? "" : "s"} saved successfully.`,
      );
      window.dispatchEvent(new Event("event-data-updated"));
    },
    onError: (error: Error) => {
      setEventFormError(error.message);
    },
  });

  const addEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.trim()) return;

    const eventDates =
      eventCreationMode === "multiple"
        ? [...selectedMultiDates].sort()
        : eventCreationMode === "recurring"
          ? buildRecurringDates(newEventDate, repeatUntilDate, repeatPattern)
          : [newEventDate];

    if (eventDates.length === 0) {
      setEventFormError("Choose at least one date for this event.");
      return;
    }

    if (
      eventCreationMode === "recurring" &&
      (!repeatUntilDate || repeatUntilDate < newEventDate)
    ) {
      setEventFormError("Repeat until date must be on or after the first event date.");
      return;
    }

    await addEventMutation.mutateAsync(eventDates);
  };

  const filteredScheduleItems = useMemo(
    () => {
      const isUnfiltered = activeFilters.length === 0;

      return [
        ...events
          .filter(
            (event) =>
              isUnfiltered ||
              activeFilters.includes(event.type as CalendarFilterKey),
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
        .reduce<Record<string, CalendarScheduleItem[]>>((acc, evt) => {
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
        (item): item is MixedCalendarEvent => item.kind === "event",
      ),
    [selectedScheduleItems],
  );
  const selectedCoachingSessions = useMemo(
    () =>
      selectedScheduleItems.filter(
        (item): item is MixedCoachingSession => item.kind === "coaching",
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
        (item): item is MixedBeginnersLesson => item.kind === "beginners",
      ),
    [selectedScheduleItems],
  );
  const pendingSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isPendingApproval),
    [selectedEvents],
  );
  const rejectedSelectedEvents = useMemo(
    () => selectedEvents.filter((event) => event.isRejected),
    [selectedEvents],
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

  const handleDateSelect = (dateString) => {
    setSelectedDate(dateString);
    setSelectedEventId(null);
    setSelectedCoachingSessionId(null);
    setBookingMessage("");
  };

  const handleOpenModal = () => {
    setEventFormError("");
    setIsModalOpen(true);
  };

  const toggleMultiDateSelection = (dateKey: string) => {
    setSelectedMultiDates((current) =>
      current.includes(dateKey)
        ? current.filter((date) => date !== dateKey)
        : [...current, dateKey].sort(),
    );
  };

  const toggleCoachingMultiDateSelection = (dateKey: string) => {
    setSelectedCoachingMultiDates((current) =>
      current.includes(dateKey)
        ? current.filter((date) => date !== dateKey)
        : [...current, dateKey].sort(),
    );
  };

  const toggleFilter = (filterKey: CalendarFilterKey) => {
    setActiveFilters((current) =>
      current.length === 0
        ? [filterKey]
        : current.includes(filterKey)
          ? current.filter((key) => key !== filterKey)
          : [...current, filterKey],
    );
  };

  const clearFilters = () => {
    setActiveFilters([]);
  };

  const approveEventMutation = useMutation({
    mutationFn: async (event: CalendarEvent) =>
      fetchApi<{ success: true; event: CalendarEvent; message?: string }>(
        `/api/events/${event.id}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-actor-username": actorUsername,
          },
          cache: "no-store",
        },
      ),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(`${event.title} approved successfully.`);
      window.dispatchEvent(new Event("event-data-updated"));
    },
    onError: (error: Error) => {
      setBookingMessage(error.message);
    },
  });

  const approveEvent = async (event) => {
    await approveEventMutation.mutateAsync(event);
  };

  const bookEventMutation = useMutation({
    mutationFn: async (event: CalendarEvent) =>
      fetchApi<{ success: true; event: CalendarEvent; message?: string }>(
        `/api/events/${event.id}/book`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-actor-username": actorUsername,
          },
          cache: "no-store",
        },
      ),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(
        `Booked onto ${event.title} on ${formatDate(selectedDate ?? "")} at ${formatClockTime(event.startTime)}.`,
      );
      onBookingsChanged?.();
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("event-data-updated"));
    },
    onError: (error: Error) => {
      setBookingMessage(error.message);
    },
  });

  const startBookingForEvent = async (event) => {
    if (!selectedDate || !event) {
      return;
    }
    await bookEventMutation.mutateAsync(event);
  };

  const leaveEventMutation = useMutation({
    mutationFn: async (event: CalendarEvent) =>
      fetchApi<{ success: true; event: CalendarEvent; message?: string }>(
        `/api/events/${event.id}/booking`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-actor-username": actorUsername,
          },
          cache: "no-store",
        },
      ),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(`You have left ${event.title} on ${formatDate(selectedDate ?? "")}.`);
      onBookingsChanged?.();
      window.dispatchEvent(new Event("member-bookings-updated"));
      window.dispatchEvent(new Event("event-data-updated"));
    },
    onError: (error: Error) => {
      setBookingMessage(error.message);
    },
  });

  const leaveEvent = async (event) => {
    if (!selectedDate || !event) {
      return;
    }
    await leaveEventMutation.mutateAsync(event);
  };

  const coachingSessionMutation = useMutation({
    mutationFn: async ({
      url,
      method,
      body,
    }: {
      url: string;
      method: string;
      body?: Record<string, unknown>;
    }) =>
      fetchApi<{ success: true; session?: CoachingSession; message?: string }>(
        url,
        {
          method,
          headers: buildHeaders(currentUserProfile),
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["coaching-sessions", actorUsername],
      });
      if (result.session?.date) {
        setSelectedDate(result.session.date);
        setSelectedCoachingSessionId(result.session.id);
      }
    },
    onError: (error: Error) => {
      setBookingMessage(error.message);
    },
  });

  const performCoachingSessionAction = async ({
    body,
    successMessage,
    url,
    method,
    afterSuccess,
  }: {
    body?: Record<string, unknown>;
    successMessage: (session: CoachingSession | undefined, message?: string) => string;
    url: string;
    method: string;
    afterSuccess?: () => void;
  }) => {
    const result = await coachingSessionMutation.mutateAsync({
      url,
      method,
      body,
    });

    setBookingMessage(successMessage(result.session, result.message));
    afterSuccess?.();
  };

  const createCoachingSessionsMutation = useMutation({
    mutationFn: async (dates: string[]) => {
      const createdSessions: CoachingSession[] = [];
      const failures: string[] = [];

      for (const date of dates) {
        try {
          const result = await fetchApi<{
            success: true;
            session?: CoachingSession;
          }>("/api/coaching-sessions", {
            method: "POST",
            headers: buildHeaders(currentUserProfile),
            body: JSON.stringify({
              ...coachingForm,
              date,
            }),
            cache: "no-store",
          });

          if (result.session) {
            createdSessions.push(result.session);
          }
        } catch (error) {
          failures.push(
            `${date}: ${error instanceof Error ? error.message : "Unable to add coaching session."}`,
          );
        }
      }

      if (createdSessions.length === 0) {
        throw new Error(failures[0] ?? "Unable to add coaching session.");
      }

      return { createdSessions, failures };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ["coaching-sessions", actorUsername],
      });
      setSelectedDate(result.createdSessions[0]?.date ?? getTodayDateString());
      setSelectedCoachingSessionId(result.createdSessions[0]?.id ?? null);
      setCoachingForm({
        topic: "",
        summary: "",
        venue: "indoor",
        date: today.toISOString().slice(0, 10),
        startTime: "18:00",
        endTime: "19:00",
        availableSlots: 4,
      });
      setCoachingCreationMode("single");
      setCoachingRepeatPattern("weekly");
      setCoachingRepeatUntilDate(today.toISOString().slice(0, 10));
      setSelectedCoachingMultiDates([]);
      setCoachingMultiDateModalOpen(false);
      setIsCoachingModalOpen(false);
      setCoachingFormError("");
      setBookingMessage(
        result.failures.length > 0
          ? `${result.createdSessions.length} coaching session${result.createdSessions.length === 1 ? "" : "s"} saved. ${result.failures.length} could not be created.`
          : `${result.createdSessions.length} coaching session${result.createdSessions.length === 1 ? "" : "s"} saved successfully.`,
      );
      window.dispatchEvent(new Event("coaching-data-updated"));
    },
    onError: (error: Error) => {
      setCoachingFormError(error.message);
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: async (event: CalendarEvent) =>
      fetchApi<{ success: true; message?: string }>(`/api/events/${event.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-actor-username": actorUsername,
        },
        cache: "no-store",
      }),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(`${event.title} cancelled successfully.`);
      setCancelEventModalOpen(false);
      setCancelEventId(null);
      setCancelConfirmationOpen(false);
      setCancelConfirmationText("");
      setSelectedEventId((current) => (current === event.id ? null : current));
      window.dispatchEvent(new Event("event-data-updated"));
      onBookingsChanged?.();
    },
    onError: (error: Error) => {
      setBookingMessage(error.message);
    },
  });

  const confirmCancelEvent = async () => {
    if (!cancelEventTarget || cancelConfirmationText.trim().toLowerCase() !== "delete") {
      return;
    }

    await cancelEventMutation.mutateAsync(cancelEventTarget);
  };

  return (
    <div className="event-calendar-page">
      <p>
        This calendar is the central place for club scheduling, bringing
        events, coaching sessions, and approved beginners course lessons
        together in one view.
      </p>
      <section className="event-calendar-layout event-calendar-layout-expanded">
        <div className="event-calendar-main">
          <div className="event-calendar-key" aria-label="Event type key">
            {EVENT_TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                className={[
                  "event-key-item",
                  "event-key-filter",
                  activeFilters.includes(option.value) ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => toggleFilter(option.value)}
                variant="ghost"
              >
                <span className={`event-key-swatch ${option.className}`} />
                {option.label}
              </Button>
            ))}
            <Button
              type="button"
              className={[
                "event-key-item",
                "event-key-filter",
                "coaching-key-item",
                activeFilters.includes("coaching") ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleFilter("coaching")}
              variant="ghost"
            >
              <span className="coaching-key-icon-wrap">
                <TrainingIcon className="coaching-key-icon" />
              </span>
              Coaching session
            </Button>
            <Button
              type="button"
              className={[
                "event-key-item",
                "event-key-filter",
                activeFilters.includes("beginners") ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggleFilter("beginners")}
              variant="ghost"
            >
              <span className="event-key-swatch beginners-course-key-swatch" />
              Beginners course
            </Button>
            <Button
              type="button"
              className="event-key-clear-button"
              onClick={clearFilters}
              disabled={activeFilters.length === 0}
              variant="ghost"
            >
              Clear filters
            </Button>
          </div>
          <Calendar
            year={year}
            month={month}
            selectedDate={selectedDate}
            onDayClick={handleDateSelect}
            onToday={() => {
              const todayDate = new Date();
              setYear(todayDate.getFullYear());
              setMonth(todayDate.getMonth());
              handleDateSelect(todayDate.toISOString().slice(0, 10));
            }}
            onPrevMonth={() => {
              if (month === 0) {
                setMonth(11);
                setYear((y) => y - 1);
              } else {
                setMonth((m) => m - 1);
              }
            }}
            onNextMonth={() => {
              if (month === 11) {
                setMonth(0);
                setYear((y) => y + 1);
              } else {
                setMonth((m) => m + 1);
              }
            }}
            itemsByDate={scheduleItemsByDate}
            renderDayMeta={(items) => {
              const typeClasses = [
                ...new Set(
                  items
                    .filter(
                      (item): item is MixedCalendarEvent => item.kind === "event",
                    )
                    .map((item) => getEventTypeDetails(item.type).className),
                ),
              ] as string[];
              const hasRejectedItems = items.some((item) => item.isRejected);
              const hasCoachingItems = items.some((item) => item.kind === "coaching");
              const hasBeginnersLessons = items.some(
                (item) => item.kind === "beginners",
              );

              return (
                <span className="calendar-day-key-markers" aria-hidden="true">
                  {hasRejectedItems ? (
                    <span className="calendar-day-rejected-flag" />
                  ) : null}
                  {typeClasses.map((typeClass) => (
                    <span
                      key={typeClass}
                      className={`calendar-day-key-dot ${typeClass}`}
                    />
                  ))}
                  {hasCoachingItems ? (
                    <span className="coaching-day-key-icon-wrap">
                      <TrainingIcon className="coaching-day-key-icon" />
                    </span>
                  ) : null}
                  {hasBeginnersLessons ? (
                    <span className="calendar-day-key-dot beginners-course-key-swatch" />
                  ) : null}
                </span>
              );
            }}
            renderItem={(item: CalendarScheduleItem) => {
              if (item.kind === "event") {
                return (
                  <span
                    className={[
                      "calendar-entry-label",
                      getEventTypeDetails(item.type).className,
                      item.isRejected ? "is-rejected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {item.title}
                  </span>
                );
              }

              if (item.kind === "coaching") {
                return (
                  <span
                    className={[
                      "calendar-entry-label",
                      "coaching-session-badge",
                      item.isRejected ? "is-rejected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <TrainingIcon className="coaching-badge-icon" />
                    {item.topic}
                  </span>
                );
              }

              return (
                <span className="calendar-entry-label beginners-course-badge">
                  Beginners L{item.lessonNumber}
                </span>
              );
            }}
          />
        </div>

        <aside className="event-summary-panel">
          <h3>Calendar summary</h3>
          {!selectedDate ? (
            <p>Select a date on the calendar to view event details.</p>
          ) : (
            <>
              <SummaryDate date={selectedDate} />
              {selectedScheduleItems.length === 0 ? (
                <p>
                  {activeFilters.length === 0
                    ? "No events, coaching sessions, or beginners lessons are scheduled for this date yet."
                    : "No calendar items match the current filters for this date."}
                </p>
              ) : (
                <>
                  {selectedEvents.length > 0 ? (
                    <>
                      <p className="event-summary-hint">
                        Click on an event for more information and booking options.
                      </p>
                      <div className="event-summary-card-list">
                        {selectedEvents.map((evt) => (
                          <Button
                            key={evt.id}
                            type="button"
                            className={[
                              "event-summary-card",
                              evt.isRejected ? "is-rejected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => setSelectedEventId(evt.id)}
                            variant="unstyled"
                          >
                            <span
                              className={`event-type-badge ${getEventTypeDetails(evt.type).className}`}
                            >
                              {getEventTypeDetails(evt.type).label}
                            </span>
                            <strong className="event-summary-card-title">{evt.title}</strong>
                            <span className="event-summary-card-time">
                              {formatClockTime(evt.startTime)} to {formatClockTime(evt.endTime)}
                            </span>
                            <span className="event-summary-card-meta">
                              {getVenueLabel(evt.venue)}
                              {evt.isBookedOn ? " | Booked on" : ""}
                              {evt.isPendingApproval ? " | Pending approval" : ""}
                              {evt.isRejected ? " | Request rejected" : ""}
                              {!evt.isBookedOn && hasEventEnded(evt)
                                ? " | Event finished"
                                : ""}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {selectedCoachingSessions.length > 0 ? (
                    <>
                      <h4>Coaching sessions</h4>
                      <div className="event-summary-card-list">
                        {selectedCoachingSessions.map((session) => (
                          <Button
                            key={session.id}
                            type="button"
                            className={[
                              "event-summary-card",
                              session.isRejected ? "is-rejected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => setSelectedCoachingSessionId(session.id)}
                            variant="unstyled"
                          >
                            <span className="coaching-session-badge">Coaching session</span>
                            <strong className="event-summary-card-title">{session.topic}</strong>
                            <span className="event-summary-card-time">
                              {formatClockTime(session.startTime)} to{" "}
                              {formatClockTime(session.endTime)}
                            </span>
                            <span className="event-summary-card-meta">
                              {getVenueLabel(session.venue)} | Coach: {session.coach.fullName}
                              {session.isBookedOn ? " | Booked on" : ""}
                              {session.isPendingApproval ? " | Pending approval" : ""}
                              {session.isRejected ? " | Request rejected" : ""}
                              {!session.isBookedOn && hasSessionEnded(session)
                                ? " | Session finished"
                                : ""}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {selectedBeginnersLessons.length > 0 ? (
                    <>
                      <h4>Beginners course lessons</h4>
                      <div className="event-summary-card-list">
                        {selectedBeginnersLessons.map((lesson) => (
                          <div key={lesson.id} className="event-summary-card">
                            <span className="event-type-badge beginners-course-badge">
                              Beginners course
                            </span>
                            <strong className="event-summary-card-title">
                              Lesson {lesson.lessonNumber}
                            </strong>
                            <span className="event-summary-card-time">
                              {formatClockTime(lesson.startTime)} to{" "}
                              {formatClockTime(lesson.endTime)}
                            </span>
                            <span className="event-summary-card-meta">
                              Coordinator: {lesson.coordinatorName} | Coaches:{" "}
                              {lesson.coachNames.length > 0
                                ? lesson.coachNames.join(", ")
                                : "To be assigned"}{" "}
                              | Beginners: {lesson.beginnerCount}/{lesson.beginnerCapacity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
              {pendingSelectedEvents.length > 0 && !canApproveEvents ? (
                <p>Pending events cannot be booked until approved.</p>
              ) : null}
              {rejectedSelectedEvents.some((event) => event.rejectionReason) ? (
                <p className="event-form-error">
                  Rejected event note:{" "}
                  {
                    rejectedSelectedEvents.find((event) => event.rejectionReason)
                      ?.rejectionReason
                  }
                </p>
              ) : null}
              {bookingMessage && (
                <p className="event-booking-message">{bookingMessage}</p>
              )}
            </>
          )}
        </aside>
      </section>

      {canCreateEvents ? (
        <div className="event-page-actions">
          <Button
            onClick={handleOpenModal}
          >
            Add event
          </Button>
          {canManageCoachingSessions ? (
            <Button
              type="button"
              onClick={() => {
                setCoachingFormError("");
                setIsCoachingModalOpen(true);
              }}
            >
              Add coaching session
            </Button>
          ) : null}
          {canCancelEvents ? (
            <Button
              type="button"
              className="event-danger-ghost-button"
              onClick={() => {
                setCancelEventModalOpen(true);
                setCancelEventId(null);
                setCancelConfirmationOpen(false);
                setCancelConfirmationText("");
              }}
              variant="ghost"
            >
              Cancel event
            </Button>
          ) : null}
        </div>
      ) : canManageCoachingSessions || canCancelEvents ? (
        <div className="event-page-actions">
          {canManageCoachingSessions ? (
            <Button
              type="button"
              onClick={() => {
                setCoachingFormError("");
                setIsCoachingModalOpen(true);
              }}
            >
              Add coaching session
            </Button>
          ) : null}
          {canCancelEvents ? (
            <Button
              type="button"
              className="event-danger-ghost-button"
              onClick={() => {
                setCancelEventModalOpen(true);
                setCancelEventId(null);
                setCancelConfirmationOpen(false);
                setCancelConfirmationText("");
              }}
              variant="ghost"
            >
              Cancel event
            </Button>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Event"
      >
        <form
          onSubmit={addEvent}
          className="left-align-form stack-gap-0"
        >
          <label>
            Event title
            <input
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value)}
              required
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={newEventDate}
              onChange={(e) => {
                setNewEventDate(e.target.value);
                if (repeatUntilDate < e.target.value) {
                  setRepeatUntilDate(e.target.value);
                }
              }}
              required
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              value={newEventStartTime}
              onChange={(e) => setNewEventStartTime(e.target.value)}
              required
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={newEventEndTime}
              onChange={(e) => setNewEventEndTime(e.target.value)}
              required
            />
          </label>
          <label>
            Event details
            <textarea
              value={newEventDetails}
              onChange={(e) => setNewEventDetails(e.target.value)}
              placeholder="Add extra details for members, for example format, notes, kit needed, or booking guidance."
            />
          </label>
          <div className="form-choice-group">
            <span className="form-choice-label">Schedule</span>
            <div className="form-choice-options">
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  eventCreationMode === "single" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setEventCreationMode("single")}
                variant="ghost"
              >
                One time
              </Button>
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  eventCreationMode === "recurring" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setEventCreationMode("recurring")}
                variant="ghost"
              >
                Recurring
              </Button>
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  eventCreationMode === "multiple" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setEventCreationMode("multiple")}
                variant="ghost"
              >
                Multiple days
              </Button>
            </div>
          </div>
          {eventCreationMode === "recurring" ? (
            <>
              <div className="form-choice-group">
                <span className="form-choice-label">Repeat pattern</span>
                <div className="form-choice-options">
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      repeatPattern === "weekly" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setRepeatPattern("weekly")}
                    variant="ghost"
                  >
                    Weekly
                  </Button>
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      repeatPattern === "monthly" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setRepeatPattern("monthly")}
                    variant="ghost"
                  >
                    Monthly
                  </Button>
                </div>
              </div>
              <label>
                Repeat until
                <input
                  type="date"
                  value={repeatUntilDate}
                  min={newEventDate}
                  onChange={(e) => setRepeatUntilDate(e.target.value)}
                  required
                />
              </label>
            </>
          ) : null}
          {eventCreationMode === "multiple" ? (
            <div className="form-choice-group">
              <span className="form-choice-label">Multiple event dates</span>
              <div className="event-multi-date-toolbar">
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => setMultiDateModalOpen(true)}
                  variant="secondary"
                >
                  Choose dates
                </Button>
                <span className="event-multi-date-copy">
                  {selectedMultiDates.length === 0
                    ? "No dates selected yet."
                    : `${selectedMultiDates.length} date${selectedMultiDates.length === 1 ? "" : "s"} selected.`}
                </span>
              </div>
            </div>
          ) : null}
          <div className="form-choice-group">
            <span className="form-choice-label">Event type</span>
            <div className="form-choice-options">
              {EVENT_TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  className={[
                    "form-choice-option",
                    "form-choice-option-keyed",
                    option.className,
                    newEventType === option.value ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setNewEventType(option.value)}
                  variant="ghost"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="form-choice-group">
            <span className="form-choice-label">Venue</span>
            <div className="form-choice-options">
              {VENUE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  className={[
                    "form-choice-option",
                    newEventVenue === option.value ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setNewEventVenue(option.value)}
                  variant="unstyled"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          {eventFormError ? <p className="event-form-error">{eventFormError}</p> : null}
          <div className="event-modal-actions">
            <Button type="submit">
              {canApproveEvents ? "Save Event" : "Submit For Approval"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={multiDateModalOpen}
        onClose={() => setMultiDateModalOpen(false)}
        title="Choose Event Dates"
      >
        <div className="event-multi-date-modal">
          <p>
            Select every date this event should be created on. Each chosen day will be submitted as its own event.
          </p>
          <Calendar
            year={multiDateYear}
            month={multiDateMonth}
            selectedDate={null}
            selectedDates={selectedMultiDates}
            onDayClick={toggleMultiDateSelection}
            onToday={() => {
              const todayDate = new Date();
              setMultiDateYear(todayDate.getFullYear());
              setMultiDateMonth(todayDate.getMonth());
            }}
            onPrevMonth={() => {
              if (multiDateMonth === 0) {
                setMultiDateMonth(11);
                setMultiDateYear((current) => current - 1);
              } else {
                setMultiDateMonth((current) => current - 1);
              }
            }}
            onNextMonth={() => {
              if (multiDateMonth === 11) {
                setMultiDateMonth(0);
                setMultiDateYear((current) => current + 1);
              } else {
                setMultiDateMonth((current) => current + 1);
              }
            }}
          />
          <div className="event-multi-date-summary">
            {selectedMultiDates.length === 0
              ? "No dates selected."
              : selectedMultiDates.join(", ")}
          </div>
          <div className="event-detail-actions">
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setSelectedMultiDates([])}
              variant="secondary"
            >
              Clear dates
            </Button>
            <Button
              type="button"
              onClick={() => setMultiDateModalOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={isCoachingModalOpen}
        onClose={() => setIsCoachingModalOpen(false)}
        title="Add Coaching Session"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();

            const dates =
              coachingCreationMode === "multiple"
                ? [...selectedCoachingMultiDates].sort()
                : coachingCreationMode === "recurring"
                  ? buildRecurringDates(
                      coachingForm.date,
                      coachingRepeatUntilDate,
                      coachingRepeatPattern,
                    )
                  : [coachingForm.date];

            if (dates.length === 0) {
              setCoachingFormError(
                "Choose at least one date for this coaching session.",
              );
              return;
            }

            if (
              coachingCreationMode === "recurring" &&
              (!coachingRepeatUntilDate ||
                coachingRepeatUntilDate < coachingForm.date)
            ) {
              setCoachingFormError(
                "Repeat until date must be on or after the first coaching date.",
              );
              return;
            }

            void createCoachingSessionsMutation.mutateAsync(dates);
          }}
          className="left-align-form"
        >
          <label>
            Session topic
            <input
              value={coachingForm.topic}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  topic: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Session summary
            <textarea
              value={coachingForm.summary}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  summary: event.target.value,
                }))
              }
              rows={4}
              required
            />
          </label>
          <label>
            Coaching date
            <input
              type="date"
              value={coachingForm.date}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
              required
            />
          </label>
          <div className="form-choice-group">
            <span className="form-choice-label">Schedule</span>
            <div className="form-choice-options">
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  coachingCreationMode === "single" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCoachingCreationMode("single")}
                variant="ghost"
              >
                One time
              </Button>
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  coachingCreationMode === "recurring" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCoachingCreationMode("recurring")}
                variant="ghost"
              >
                Recurring
              </Button>
              <Button
                type="button"
                className={[
                  "form-choice-option",
                  coachingCreationMode === "multiple" ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setCoachingCreationMode("multiple")}
                variant="ghost"
              >
                Multiple days
              </Button>
            </div>
          </div>
          {coachingCreationMode === "recurring" ? (
            <>
              <div className="form-choice-group">
                <span className="form-choice-label">Repeat pattern</span>
                <div className="form-choice-options">
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      coachingRepeatPattern === "weekly" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCoachingRepeatPattern("weekly")}
                    variant="ghost"
                  >
                    Weekly
                  </Button>
                  <Button
                    type="button"
                    className={[
                      "form-choice-option",
                      coachingRepeatPattern === "monthly" ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setCoachingRepeatPattern("monthly")}
                    variant="ghost"
                  >
                    Monthly
                  </Button>
                </div>
              </div>
              <label>
                Repeat until
                <input
                  type="date"
                  value={coachingRepeatUntilDate}
                  min={coachingForm.date}
                  onChange={(event) =>
                    setCoachingRepeatUntilDate(event.target.value)
                  }
                  required
                />
              </label>
            </>
          ) : null}
          {coachingCreationMode === "multiple" ? (
            <div className="form-choice-group">
              <span className="form-choice-label">Multiple coaching dates</span>
              <div className="event-multi-date-toolbar">
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCoachingMultiDateModalOpen(true)}
                  variant="secondary"
                >
                  Choose dates
                </Button>
                <span className="event-multi-date-copy">
                  {selectedCoachingMultiDates.length === 0
                    ? "No dates selected yet."
                    : `${selectedCoachingMultiDates.length} date${selectedCoachingMultiDates.length === 1 ? "" : "s"} selected.`}
                </span>
              </div>
            </div>
          ) : null}
          <div className="form-choice-group">
            <span className="form-choice-label">Venue</span>
            <div className="form-choice-options">
              {VENUE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  className={[
                    "form-choice-option",
                    coachingForm.venue === option.value ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() =>
                    setCoachingForm((current) => ({
                      ...current,
                      venue: option.value,
                    }))
                  }
                  variant="ghost"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <label>
            Start time
            <input
              type="time"
              value={coachingForm.startTime}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  startTime: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            End time
            <input
              type="time"
              value={coachingForm.endTime}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  endTime: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Available slots
            <input
              type="number"
              min="1"
              value={coachingForm.availableSlots}
              onChange={(event) =>
                setCoachingForm((current) => ({
                  ...current,
                  availableSlots: Math.max(
                    1,
                    Number.parseInt(event.target.value, 10) || 1,
                  ),
                }))
              }
              required
            />
          </label>
          {coachingFormError ? (
            <p className="event-form-error">{coachingFormError}</p>
          ) : null}
          <div className="event-modal-actions">
            <Button type="submit">
              {canApproveSessions ? "Add session" : "Submit For Approval"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={coachingMultiDateModalOpen}
        onClose={() => setCoachingMultiDateModalOpen(false)}
        title="Choose Coaching Dates"
      >
        <div className="event-multi-date-modal">
          <p>
            Select every date this coaching session should be created on. Each
            chosen day will be submitted as its own session.
          </p>
          <Calendar
            year={coachingMultiDateYear}
            month={coachingMultiDateMonth}
            selectedDate={null}
            selectedDates={selectedCoachingMultiDates}
            onDayClick={toggleCoachingMultiDateSelection}
            onToday={() => {
              const todayDate = new Date();
              setCoachingMultiDateYear(todayDate.getFullYear());
              setCoachingMultiDateMonth(todayDate.getMonth());
            }}
            onPrevMonth={() => {
              if (coachingMultiDateMonth === 0) {
                setCoachingMultiDateMonth(11);
                setCoachingMultiDateYear((current) => current - 1);
              } else {
                setCoachingMultiDateMonth((current) => current - 1);
              }
            }}
            onNextMonth={() => {
              if (coachingMultiDateMonth === 11) {
                setCoachingMultiDateMonth(0);
                setCoachingMultiDateYear((current) => current + 1);
              } else {
                setCoachingMultiDateMonth((current) => current + 1);
              }
            }}
          />
          <div className="event-multi-date-summary">
            {selectedCoachingMultiDates.length === 0
              ? "No dates selected."
              : selectedCoachingMultiDates.join(", ")}
          </div>
          <div className="event-detail-actions">
            <Button
              type="button"
              className="secondary-button"
              onClick={() => setSelectedCoachingMultiDates([])}
              variant="secondary"
            >
              Clear dates
            </Button>
            <Button
              type="button"
              onClick={() => setCoachingMultiDateModalOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(selectedEventDetail)}
        onClose={() => setSelectedEventId(null)}
        title={selectedEventDetail?.title ?? "Event details"}
      >
        {selectedEventDetail ? (
          <div className="event-detail-modal">
            <p>
              <span
                className={`event-type-badge ${getEventTypeDetails(selectedEventDetail.type).className}`}
              >
                {getEventTypeDetails(selectedEventDetail.type).label}
              </span>
            </p>
            <p>
              <strong>Date:</strong> {formatDate(selectedEventDetail.date)}
            </p>
            <p>
              <strong>Time:</strong> {formatClockTime(selectedEventDetail.startTime)} to{" "}
              {formatClockTime(selectedEventDetail.endTime)}
            </p>
            <p>
              <strong>Venue:</strong> {getVenueLabel(selectedEventDetail.venue)}
            </p>
            {selectedEventDetail.details ? (
              <p>
                <strong>Details:</strong> {selectedEventDetail.details}
              </p>
            ) : null}
            <p>
              <strong>Status:</strong>{" "}
              <span className="event-detail-status">
                {selectedEventDetail.isBookedOn
                  ? "Booked on"
                  : selectedEventDetail.isPendingApproval
                    ? "Pending approval"
                    : selectedEventDetail.isRejected
                      ? "Request rejected"
                      : hasEventEnded(selectedEventDetail)
                        ? "Event finished"
                        : selectedEventDetail.type === "range-closed"
                          ? "Not bookable"
                          : "Open for booking"}
              </span>
            </p>
            {selectedEventDetail.type === "range-closed" ? (
              <p className="event-detail-note event-detail-note-range-closed">
                Range closed event: this entry closes the range and cannot be booked onto.
              </p>
            ) : null}
            {selectedEventDetail.rejectionReason ? (
              <p className="event-form-error">
                Rejection reason: {selectedEventDetail.rejectionReason}
              </p>
            ) : null}
            <div className="event-detail-actions">
              {selectedEventDetail.canApprove ? (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() => approveEvent(selectedEventDetail)}
                  variant="secondary"
                >
                  Approve
                </Button>
              ) : null}
              {!selectedEventDetail.isBookedOn &&
              selectedEventDetail.isApproved &&
              selectedEventDetail.type !== "range-closed" &&
              !hasEventEnded(selectedEventDetail) &&
              canManageBookings ? (
                <Button
                  type="button"
                  className="event-book-button"
                  onClick={() => startBookingForEvent(selectedEventDetail)}
                >
                  Book on
                </Button>
              ) : null}
              {selectedEventDetail.isBookedOn && canManageBookings ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={() => leaveEvent(selectedEventDetail)}
                  variant="danger"
                >
                  Leave event
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedCoachingSessionDetail)}
        onClose={() => setSelectedCoachingSessionId(null)}
        title={selectedCoachingSessionDetail?.topic ?? "Coaching session details"}
      >
        {selectedCoachingSessionDetail ? (
          <div className="event-detail-modal">
            <p className="coaching-summary-heading">
              <span className="coaching-session-badge">
                <TrainingIcon className="coaching-badge-icon" />
                Archery training
              </span>
            </p>
            <p>
              <strong>Date:</strong> {formatDate(selectedCoachingSessionDetail.date)}
            </p>
            <p>
              <strong>Time:</strong> {formatClockTime(selectedCoachingSessionDetail.startTime)} to{" "}
              {formatClockTime(selectedCoachingSessionDetail.endTime)}
            </p>
            <p>
              <strong>Venue:</strong> {getVenueLabel(selectedCoachingSessionDetail.venue)}
            </p>
            <p>
              <strong>Coach:</strong> {selectedCoachingSessionDetail.coach.fullName}
            </p>
            <p>
              <strong>Details:</strong> {selectedCoachingSessionDetail.summary}
            </p>
            <p>
              <strong>Status:</strong>{" "}
              <span className="event-detail-status">
                {selectedCoachingSessionDetail.isBookedOn
                  ? "Booked on"
                  : selectedCoachingSessionDetail.isPendingApproval
                    ? "Pending approval"
                    : selectedCoachingSessionDetail.isRejected
                      ? "Request rejected"
                      : hasSessionEnded(selectedCoachingSessionDetail)
                        ? "Session finished"
                        : selectedCoachingSessionDetail.remainingSlots <= 0
                          ? "Session full"
                          : "Open for booking"}
              </span>
            </p>
            <p>
              <strong>Capacity:</strong> {selectedCoachingSessionDetail.bookingCount} of{" "}
              {selectedCoachingSessionDetail.availableSlots} slot
              {selectedCoachingSessionDetail.availableSlots === 1 ? "" : "s"} booked.
            </p>
            {selectedCoachingSessionDetail.isRejected ? (
              <p className="event-form-error">
                This coaching session request was rejected.
                {selectedCoachingSessionDetail.rejectionReason
                  ? ` Reason: ${selectedCoachingSessionDetail.rejectionReason}`
                  : ""}
              </p>
            ) : null}
            {canManageCoachingSessions &&
            selectedCoachingSessionDetail.coach.username === actorUsername ? (
              <>
                <h4>Booked Members</h4>
                {selectedCoachingSessionDetail.bookings.length > 0 ? (
                  <SummaryList
                    items={selectedCoachingSessionDetail.bookings}
                    renderItem={(booking) => booking.fullName}
                  />
                ) : (
                  <p>No members have booked onto this session yet.</p>
                )}
              </>
            ) : null}
            <div className="event-detail-actions">
              {selectedCoachingSessionDetail.canApprove ? (
                <Button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    void performCoachingSessionAction({
                      url: `/api/coaching-sessions/${selectedCoachingSessionDetail.id}/approve`,
                      method: "POST",
                      successMessage: (session, message) =>
                        message ??
                        `${session?.topic ?? selectedCoachingSessionDetail.topic} approved successfully.`,
                      afterSuccess: () => {
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="secondary"
                >
                  Approve session
                </Button>
              ) : null}
              {canManageCoachingSessions &&
              selectedCoachingSessionDetail.coach.username === actorUsername ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={() =>
                    void performCoachingSessionAction({
                      url: `/api/coaching-sessions/${selectedCoachingSessionDetail.id}`,
                      method: "DELETE",
                      successMessage: () =>
                        "Coaching session cancelled successfully.",
                      afterSuccess: () => {
                        setSelectedCoachingSessionId(null);
                        onBookingsChanged?.();
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="danger"
                >
                  Cancel session
                </Button>
              ) : selectedCoachingSessionDetail.isBookedOn ? (
                <Button
                  type="button"
                  className="event-cancel-button"
                  onClick={() =>
                    void performCoachingSessionAction({
                      url: `/api/coaching-sessions/${selectedCoachingSessionDetail.id}/booking`,
                      method: "DELETE",
                      successMessage: (session) =>
                        `Withdrawn from ${session?.topic ?? selectedCoachingSessionDetail.topic} on ${formatDate(session?.date ?? selectedCoachingSessionDetail.date)}.`,
                      afterSuccess: () => {
                        onBookingsChanged?.();
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                  variant="danger"
                >
                  Withdraw from session
                </Button>
              ) : (
                <Button
                  type="button"
                  className="event-book-button"
                  disabled={
                    !selectedCoachingSessionDetail.isApproved ||
                    selectedCoachingSessionDetail.remainingSlots <= 0 ||
                    hasSessionEnded(selectedCoachingSessionDetail)
                  }
                  onClick={() =>
                    void performCoachingSessionAction({
                      url: `/api/coaching-sessions/${selectedCoachingSessionDetail.id}/book`,
                      method: "POST",
                      successMessage: (session) =>
                        `Booked onto ${session?.topic ?? selectedCoachingSessionDetail.topic} on ${formatDate(session?.date ?? selectedCoachingSessionDetail.date)}.`,
                      afterSuccess: () => {
                        onBookingsChanged?.();
                        window.dispatchEvent(new Event("member-bookings-updated"));
                        window.dispatchEvent(new Event("coaching-data-updated"));
                      },
                    })
                  }
                >
                  {selectedCoachingSessionDetail.isRejected
                    ? "Request rejected"
                    : !selectedCoachingSessionDetail.isApproved
                      ? "Awaiting approval"
                      : hasSessionEnded(selectedCoachingSessionDetail)
                        ? "Booking closed"
                        : selectedCoachingSessionDetail.remainingSlots <= 0
                          ? "Session full"
                          : "Book on"}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={cancelEventModalOpen}
        onClose={() => {
          setCancelEventModalOpen(false);
          setCancelEventId(null);
          setCancelConfirmationOpen(false);
          setCancelConfirmationText("");
        }}
        title="Cancel Event"
      >
        <div className="event-cancel-flow">
          <p>Select an event to cancel.</p>
          <div className="event-cancel-list">
            {cancellableEvents.map((event) => (
              <Button
                key={event.id}
                type="button"
                className={[
                  "event-cancel-option",
                  cancelEventId === event.id ? "selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  setCancelEventId(event.id);
                  setCancelConfirmationOpen(false);
                  setCancelConfirmationText("");
                }}
                variant="ghost"
              >
                <span
                  className={`event-type-badge ${getEventTypeDetails(event.type).className}`}
                >
                  {getEventTypeDetails(event.type).label}
                </span>
                <strong>{event.title}</strong>
                <span>
                  {formatDate(event.date)} | {formatClockTime(event.startTime)} to{" "}
                  {formatClockTime(event.endTime)}
                </span>
              </Button>
            ))}
          </div>
          {cancelEventTarget ? (
            <>
              {!cancelConfirmationOpen ? (
                <Button
                  type="button"
                  className="event-danger-ghost-button"
                  onClick={() => setCancelConfirmationOpen(true)}
                  variant="ghost"
                >
                  Confirm cancellation
                </Button>
              ) : (
                <div className="event-cancel-confirmation">
                  <p>
                    Type <strong>delete</strong> to confirm cancellation of{" "}
                    <strong>{cancelEventTarget.title}</strong>.
                  </p>
                  <input
                    value={cancelConfirmationText}
                    onChange={(event) => setCancelConfirmationText(event.target.value)}
                    placeholder="Type delete"
                  />
                  <Button
                    type="button"
                    className="event-danger-ghost-button"
                    onClick={confirmCancelEvent}
                    disabled={
                      cancelConfirmationText.trim().toLowerCase() !== "delete" ||
                      cancelEventMutation.isPending
                    }
                    variant="ghost"
                  >
                    {cancelEventMutation.isPending ? "Cancelling..." : "Delete event"}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
