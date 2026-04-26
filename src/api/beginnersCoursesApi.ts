import { buildActorHeaders, fetchApi, type ActorIdentity } from "./client";

export async function getBeginnersCoursesDashboard(actor: ActorIdentity | string) {
  return fetchApi<{ success: true } & Record<string, unknown>>(
    "/api/beginners-courses/dashboard",
    {
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function getHaveAGoSessionsDashboard(actor: ActorIdentity | string) {
  return fetchApi<{ success: true } & Record<string, unknown>>(
    "/api/beginners-courses/dashboard?courseType=have-a-go",
    {
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function createBeginnersCourse(
  actor: ActorIdentity | string,
  course: Record<string, unknown>,
) {
  return fetchApi<{ success: true }>("/api/beginners-courses", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify(course),
    cache: "no-store",
  });
}

export async function createHaveAGoSession(
  actor: ActorIdentity | string,
  session: Record<string, unknown>,
) {
  return createBeginnersCourse(actor, {
    ...session,
    courseType: "have-a-go",
  });
}

export async function addBeginnerToCourse(
  actor: ActorIdentity | string,
  courseId: string | number,
  beginner: Record<string, unknown>,
) {
  return fetchApi<{
    success: true;
    username: string;
    temporaryPassword: string;
  }>(`/api/beginners-courses/${courseId}/beginners`, {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify(beginner),
    cache: "no-store",
  });
}

export async function resetBeginnerPassword(
  actor: ActorIdentity | string,
  beginnerId: string | number,
) {
  return fetchApi<{
    success: true;
    username: string;
    temporaryPassword: string;
  }>(`/api/beginners-course-participants/${beginnerId}/reset-password`, {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
  });
}

export async function assignBeginnerCase(
  actor: ActorIdentity | string,
  beginnerId: string | number,
  caseId: string | null,
) {
  return fetchApi<{ success: true }>(
    `/api/beginners-course-participants/${beginnerId}/assign-case`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify({ caseId }),
      cache: "no-store",
    },
  );
}

export async function convertBeginnerToMember(
  actor: ActorIdentity | string,
  beginnerId: string | number,
) {
  return fetchApi<{ success: true }>(
    `/api/beginners-course-participants/${beginnerId}/convert`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function approveBeginnersCourse(
  actor: ActorIdentity | string,
  courseId: string | number,
  courseType = "beginners",
) {
  return fetchApi<{ success: true }>(
    `/api/beginners-courses/${courseId}/approve?courseType=${encodeURIComponent(courseType)}`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      cache: "no-store",
    },
  );
}

export async function rejectBeginnersCourse(
  actor: ActorIdentity | string,
  courseId: string | number,
  reason: string,
  courseType = "beginners",
) {
  return fetchApi<{ success: true }>(
    `/api/beginners-courses/${courseId}/reject?courseType=${encodeURIComponent(courseType)}`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify({ reason }),
      cache: "no-store",
    },
  );
}

export async function cancelBeginnersCourse(
  actor: ActorIdentity | string,
  courseId: string | number,
  reason: string,
  courseType = "beginners",
) {
  return fetchApi<{ success: true }>(
    `/api/beginners-courses/${courseId}?courseType=${encodeURIComponent(courseType)}`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify({ reason }),
      cache: "no-store",
    },
  );
}

export async function assignLessonCoaches(
  actor: ActorIdentity | string,
  lessonId: string | number,
  coachUsernames: string[],
) {
  return fetchApi<{ success: true }>(`/api/beginners-course-lessons/${lessonId}/coaches`, {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify({ coachUsernames }),
    cache: "no-store",
  });
}

export async function updateBeginnerParticipant(
  actor: ActorIdentity | string,
  beginnerId: string | number,
  beginner: Record<string, unknown>,
) {
  return fetchApi<{ success: true }>(`/api/beginners-course-participants/${beginnerId}`, {
    method: "PUT",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify(beginner),
    cache: "no-store",
  });
}
