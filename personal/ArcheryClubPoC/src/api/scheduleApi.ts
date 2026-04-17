import { buildActorHeaders, fetchApi, type ActorIdentity } from "./client";
import type {
  ApprovalEvent,
  BeginnersCourseCalendarLesson,
  CoachingSession,
} from "../types/app";

type CalendarEventBase = {
  id: string | number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
};

export async function listEvents<TEvent = ApprovalEvent>(actor: ActorIdentity | string) {
  return fetchApi<{ success: true; events?: TEvent[] }>("/api/events", {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export async function listCoachingSessions(actor: ActorIdentity | string) {
  return fetchApi<{ success: true; sessions?: CoachingSession[] }>("/api/coaching-sessions", {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export async function listBeginnersCourseCalendarLessons() {
  return fetchApi<{ success: true; lessons?: BeginnersCourseCalendarLesson[] }>(
    "/api/beginners-courses/calendar",
    {
      cache: "no-store",
    },
  );
}

export async function createEvent<TEvent = CalendarEventBase>(
  actor: ActorIdentity | string,
  eventDetails: Record<string, unknown>,
) {
  return fetchApi<{ success: true; event: TEvent; message?: string }>("/api/events", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify(eventDetails),
  });
}

export async function approveEvent<TEvent = CalendarEventBase>(
  actor: ActorIdentity | string,
  eventId: string | number,
) {
  return fetchApi<{ success: true; event: TEvent; message?: string }>(
    `/api/events/${eventId}/approve`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function bookEvent<TEvent = CalendarEventBase>(
  actor: ActorIdentity | string,
  eventId: string | number,
) {
  return fetchApi<{ success: true; event: TEvent; message?: string }>(
    `/api/events/${eventId}/book`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function leaveEvent<TEvent = CalendarEventBase>(
  actor: ActorIdentity | string,
  eventId: string | number,
) {
  return fetchApi<{ success: true; event: TEvent; message?: string }>(
    `/api/events/${eventId}/booking`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function cancelEvent(
  actor: ActorIdentity | string,
  eventId: string | number,
) {
  return fetchApi<{ success: true; message?: string }>(`/api/events/${eventId}`, {
    method: "DELETE",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
  });
}

export async function createCoachingSession(
  actor: ActorIdentity | string,
  sessionDetails: Record<string, unknown>,
) {
  return fetchApi<{ success: true; session?: CoachingSession }>("/api/coaching-sessions", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify(sessionDetails),
  });
}

export async function approveCoachingSession(
  actor: ActorIdentity | string,
  sessionId: string | number,
) {
  return fetchApi<{ success: true; session?: CoachingSession; message?: string }>(
    `/api/coaching-sessions/${sessionId}/approve`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function cancelCoachingSession(
  actor: ActorIdentity | string,
  sessionId: string | number,
) {
  return fetchApi<{ success: true; session?: CoachingSession; message?: string }>(
    `/api/coaching-sessions/${sessionId}`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function bookCoachingSession(
  actor: ActorIdentity | string,
  sessionId: string | number,
) {
  return fetchApi<{ success: true; session?: CoachingSession; message?: string }>(
    `/api/coaching-sessions/${sessionId}/book`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function leaveCoachingSession(
  actor: ActorIdentity | string,
  sessionId: string | number,
) {
  return fetchApi<{ success: true; session?: CoachingSession; message?: string }>(
    `/api/coaching-sessions/${sessionId}/booking`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function rejectEvent(
  actor: ActorIdentity | string,
  eventId: string | number,
  rejectionReason: string,
) {
  return fetchApi<{ success: true; message?: string }>(`/api/events/${eventId}/reject`, {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify({ rejectionReason }),
  });
}

export async function rejectCoachingSession(
  actor: ActorIdentity | string,
  sessionId: string | number,
  rejectionReason: string,
) {
  return fetchApi<{ success: true; message?: string }>(
    `/api/coaching-sessions/${sessionId}/reject`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
      body: JSON.stringify({ rejectionReason }),
    },
  );
}
