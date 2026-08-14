import {
  listBeginnersCourseCalendarLessons,
  listCoachingSessions,
  listEvents,
} from "../../../api/scheduleApi";
import type {
  BeginnersCourseCalendarLesson,
  CoachingSession,
} from "../../../types/app";

export async function fetchCalendarEvents<TEvent>(actorUsername: string): Promise<TEvent[]> {
  const result = await listEvents<TEvent>(actorUsername);
  return result.events ?? [];
}

export async function fetchCalendarCoachingSessions(
  actorUsername: string,
): Promise<CoachingSession[]> {
  const result = await listCoachingSessions(actorUsername);
  return result.sessions ?? [];
}

export async function fetchCalendarBeginnersCourseLessons(): Promise<
  BeginnersCourseCalendarLesson[]
> {
  const result = await listBeginnersCourseCalendarLessons();
  return result.lessons ?? [];
}
