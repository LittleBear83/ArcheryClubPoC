import { buildActorHeaders, fetchApi } from "./client";

export async function listMyCoachingBookings<TBooking>(username: string) {
  return fetchApi<{ success: true; bookings?: TBooking[] }>("/api/my-coaching-bookings", {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export async function listMyEventBookings<TBooking>(username: string) {
  return fetchApi<{ success: true; bookings?: TBooking[] }>("/api/my-event-bookings", {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export async function listMyTournamentReminders<TReminder>(username: string) {
  return fetchApi<{ success: true; reminders?: TReminder[] }>("/api/my-tournament-reminders", {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export async function getMyBeginnerDashboard<TDashboard>(username: string) {
  return fetchApi<{ success: true; dashboard?: TDashboard }>("/api/my-beginner-dashboard", {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export async function listMyBeginnerCoachingAssignments<TLesson>(username: string) {
  return fetchApi<{ success: true; lessons?: TLesson[] }>(
    "/api/my-beginner-coaching-assignments",
    {
      headers: buildActorHeaders(username),
      cache: "no-store",
    },
  );
}

export async function listMyCoachingOpportunities<TOpportunity>(username: string) {
  return fetchApi<{ success: true; lessons?: TOpportunity[] }>("/api/my-coaching-opportunities", {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export type CoachingAssignmentNotification = {
  eventId: string;
  action: "volunteered" | "withdrew" | "cannot_attend";
  courseType?: string;
  lessonId: string | number;
  lessonNumber: number;
  lessonDate: string;
  actorName: string;
  reason?: string;
};

export async function listMyCoachingAssignmentNotifications(username: string) {
  return fetchApi<{ success: true; notifications: CoachingAssignmentNotification[] }>(
    "/api/my-coaching-assignment-notifications",
    { headers: buildActorHeaders(username), cache: "no-store" },
  );
}

export async function dismissCoachingAssignmentNotification(username: string, eventId: string) {
  return fetchApi<{ success: true }>(
    `/api/my-coaching-assignment-notifications/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: buildActorHeaders(username), cache: "no-store" },
  );
}

export async function getMyCoachingLessonDetails<TLesson>(username: string, lessonId: string | number) {
  return fetchApi<{ success: true; lesson: TLesson }>(`/api/my-coaching-lessons/${lessonId}/details`, {
    headers: buildActorHeaders(username),
    cache: "no-store",
  });
}

export type CoachingParticipantNote = {
  id: number;
  courseId: number;
  participantId: number;
  authorUsername: string;
  authorInitials: string;
  attendeeInitials: string;
  text: string;
  createdAt: string;
  expiresAt: string;
  dueForDeletion: boolean;
};

export async function listCoachingParticipantNotes(username: string, lessonId: string | number, participantId: number) {
  return fetchApi<{ success: true; notes: CoachingParticipantNote[] }>(`/api/my-coaching-lessons/${lessonId}/participants/${participantId}/notes`, {
    headers: buildActorHeaders(username), cache: "no-store",
  });
}

export async function addCoachingParticipantNote(username: string, lessonId: string | number, participantId: number, text: string) {
  return fetchApi<{ success: true; note: CoachingParticipantNote }>(`/api/my-coaching-lessons/${lessonId}/participants/${participantId}/notes`, {
    method: "POST", headers: buildActorHeaders(username, true), cache: "no-store", body: JSON.stringify({ text }),
  });
}

export async function listMyCoachingNotes(username: string) {
  return fetchApi<{ success: true; notes: CoachingParticipantNote[] }>("/api/my-coaching-notes", {
    headers: buildActorHeaders(username), cache: "no-store",
  });
}

export async function volunteerForCoachingLesson(username: string, lessonId: string | number) {
  return fetchApi<{ success: true; message?: string }>(`/api/beginners-course-lessons/${lessonId}/volunteer`, {
    method: "POST",
    headers: buildActorHeaders(username, true),
    cache: "no-store",
    body: JSON.stringify({}),
  });
}

export async function reportCoachingLessonUnavailability(username: string, lessonId: string | number, reason = "") {
  return fetchApi<{ success: true; message?: string }>(`/api/beginners-course-lessons/${lessonId}/unavailability`, {
    method: "POST",
    headers: buildActorHeaders(username, true),
    cache: "no-store",
    body: JSON.stringify({ reason }),
  });
}
