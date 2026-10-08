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

export async function getMyCoachingLessonDetails<TLesson>(username: string, lessonId: string | number) {
  return fetchApi<{ success: true; lesson: TLesson }>(`/api/my-coaching-lessons/${lessonId}/details`, {
    headers: buildActorHeaders(username),
    cache: "no-store",
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

export async function withdrawFromCoachingLesson(username: string, lessonId: string | number, reason = "") {
  return fetchApi<{ success: true; message?: string }>(`/api/beginners-course-lessons/${lessonId}/my-assignment`, {
    method: "DELETE",
    headers: buildActorHeaders(username, true),
    cache: "no-store",
    body: JSON.stringify({ reason }),
  });
}
