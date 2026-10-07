import type { UserProfile } from "../../types/app";

export type CoachAssignment = {
  id: string | number;
  courseId: string | number;
  courseType?: string;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coordinatorName: string;
  beginnerCount: number;
};

export function canAccessCoachingHub(profile: UserProfile | null) {
  return profile?.meta?.coachingVolunteer === true;
}

export function courseLabel(type?: string) {
  return type === "have-a-go" ? "Have a Go" : type === "taster-session" ? "Taster session" : "Beginners course";
}

export function sessionEnd(session: CoachAssignment) {
  return new Date(`${session.date}T${session.endTime}`).getTime();
}

export function scheduledHours(session: CoachAssignment) {
  const start = new Date(`${session.date}T${session.startTime}`).getTime();
  const duration = (sessionEnd(session) - start) / 3600000;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
