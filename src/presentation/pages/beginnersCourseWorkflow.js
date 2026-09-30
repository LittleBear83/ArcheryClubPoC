export function hasCourseFinished(course, now = Date.now()) {
  const allLessons = course.lessons ?? [];
  const activeLessons = allLessons.filter((lesson) => !lesson.isCancelled);
  const lessons = activeLessons.length ? activeLessons : allLessons;
  if (!lessons.length) return false;
  const ends = lessons.map((lesson) => new Date(`${lesson.date}T${lesson.endTime}`).getTime());
  return ends.every((end) => Number.isFinite(end)) && Math.max(...ends) < now;
}

export function validateBeginnerConversionReturnDate(assignedCaseId, expectedReturnDate, todayUtc = new Date().toISOString().slice(0, 10)) {
  if (!assignedCaseId) return null;
  if (!expectedReturnDate) return "Expected return date is required for the assigned case loan.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedReturnDate)) {
    return "Expected return date must be a valid YYYY-MM-DD date.";
  }
  const parsed = new Date(`${expectedReturnDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expectedReturnDate) {
    return "Expected return date must be a valid YYYY-MM-DD date.";
  }
  if (expectedReturnDate < todayUtc) return "Expected return date must be today or later (UTC).";
  return null;
}

export function selectCourseDetails(activeCourses, courses, closedDetailId) {
  return [...activeCourses, ...courses.filter((course) => course.id === closedDetailId && !activeCourses.some((active) => active.id === course.id))];
}

export function isCourseClosed(course) {
  return course.isCancelled || course.approvalStatus === "rejected" || hasCourseFinished(course) || (course.lessons?.length > 0 && course.lessons.every((lesson) => lesson.isCancelled));
}
