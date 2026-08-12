import { countActiveApprovedCourses } from "./committeeApprovedCoursesUtils.ts";

type PendingCourseApproval = {
  approvalStatus?: string;
  isCancelled?: boolean;
  lessons?: Array<{
    date?: string;
    endTime?: string;
  }>;
};

type CommitteeApprovalSummaryInput = {
  events?: Array<{ isPendingApproval?: boolean }>;
  sessions?: Array<{ isPendingApproval?: boolean }>;
  beginnersCourses?: PendingCourseApproval[];
  haveAGoSessions?: PendingCourseApproval[];
  tasterSessions?: PendingCourseApproval[];
  now?: Date;
};

function countPendingCourses(courses: PendingCourseApproval[] = []) {
  return courses.filter(
    (course) => course.approvalStatus === "pending" && !course.isCancelled,
  ).length;
}

export function buildCommitteeApprovalSummary({
  events = [],
  sessions = [],
  beginnersCourses = [],
  haveAGoSessions = [],
  tasterSessions = [],
  now = new Date(),
}: CommitteeApprovalSummaryInput) {
  const pendingEvents = events.filter((event) => event.isPendingApproval).length;
  const pendingSessions = sessions.filter((session) => session.isPendingApproval)
    .length;
  const pendingBeginnersCourses = countPendingCourses(beginnersCourses);
  const pendingHaveAGoSessions = countPendingCourses(haveAGoSessions);
  const pendingTasterSessions = countPendingCourses(tasterSessions);
  const approvedBeginnersCourses = countActiveApprovedCourses(
    beginnersCourses,
    now,
  );
  const approvedHaveAGoSessions = countActiveApprovedCourses(
    haveAGoSessions,
    now,
  );
  const approvedTasterSessions = countActiveApprovedCourses(
    tasterSessions,
    now,
  );
  const calendarItemsCount = pendingEvents + pendingSessions;

  return {
    totalPendingCount:
      calendarItemsCount +
      pendingBeginnersCourses +
      pendingHaveAGoSessions +
      pendingTasterSessions,
    calendarItemsCount,
    beginnersCoursesCount: pendingBeginnersCourses,
    haveAGoSessionsCount: pendingHaveAGoSessions,
    tasterSessionsCount: pendingTasterSessions,
    approvedBeginnersCoursesCount: approvedBeginnersCourses,
    approvedHaveAGoSessionsCount: approvedHaveAGoSessions,
    approvedTasterSessionsCount: approvedTasterSessions,
  };
}
