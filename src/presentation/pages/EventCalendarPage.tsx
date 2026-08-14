import { useMemo, useState } from "react";
import "./EventCalendarPage.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Calendar } from "../components/Calendar";
import { Button } from "../components/Button";
import { DatePicker } from "../components/DatePicker";
import { MobileKeyValueList } from "../components/mobile/MobileKeyValueList";
import { MobileSectionHeader } from "../components/mobile/MobileSectionHeader";
import { SummaryDate } from "../components/SummaryDate";
import { SummaryList } from "../components/SummaryList";
import { StatusMessagePanel } from "../components/StatusMessagePanel";
import { useIsMobile } from "../hooks/useIsMobile";
import { EventCalendarDesktopView } from "./event-calendar/EventCalendarDesktopView";
import { EventCalendarMobileView } from "./event-calendar/EventCalendarMobileView";
import {
  buildRecurringDates,
  EVENT_TYPE_OPTIONS,
  eventQueryKeys,
  getTodayDateString,
  getVenueLabel,
  parseDateString,
  VENUE_OPTIONS,
} from "./event-calendar/eventCalendarShared";
import {
  fetchCalendarBeginnersCourseLessons,
  fetchCalendarCoachingSessions,
  fetchCalendarEvents,
} from "./event-calendar/eventCalendarQueries";
import {
  useEventCalendarSchedule,
  eventMatchesType,
  getEventTypes,
  type EventCalendarFilterKey,
  type EventCalendarScheduleItem,
  type EventCalendarEventItem,
  type EventCalendarCoachingItem,
} from "./event-calendar/useEventCalendarSchedule";
import { formatClockTime, formatDate } from "../../utils/dateTime";
import { hasPermission } from "../../utils/userProfile";
import {
  approveCoachingSession,
  approveEvent as approveEventApi,
  bookCoachingSession,
  bookEvent,
  cancelCoachingSession,
  cancelEvent,
  createCoachingSession,
  createEvent,
  leaveCoachingSession,
  leaveEvent as leaveEventApi,
} from "../../api/scheduleApi";
import type {
  BeginnersCourseCalendarLesson,
  CoachingSession,
  EventBooking,
  UserProfile,
} from "../../types/app";

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

type CalendarEvent = {
  id: string | number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  details?: string;
  type: string;
  types?: string[];
  venue: string;
  bookings?: EventBooking[];
  bookingCount?: number;
  canViewBookings?: boolean;
  isBookedOn?: boolean;
  isPendingApproval?: boolean;
  isRejected?: boolean;
  rejectionReason?: string;
  isApproved?: boolean;
  canApprove?: boolean;
  isCancelled?: boolean;
  cancellationReason?: string;
};

type EventCalendarPageProps = {
  currentUserProfile: UserProfile | null;
  onBookingsChanged?: () => void;
};

type EventCreationMode = "single" | "recurring" | "multiple";
type CoachingCreationMode = "single" | "recurring" | "multiple";

function getCourseLessonLabel(lesson: BeginnersCourseCalendarLesson) {
  return lesson.courseType === "beginners" ? "Lesson" : "Session";
}

function getCourseParticipantLabel(lesson: BeginnersCourseCalendarLesson) {
  return lesson.courseType === "beginners" ? "Beginners" : "Participants";
}

function getCourseTypeLabel(lesson: BeginnersCourseCalendarLesson) {
  switch (lesson.courseType) {
    case "have-a-go":
      return "Have a Go";
    case "taster-session":
      return "Taster Session";
    default:
      return "Beginners";
  }
}

function getCancelledSummary(reason?: string) {
  const cancellationReason = reason?.trim();
  return cancellationReason ? ` | Cancelled: ${cancellationReason}` : " | Cancelled";
}

function mergeCalendarEvents(
  existingEvents: CalendarEvent[],
  createdEvents: CalendarEvent[],
) {
  const eventsById = new Map(
    existingEvents.map((event) => [String(event.id), event]),
  );

  for (const event of createdEvents) {
    eventsById.set(String(event.id), event);
  }

  return [...eventsById.values()].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byStartTime = left.startTime.localeCompare(right.startTime);

    if (byStartTime !== 0) {
      return byStartTime;
    }

    return String(left.id).localeCompare(String(right.id));
  });
}

