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
  participantCapacity?: number;
  coachCount?: number;
  requiredCoachCount?: number;
  coachShortfall?: number;
  isFullyCovered?: boolean;
  sessionStatus?: "upcoming" | "in-progress" | "completed";
};

export type CoachingOpportunity = {
  lessonId: string | number;
  courseId: string | number;
  courseType: string;
  lessonNumber: number;
  date: string;
  startTime: string;
  endTime: string;
  coordinatorName: string;
  participantCount: number;
  participantCapacity?: number;
  coachNames: string[];
  requiredCoachCount: number;
  assignedCoachCount?: number;
  coachShortfall?: number;
  isFullyCovered?: boolean;
};

export type CoachingParticipant = {
  id?: number;
  noteCount?: number;
  firstName: string;
  surname: string;
  sizeCategory?: string;
  handedness?: string | null;
  eyeDominance?: string | null;
  drawLength?: string | null;
  noShowRecorded?: boolean;
  attendanceRecorded?: boolean;
  manualAttendanceRecorded?: boolean;
};

export function canAccessCoachingHub(profile: UserProfile | null) {
  return profile?.meta?.coachingVolunteer === true;
}

export function courseLabel(type?: string) {
  return type === "have-a-go" ? "Have a Go" : type === "taster-session" ? "Taster session" : "Beginners course";
}

export function courseItemLabel(type?: string) {
  return type === "beginners" ? "Lesson" : "Session";
}

export function sessionEnd(session: CoachAssignment) {
  return new Date(`${session.date}T${session.endTime}`).getTime();
}

export function sessionStart(session: Pick<CoachAssignment, "date" | "startTime">) {
  return new Date(`${session.date}T${session.startTime}`).getTime();
}

export function sortAssignments(sessions: CoachAssignment[]) {
  return [...sessions].sort((left, right) =>
    `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`),
  );
}

export function splitAssignments(sessions: CoachAssignment[], now: number) {
  const ordered = sortAssignments(sessions);
  const upcoming = ordered.filter((session) => sessionEnd(session) > now);
  const next = upcoming[0] ?? null;
  return {
    next,
    upcoming: next ? upcoming.slice(1) : [],
    past: ordered.filter((session) => sessionEnd(session) <= now),
  };
}

export function isCoachingOpportunityEligible(
  lesson: CoachingOpportunity,
  now: number,
  assignedLessonIds: ReadonlySet<string>,
) {
  return sessionStart(lesson) > now &&
    (lesson.coachNames?.length ?? 0) < (lesson.requiredCoachCount || 1) &&
    !assignedLessonIds.has(String(lesson.lessonId));
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
