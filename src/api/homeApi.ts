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
