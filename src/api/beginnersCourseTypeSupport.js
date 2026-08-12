export function getDashboardPathForCourseType(courseType = "beginners") {
  if (courseType === "beginners") {
    return "/api/beginners-courses/dashboard";
  }

  return `/api/beginners-courses/dashboard?courseType=${encodeURIComponent(courseType)}`;
}

export function buildCoursePayload(courseType, payload = {}) {
  if (courseType === "beginners") {
    return { ...payload };
  }

  return {
    ...payload,
    courseType,
  };
}