function getCreatedEventMessage(createdEvents: CalendarEvent[], failures: string[]) {
  const pendingCount = createdEvents.filter((event) => event.isPendingApproval).length;
  const approvedCount = createdEvents.filter((event) => event.isApproved).length;

  if (createdEvents.length === 1) {
    if (pendingCount === 1) {
      return "Event submitted for approval.";
    }

    if (approvedCount === 1) {
      return "Event approved and published successfully.";
    }
  }

  const messageParts = [`${createdEvents.length} event${createdEvents.length === 1 ? "" : "s"} saved.`];

  if (pendingCount > 0) {
    messageParts.push(
      `${pendingCount} awaiting approval.`,
    );
  }

  if (approvedCount > 0) {
    messageParts.push(
      `${approvedCount} published immediately.`,
    );
  }

  if (failures.length > 0) {
    messageParts.push(
      `${failures.length} could not be created.`,
    );
  }

  return messageParts.join(" ");
}

const ALL_CALENDAR_FILTERS: EventCalendarFilterKey[] = [
  "competition",
  "social",
  "range-closed",
  "coaching",
  "beginners",
];

export function EventCalendarPage({
  currentUserProfile,
  onBookingsChanged,
}: EventCalendarPageProps) {
  const isMobile = useIsMobile();
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
  const [newEventTypes, setNewEventTypes] = useState<string[]>(["competition"]);
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
  const [activeFilters, setActiveFilters] = useState<EventCalendarFilterKey[]>([]);
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
  const hasRangeClosedType = (event: Pick<CalendarEvent, "type" | "types">) =>
    eventMatchesType(event, "range-closed");
  const toggleNewEventType = (type: string) => {
    setNewEventTypes((current) => {
      if (current.includes(type)) {
        return current.length === 1 ? current : current.filter((value) => value !== type);
      }

      return [...current, type];
    });
  };
  const renderEventTypeBadges = (event: Pick<CalendarEvent, "type" | "types">) => (
    <>
      {getEventTypes(event).map((type) => (
        <span
          key={type}
          className={`event-type-badge ${getEventTypeDetails(type).className}`}
        >
          {getEventTypeDetails(type).label}
        </span>
      ))}
    </>
  );

  const eventsQuery = useQuery({
    queryKey: eventQueryKeys.list(actorUsername),
    queryFn: () => fetchCalendarEvents<CalendarEvent>(actorUsername),
  });

  const coachingSessionsQuery = useQuery({
    queryKey: ["coaching-sessions", actorUsername],
    queryFn: () => fetchCalendarCoachingSessions(actorUsername),
  });

  const beginnersLessonsQuery = useQuery({
    queryKey: ["beginners-course-calendar"],
    queryFn: fetchCalendarBeginnersCourseLessons,
  });
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const coachingSessions = useMemo(
    () => coachingSessionsQuery.data ?? [],
    [coachingSessionsQuery.data],
  );
  const beginnersLessons = useMemo(
    () => beginnersLessonsQuery.data ?? [],
    [beginnersLessonsQuery.data],
  );
  const calendarLoadError =
    eventsQuery.error instanceof Error
      ? eventsQuery.error.message
      : coachingSessionsQuery.error instanceof Error
        ? coachingSessionsQuery.error.message
        : beginnersLessonsQuery.error instanceof Error
          ? beginnersLessonsQuery.error.message
          : "";
  const isCalendarLoading =
    eventsQuery.isLoading ||
    coachingSessionsQuery.isLoading ||
    beginnersLessonsQuery.isLoading;

  const addEventMutation = useMutation({
    mutationFn: async (eventDates: string[]) => {
      const createdEvents: CalendarEvent[] = [];
      const failures: string[] = [];

      for (const eventDate of eventDates) {
        try {
          const result = await createEvent<CalendarEvent>(
            currentUserProfile,
            {
              date: eventDate,
              startTime: newEventStartTime,
              endTime: newEventEndTime,
              title: newEvent.trim(),
              details: newEventDetails.trim(),
              type: newEventTypes[0],
              types: newEventTypes,
              venue: newEventVenue,
            },
          );

          createdEvents.push(result.event);
        } catch (error) {
          failures.push(
            `${formatDate(eventDate)}: ${error instanceof Error ? error.message : "Unable to save event."}`,
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
      const firstCreatedEvent = result.createdEvents[0] ?? null;

      setIsModalOpen(false);

      queryClient.setQueryData<CalendarEvent[]>(
        eventQueryKeys.list(actorUsername),
        (existingEvents = []) =>
          mergeCalendarEvents(existingEvents, result.createdEvents),
      );
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      if (firstCreatedEvent?.date) {
        const createdEventDate = parseDateString(firstCreatedEvent.date);

        setSelectedDate(firstCreatedEvent.date);
        setSelectedEventId(firstCreatedEvent.id);

        if (createdEventDate) {
          setYear(createdEventDate.getFullYear());
          setMonth(createdEventDate.getMonth());
        }
      }
      setNewEvent("");
      setNewEventDate(today.toISOString().slice(0, 10));
      setNewEventStartTime("09:00");
      setNewEventEndTime("10:00");
      setNewEventDetails("");
      setNewEventTypes(["competition"]);
      setNewEventVenue("indoor");
      setEventCreationMode("single");
      setRepeatPattern("weekly");
      setRepeatUntilDate(today.toISOString().slice(0, 10));
      setSelectedMultiDates([]);
      setMultiDateModalOpen(false);
      setEventFormError("");
      setBookingMessage(getCreatedEventMessage(result.createdEvents, result.failures));
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

  const {
    scheduleItemsByDate,
    selectedScheduleItems,
    selectedCoachingSessionDetail,
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
  } = useEventCalendarSchedule({
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
  });
  const hasRejectedSummaryItems =
    rejectedSelectedEvents.length > 0 || rejectedSelectedCoachingSessions.length > 0;
  const hasCancelledSummaryItems =
    cancelledSelectedEvents.length > 0 ||
    cancelledSelectedCoachingSessions.length > 0 ||
    cancelledSelectedBeginnersLessons.length > 0;

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

  const toggleFilter = (filterKey: EventCalendarFilterKey) => {
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
      approveEventApi<CalendarEvent>(actorUsername, event.id),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(`${event.title} approved successfully.`);
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
      bookEvent<CalendarEvent>(actorUsername, event.id),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(
        `Booked onto ${event.title} on ${formatDate(selectedDate ?? "")} at ${formatClockTime(event.startTime)}.`,
      );
      onBookingsChanged?.();
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
      leaveEventApi<CalendarEvent>(actorUsername, event.id),
    onSuccess: async (_result, event) => {
      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
      setBookingMessage(`You have left ${event.title} on ${formatDate(selectedDate ?? "")}.`);
      onBookingsChanged?.();
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
      action,
      sessionId,
    }: {
      action: "approve" | "cancel" | "leave" | "book";
      sessionId: string | number;
    }) => {
      if (action === "approve") {
        return approveCoachingSession(currentUserProfile, sessionId);
      }

      if (action === "cancel") {
        return cancelCoachingSession(currentUserProfile, sessionId);
      }

      if (action === "leave") {
        return leaveCoachingSession(currentUserProfile, sessionId);
      }

      return bookCoachingSession(currentUserProfile, sessionId);
    },
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
    successMessage,
    action,
    sessionId,
    afterSuccess,
  }: {
    successMessage: (session: CoachingSession | undefined, message?: string) => string;
    action: "approve" | "cancel" | "leave" | "book";
    sessionId: string | number;
    afterSuccess?: () => void;
  }) => {
    const result = await coachingSessionMutation.mutateAsync({
      action,
      sessionId,
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
          const result = await createCoachingSession(
            currentUserProfile,
            {
              ...coachingForm,
              date,
            },
          );

          if (result.session) {
            createdSessions.push(result.session);
          }
        } catch (error) {
          failures.push(
            `${formatDate(date)}: ${error instanceof Error ? error.message : "Unable to add coaching session."}`,
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
    },
    onError: (error: Error) => {
      setCoachingFormError(error.message);
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: async (event: CalendarEvent) =>
      cancelEvent(actorUsername, event.id),
    onSuccess: async (_result, event) => {
      setCancelEventModalOpen(false);
      setCancelEventId(null);
      setCancelConfirmationOpen(false);
      setCancelConfirmationText("");
      setSelectedEventId((current) => (current === event.id ? null : current));
      queryClient.setQueryData<CalendarEvent[]>(
        eventQueryKeys.list(actorUsername),
        (existingEvents = []) =>
          existingEvents.filter((existingEvent) => existingEvent.id !== event.id),
      );
      setBookingMessage(`${event.title} cancelled successfully.`);
      onBookingsChanged?.();

      await queryClient.invalidateQueries({
        queryKey: eventQueryKeys.list(actorUsername),
      });
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

  const handleCalendarToday = () => {
    const todayDate = new Date();
    setYear(todayDate.getFullYear());
    setMonth(todayDate.getMonth());
    handleDateSelect(todayDate.toISOString().slice(0, 10));
  };

  const handleCalendarPrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((current) => current - 1);
    } else {
      setMonth((current) => current - 1);
    }
  };

  const handleCalendarNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((current) => current + 1);
    } else {
      setMonth((current) => current + 1);
    }
  };

  const handleOpenScheduleItem = (item: EventCalendarScheduleItem<CalendarEvent>) => {
    setSelectedDate(item.date);

    if (item.kind === "event") {
      setSelectedEventId(item.id);
      return;
    }

    if (item.kind === "coaching") {
      setSelectedCoachingSessionId(item.id);
    }
  };

  const filterBar = (
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
        Beginners / Have a Go
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
  );

  const renderDesktopDayMeta = (items: Array<{ id: string | number }>) => {
    const scheduleItems = items as EventCalendarScheduleItem<CalendarEvent>[];
    const typeClasses = [
      ...new Set(
        scheduleItems
          .filter(
            (item): item is EventCalendarEventItem<CalendarEvent> => item.kind === "event",
          )
          .flatMap((item) =>
            getEventTypes(item).map((type) => getEventTypeDetails(type).className),
          ),
      ),
    ] as string[];
    const hasRejectedItems = scheduleItems.some(
      (item) => "isRejected" in item && Boolean(item.isRejected),
    );
    const hasCoachingItems = scheduleItems.some((item) => item.kind === "coaching");
    const hasBeginnersLessons = scheduleItems.some(
      (item) => item.kind === "beginners",
    );

    return (
      <span className="calendar-day-key-markers" aria-hidden="true">
        {hasRejectedItems ? <span className="calendar-day-rejected-flag" /> : null}
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
  };

  const renderDesktopCalendarItem = (itemLike: { id: string | number }) => {
    const item = itemLike as EventCalendarScheduleItem<CalendarEvent>;

    if (item.kind === "event") {
      return (
        <span
          className={[
            "calendar-entry-label",
            getEventTypeDetails(getEventTypes(item)[0]).className,
            item.isRejected ? "is-rejected" : "",
            item.isCancelled ? "is-cancelled" : "",
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
            item.isCancelled ? "is-cancelled" : "",
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
      <span
        className={[
          "calendar-entry-label",
          "beginners-course-badge",
          item.isCancelled ? "is-cancelled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {getCourseTypeLabel(item)}{" "}
        {getCourseLessonLabel(item).slice(0, 1)}
        {item.lessonNumber}
      </span>
    );
  };

  const monthLabel = formatDate(`${year}-${String(month + 1).padStart(2, "0")}-01`);
  const eventRecurringPreviewDates =
    eventCreationMode === "recurring"
      ? buildRecurringDates(newEventDate, repeatUntilDate, repeatPattern)
      : [];
  const coachingRecurringPreviewDates =
    coachingCreationMode === "recurring"
      ? buildRecurringDates(
          coachingForm.date,
          coachingRepeatUntilDate,
          coachingRepeatPattern,
        )
      : [];
  const mobileAgendaCards = currentMonthAgendaItems.map((item) => ({
    key: `${item.kind}-${item.id}`,
    badge:
      item.kind === "event" ? (
        <div className="event-detail-badge-row">{renderEventTypeBadges(item)}</div>
      ) : item.kind === "coaching" ? (
        <span className="coaching-session-badge">
          <TrainingIcon className="coaching-badge-icon" />
          Coaching session
        </span>
      ) : (
        <span className="event-type-badge beginners-course-badge">
          {item.title}
        </span>
      ),
    title:
      item.kind === "event"
        ? item.title
        : item.kind === "coaching"
          ? item.topic
          : `${getCourseLessonLabel(item)} ${item.lessonNumber}`,
    timeLabel: `${formatDate(item.date)} | ${formatClockTime(item.startTime)} to ${formatClockTime(item.endTime)}`,
    metaLabel:
      item.kind === "event"
        ? getVenueLabel(item.venue)
        : item.kind === "coaching"
          ? `${getVenueLabel(item.venue)} | Coach: ${item.coach.fullName}`
          : `Coordinator: ${item.coordinatorName}`,
    actionLabel: item.kind === "beginners" ? "View selected day" : "Open details",
    actionVariant: (item.kind === "beginners" ? "secondary" : "primary") as
      | "primary"
      | "secondary",
    onOpen: () => handleOpenScheduleItem(item),
  }));
  const eventModalContentClassName = isMobile ? "event-mobile-modal" : "";
  const eventDetailModalClassName = [
    "event-detail-modal",
    isMobile ? "event-detail-modal--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const eventMultiDateModalClassName = [
    "event-multi-date-modal",
    isMobile ? "event-multi-date-modal--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const selectedDaySummaryCardClassName = [
    "event-selected-day-summary",
    isMobile ? "event-selected-day-summary--mobile" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const renderSelectedDateList = (dates: string[]) =>
    dates.length === 0 ? (
      "No dates selected."
    ) : isMobile ? (
      <div className="event-multi-date-chip-list">
        {dates.map((date) => (
          <span key={date} className="event-multi-date-chip">
            {formatDate(date)}
          </span>
        ))}
      </div>
    ) : (
      dates.join(", ")
    );

  const summaryContent = !selectedDate ? (
    <p>Select a date on the calendar to view event details.</p>
  ) : (
    <>
      {isMobile ? (
        <div className={selectedDaySummaryCardClassName}>
          <MobileSectionHeader
            title="Selected Day"
            description={formatDate(selectedDate)}
          />
          <MobileKeyValueList
            items={[
              {
                label: "Items",
                value: String(selectedScheduleItems.length),
              },
              {
                label: "Filters",
                value:
                  activeFilters.length === 0
                    ? "All calendar items"
                    : `${activeFilters.length} active`,
              },
            ]}
          />
        </div>
      ) : (
        <SummaryDate date={selectedDate} />
      )}
      {selectedScheduleItems.length === 0 ? (
        <p>
          {activeFilters.length === 0
            ? "No events, coaching sessions, or beginners lessons are scheduled for this date yet."
            : "No calendar items match the current filters for this date."}
        </p>
      ) : (
        <>
          {activeSelectedEvents.length > 0 ? (
            <>
              {isMobile ? (
                <MobileSectionHeader
                  title="Events"
                  description="Tap a card for booking options and more detail."
                />
              ) : (
                <p className="event-summary-hint">
                  Click on an event for more information and booking options.
                </p>
              )}
              <div className="event-summary-card-list">
                {activeSelectedEvents.map((evt) => (
                  <Button
                    key={evt.id}
                    type="button"
                    className={[
                      "event-summary-card",
                      evt.isRejected ? "is-rejected" : "",
                      evt.isCancelled ? "is-cancelled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedEventId(evt.id)}
                    variant="unstyled"
                  >
                    <div className="event-detail-badge-row">
                      {renderEventTypeBadges(evt)}
                    </div>
                    {evt.isCancelled ? (
                      <span className="event-summary-status-badge is-cancelled">
                        Cancelled
                      </span>
                    ) : null}
                    <strong className="event-summary-card-title">{evt.title}</strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(evt.startTime)} to {formatClockTime(evt.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      {getVenueLabel(evt.venue)}
                      {evt.isBookedOn ? " | Booked on" : ""}
                      {evt.isPendingApproval ? " | Pending approval" : ""}
                      {evt.isRejected ? " | Request rejected" : ""}
                      {evt.isCancelled
                        ? getCancelledSummary(evt.cancellationReason)
                        : ""}
                      {!evt.isCancelled && !evt.isBookedOn && hasEventEnded(evt)
                        ? " | Event finished"
                        : ""}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          {activeSelectedCoachingSessions.length > 0 ? (
            <>
              {isMobile ? (
                <MobileSectionHeader title="Coaching Sessions" />
              ) : (
                <h4>Coaching sessions</h4>
              )}
              <div className="event-summary-card-list">
                {activeSelectedCoachingSessions.map((session) => (
                  <Button
                    key={session.id}
                    type="button"
                    className={[
                      "event-summary-card",
                      session.isRejected ? "is-rejected" : "",
                      session.isCancelled ? "is-cancelled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setSelectedCoachingSessionId(session.id)}
                    variant="unstyled"
                  >
                    <span className="coaching-session-badge">Coaching session</span>
                    {session.isCancelled ? (
                      <span className="event-summary-status-badge is-cancelled">
                        Cancelled
                      </span>
                    ) : null}
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
                      {session.isCancelled
                        ? getCancelledSummary(session.cancellationReason)
                        : ""}
                      {!session.isCancelled &&
                      !session.isBookedOn &&
                      hasSessionEnded(session)
                        ? " | Session finished"
                        : ""}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          {activeSelectedBeginnersLessons.length > 0 ? (
            <>
              {isMobile ? (
                <MobileSectionHeader title="Courses And Sessions" />
              ) : (
                <h4>Beginners, Have a Go, and Taster Sessions</h4>
              )}
              <div className="event-summary-card-list">
                {activeSelectedBeginnersLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className={[
                      "event-summary-card",
                      lesson.isCancelled ? "is-cancelled" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="event-type-badge beginners-course-badge">
                      {lesson.title}
                    </span>
                    {lesson.isCancelled ? (
                      <span className="event-summary-status-badge is-cancelled">
                        Cancelled
                      </span>
                    ) : null}
                    <strong className="event-summary-card-title">
                      {getCourseLessonLabel(lesson)} {lesson.lessonNumber}
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
                      | {getCourseParticipantLabel(lesson)}:{" "}
                      {lesson.participantCount ?? lesson.beginnerCount}/
                      {lesson.participantCapacity ?? lesson.beginnerCapacity}
                      {lesson.isCancelled
                        ? getCancelledSummary(lesson.cancellationReason)
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {hasRejectedSummaryItems ? (
            <>
              {isMobile ? (
                <MobileSectionHeader title="Rejected" />
              ) : (
                <h4 className="event-summary-status-heading">Rejected</h4>
              )}
              <div className="event-summary-card-list">
                {rejectedSelectedEvents.map((evt) => (
                  <Button
                    key={evt.id}
                    type="button"
                    className="event-summary-card is-rejected"
                    onClick={() => setSelectedEventId(evt.id)}
                    variant="unstyled"
                  >
                    <div className="event-detail-badge-row">
                      {renderEventTypeBadges(evt)}
                    </div>
                    <span className="event-summary-status-badge is-rejected">
                      Rejected
                    </span>
                    <strong className="event-summary-card-title">{evt.title}</strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(evt.startTime)} to {formatClockTime(evt.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      {getVenueLabel(evt.venue)} | Request rejected
                      {evt.rejectionReason ? `: ${evt.rejectionReason}` : ""}
                    </span>
                  </Button>
                ))}
                {rejectedSelectedCoachingSessions.map((session) => (
                  <Button
                    key={session.id}
                    type="button"
                    className="event-summary-card is-rejected"
                    onClick={() => setSelectedCoachingSessionId(session.id)}
                    variant="unstyled"
                  >
                    <span className="coaching-session-badge">Coaching session</span>
                    <span className="event-summary-status-badge is-rejected">
                      Rejected
                    </span>
                    <strong className="event-summary-card-title">{session.topic}</strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(session.startTime)} to{" "}
                      {formatClockTime(session.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      {getVenueLabel(session.venue)} | Coach: {session.coach.fullName} |
                      Request rejected
                      {session.rejectionReason
                        ? `: ${session.rejectionReason}`
                        : ""}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          {hasCancelledSummaryItems ? (
            <>
              {isMobile ? (
                <MobileSectionHeader title="Cancelled" />
              ) : (
                <h4 className="event-summary-status-heading">Cancelled</h4>
              )}
              <div className="event-summary-card-list">
                {cancelledSelectedEvents.map((evt) => (
                  <Button
                    key={evt.id}
                    type="button"
                    className="event-summary-card is-cancelled"
                    onClick={() => setSelectedEventId(evt.id)}
                    variant="unstyled"
                  >
                    <div className="event-detail-badge-row">
                      {renderEventTypeBadges(evt)}
                    </div>
                    <span className="event-summary-status-badge is-cancelled">
                      Cancelled
                    </span>
                    <strong className="event-summary-card-title">{evt.title}</strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(evt.startTime)} to {formatClockTime(evt.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      {getVenueLabel(evt.venue)}
                      {getCancelledSummary(evt.cancellationReason)}
                    </span>
                  </Button>
                ))}
                {cancelledSelectedCoachingSessions.map((session) => (
                  <Button
                    key={session.id}
                    type="button"
                    className="event-summary-card is-cancelled"
                    onClick={() => setSelectedCoachingSessionId(session.id)}
                    variant="unstyled"
                  >
                    <span className="coaching-session-badge">Coaching session</span>
                    <span className="event-summary-status-badge is-cancelled">
                      Cancelled
                    </span>
                    <strong className="event-summary-card-title">{session.topic}</strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(session.startTime)} to{" "}
                      {formatClockTime(session.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      {getVenueLabel(session.venue)} | Coach: {session.coach.fullName}
                      {getCancelledSummary(session.cancellationReason)}
                    </span>
                  </Button>
                ))}
                {cancelledSelectedBeginnersLessons.map((lesson) => (
                  <div key={lesson.id} className="event-summary-card is-cancelled">
                    <span className="event-type-badge beginners-course-badge">
                      {lesson.title}
                    </span>
                    <span className="event-summary-status-badge is-cancelled">
                      Cancelled
                    </span>
                    <strong className="event-summary-card-title">
                      {getCourseLessonLabel(lesson)} {lesson.lessonNumber}
                    </strong>
                    <span className="event-summary-card-time">
                      {formatClockTime(lesson.startTime)} to{" "}
                      {formatClockTime(lesson.endTime)}
                    </span>
                    <span className="event-summary-card-meta">
                      Coordinator: {lesson.coordinatorName} | Coaches:{" "}
                      {lesson.coachNames.length > 0
                        ? lesson.coachNames.join(", ")
                        : "To be assigned"}
                      {getCancelledSummary(lesson.cancellationReason)}
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
      {bookingMessage ? <p className="event-booking-message">{bookingMessage}</p> : null}
    </>
  );

  return (
    <div className="event-calendar-page">
      <p>
        This calendar is the central place for club scheduling, bringing
        events, coaching sessions, and approved beginners course lessons
        together in one view.
      </p>
      <StatusMessagePanel
        error={calendarLoadError}
        loading={isCalendarLoading}
        loadingLabel="Loading calendar items..."
      />
      {isMobile ? (
        <EventCalendarMobileView
          filterBar={filterBar}
          summaryContent={summaryContent}
          monthLabel={monthLabel}
          agendaCards={mobileAgendaCards}
          onToday={handleCalendarToday}
          onPrevMonth={handleCalendarPrevMonth}
          onNextMonth={handleCalendarNextMonth}
        />
      ) : (
        <EventCalendarDesktopView
          filterBar={filterBar}
          summaryContent={summaryContent}
          year={year}
          month={month}
          selectedDate={selectedDate}
          scheduleItemsByDate={scheduleItemsByDate}
          onDayClick={handleDateSelect}
          onToday={handleCalendarToday}
          onPrevMonth={handleCalendarPrevMonth}
          onNextMonth={handleCalendarNextMonth}
          renderDayMeta={renderDesktopDayMeta}
          renderItem={renderDesktopCalendarItem}
        />
      )}

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
        contentClassName={eventModalContentClassName}
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
            <DatePicker
              value={newEventDate}
              onChange={(value) => {
                setNewEventDate(value);
                if (repeatUntilDate < value) {
                  setRepeatUntilDate(value);
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
                <DatePicker
                  value={repeatUntilDate}
                  min={newEventDate}
                  onChange={setRepeatUntilDate}
                  required
                />
              </label>
              <div className="event-multi-date-summary">
                {eventRecurringPreviewDates.length > 0 ? (
                  <>
                    <strong>
                      {eventRecurringPreviewDates.length} event date
                      {eventRecurringPreviewDates.length === 1 ? "" : "s"} will be
                      created.
                    </strong>
                    {renderSelectedDateList(eventRecurringPreviewDates.slice(0, 8))}
                  </>
                ) : (
                  "Choose a repeat-until date to preview the schedule."
                )}
              </div>
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
                    newEventTypes.includes(option.value) ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggleNewEventType(option.value)}
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
        contentClassName={eventModalContentClassName}
      >
        <div className={eventMultiDateModalClassName}>
          <p>
            Select every date this event should be created on. Each chosen day will be submitted as its own event.
          </p>
          <div className="event-multi-date-summary">
            <strong>
              Tap days to add or remove them from this event schedule.
            </strong>
          </div>
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
            {renderSelectedDateList(selectedMultiDates)}
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
        contentClassName={eventModalContentClassName}
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
            <DatePicker
              value={coachingForm.date}
              onChange={(value) =>
                setCoachingForm((current) => ({
                  ...current,
                  date: value,
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
                <DatePicker
                  value={coachingRepeatUntilDate}
                  min={coachingForm.date}
                  onChange={setCoachingRepeatUntilDate}
                  required
                />
              </label>
              <div className="event-multi-date-summary">
                {coachingRecurringPreviewDates.length > 0 ? (
                  <>
                    <strong>
                      {coachingRecurringPreviewDates.length} coaching date
                      {coachingRecurringPreviewDates.length === 1 ? "" : "s"} will be
                      created.
                    </strong>
                    {renderSelectedDateList(
                      coachingRecurringPreviewDates.slice(0, 8),
                    )}
                  </>
                ) : (
                  "Choose a repeat-until date to preview the schedule."
                )}
              </div>
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
              inputMode="numeric"
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
        contentClassName={eventModalContentClassName}
      >
        <div className={eventMultiDateModalClassName}>
          <p>
            Select every date this coaching session should be created on. Each
            chosen day will be submitted as its own session.
          </p>
          <div className="event-multi-date-summary">
            <strong>
              Tap days to add or remove them from this coaching schedule.
            </strong>
          </div>
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
            {renderSelectedDateList(selectedCoachingMultiDates)}
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
        contentClassName={eventModalContentClassName}
      >
        {selectedEventDetail ? (
          <div className={eventDetailModalClassName}>
            <div className="event-detail-badge-row">
              {renderEventTypeBadges(selectedEventDetail)}
            </div>
            {isMobile ? (
              <MobileKeyValueList
                items={[
                  {
                    label: "Date",
                    value: formatDate(selectedEventDetail.date),
                  },
                  {
                    label: "Time",
                    value: `${formatClockTime(selectedEventDetail.startTime)} to ${formatClockTime(selectedEventDetail.endTime)}`,
                  },
                  {
                    label: "Venue",
                    value: getVenueLabel(selectedEventDetail.venue),
                  },
                  {
                    label: "Status",
                    value: selectedEventDetail.isBookedOn
                      ? "Booked on"
                      : selectedEventDetail.isPendingApproval
                        ? "Pending approval"
                        : selectedEventDetail.isRejected
                          ? "Request rejected"
                          : hasEventEnded(selectedEventDetail)
                            ? "Event finished"
                            : hasRangeClosedType(selectedEventDetail)
                              ? "Not bookable"
                              : "Open for booking",
                  },
                ]}
              />
            ) : (
              <>
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
                            : hasRangeClosedType(selectedEventDetail)
                              ? "Not bookable"
                              : "Open for booking"}
                  </span>
                </p>
              </>
            )}
            {selectedEventDetail.details ? (
              <div className="event-detail-copy-block">
                <strong>Details</strong>
                <p>{selectedEventDetail.details}</p>
              </div>
            ) : null}
            {hasRangeClosedType(selectedEventDetail) ? (
              <p className="event-detail-note event-detail-note-range-closed">
                Range closed event: this entry closes the range and cannot be booked onto.
              </p>
            ) : null}
            {selectedEventDetail.rejectionReason ? (
              <p className="event-form-error">
                Rejection reason: {selectedEventDetail.rejectionReason}
              </p>
            ) : null}
            {selectedEventDetail.canViewBookings ? (
              <>
                <h4>Booked Members</h4>
                {selectedEventDetail.bookings && selectedEventDetail.bookings.length > 0 ? (
                  <SummaryList
                    items={selectedEventDetail.bookings}
                    renderItem={(booking) => booking.fullName}
                  />
                ) : (
                  <p>No members have booked onto this event yet.</p>
                )}
              </>
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
              !hasRangeClosedType(selectedEventDetail) &&
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
        contentClassName={eventModalContentClassName}
      >
        {selectedCoachingSessionDetail ? (
          <div className={eventDetailModalClassName}>
            <p className="coaching-summary-heading event-detail-badge-row">
              <span className="coaching-session-badge">
                <TrainingIcon className="coaching-badge-icon" />
                Archery training
              </span>
            </p>
            {isMobile ? (
              <MobileKeyValueList
                items={[
                  {
                    label: "Date",
                    value: formatDate(selectedCoachingSessionDetail.date),
                  },
                  {
                    label: "Time",
                    value: `${formatClockTime(selectedCoachingSessionDetail.startTime)} to ${formatClockTime(selectedCoachingSessionDetail.endTime)}`,
                  },
                  {
                    label: "Venue",
                    value: getVenueLabel(selectedCoachingSessionDetail.venue),
                  },
                  {
                    label: "Coach",
                    value: selectedCoachingSessionDetail.coach.fullName,
                  },
                  {
                    label: "Status",
                    value: selectedCoachingSessionDetail.isBookedOn
                      ? "Booked on"
                      : selectedCoachingSessionDetail.isPendingApproval
                        ? "Pending approval"
                        : selectedCoachingSessionDetail.isRejected
                          ? "Request rejected"
                          : hasSessionEnded(selectedCoachingSessionDetail)
                            ? "Session finished"
                            : selectedCoachingSessionDetail.remainingSlots <= 0
                              ? "Session full"
                              : "Open for booking",
                  },
                  {
                    label: "Capacity",
                    value: `${selectedCoachingSessionDetail.bookingCount} of ${selectedCoachingSessionDetail.availableSlots} slot${selectedCoachingSessionDetail.availableSlots === 1 ? "" : "s"} booked`,
                  },
                ]}
              />
            ) : (
              <>
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
              </>
            )}
            <div className="event-detail-copy-block">
              <strong>Details</strong>
              <p>{selectedCoachingSessionDetail.summary}</p>
            </div>
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
                      action: "approve",
                      sessionId: selectedCoachingSessionDetail.id,
                      successMessage: (session, message) =>
                        message ??
                        `${session?.topic ?? selectedCoachingSessionDetail.topic} approved successfully.`,
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
                      action: "cancel",
                      sessionId: selectedCoachingSessionDetail.id,
                      successMessage: () =>
                        "Coaching session cancelled successfully.",
                      afterSuccess: () => {
                        setSelectedCoachingSessionId(null);
                        onBookingsChanged?.();
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
                      action: "leave",
                      sessionId: selectedCoachingSessionDetail.id,
                      successMessage: (session) =>
                        `Withdrawn from ${session?.topic ?? selectedCoachingSessionDetail.topic} on ${formatDate(session?.date ?? selectedCoachingSessionDetail.date)}.`,
                      afterSuccess: () => {
                        onBookingsChanged?.();
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
                      action: "book",
                      sessionId: selectedCoachingSessionDetail.id,
                      successMessage: (session) =>
                        `Booked onto ${session?.topic ?? selectedCoachingSessionDetail.topic} on ${formatDate(session?.date ?? selectedCoachingSessionDetail.date)}.`,
                      afterSuccess: () => {
                        onBookingsChanged?.();
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
        contentClassName={eventModalContentClassName}
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
                <div className="event-detail-badge-row">
                  {renderEventTypeBadges(event)}
                </div>
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
