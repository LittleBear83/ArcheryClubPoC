export function hasCourseFinished(course, now = Date.now()) {
  const allLessons = course.lessons ?? [];
  const activeLessons = allLessons.filter((lesson) => !lesson.isCancelled);
  const lessons = activeLessons.length ? activeLessons : allLessons;
  if (!lessons.length) return false;
  const ends = lessons.map((lesson) => new Date(`${lesson.date}T${lesson.endTime}`).getTime());
  return ends.every((end) => Number.isFinite(end)) && Math.max(...ends) < now;
}

export function selectCourseDetails(activeCourses, courses, closedDetailId) {
  return [...activeCourses, ...courses.filter((course) => course.id === closedDetailId && !activeCourses.some((active) => active.id === course.id))];
}

export function isCourseClosed(course) {
  return course.isCancelled || course.approvalStatus === "rejected" || hasCourseFinished(course) || (course.lessons?.length > 0 && course.lessons.every((lesson) => lesson.isCancelled));
}
