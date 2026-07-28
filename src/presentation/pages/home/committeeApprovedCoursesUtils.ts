type CourseLessonLike = {
  date?: string;
  endTime?: string;
};

type CourseLike = {
  approvalStatus?: string;
  isCancelled?: boolean;
  lessons?: CourseLessonLike[];
};

function hasCourseFinished(course: CourseLike, now: Date = new Date()) {
  if (!course.lessons?.length) {
    return false;
  }

  const lastLesson = [...course.lessons].sort((left, right) => {
    const byDate = String(left.date ?? "").localeCompare(String(right.date ?? ""));
    if (byDate !== 0) {
      return byDate;
    }

    return String(left.endTime ?? "").localeCompare(String(right.endTime ?? ""));
  })[course.lessons.length - 1];

  if (!lastLesson?.date || !lastLesson?.endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(lastLesson.endTime)
    ? `${lastLesson.endTime}:00`
    : lastLesson.endTime;
  const lessonEnd = new Date(`${lastLesson.date}T${normalizedEndTime}`);

  if (Number.isNaN(lessonEnd.getTime())) {
    return false;
  }

  return lessonEnd.getTime() < now.getTime();
}

export function countActiveApprovedCourses(
  courses: CourseLike[],
  now: Date = new Date(),
) {
  return courses.filter(
    (course) =>
      course.approvalStatus === "approved" &&
      !course.isCancelled &&
      !hasCourseFinished(course, now),
  ).length;
}
