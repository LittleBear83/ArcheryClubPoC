export function registerCourseDateCancellationRoutes({ app, getActorUser, actorHasPermission, getCourseTypePermissions, beginnersCourseReadGateway, beginnersCourseWriteGateway, auditChangeLogger, getUtcTimestampParts, broadcastBeginnersUpdated, broadcastCalendarUpdated }) {
  app.post("/api/beginners-courses/:id/cancel-dates", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ success: false, message: "An authenticated member is required." });
    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);
    if (!course || (req.body?.courseType && req.body.courseType !== course.course_type)) return res.status(404).json({ success: false, message: "Course not found." });
    const permissions = getCourseTypePermissions(course.course_type);
    if (!actorHasPermission(actor, permissions.approve) && !actorHasPermission(actor, permissions.manage) && String(actor.username).toLowerCase() !== String(course.coordinator_username).toLowerCase()) {
      return res.status(403).json({ success: false, message: "You do not have permission to cancel session dates." });
    }
    const lessonIds = req.body?.lessonIds;
    const lessons = await beginnersCourseReadGateway.listLessonsByCourseId(course.id);
    if (course.is_cancelled || !Array.isArray(lessonIds) || !lessonIds.length || new Set(lessonIds).size !== lessonIds.length || lessonIds.some((id) => !Number.isSafeInteger(id) || !lessons.some((lesson) => Number(lesson.id) === id && !lesson.is_cancelled))) {
      return res.status(400).json({ success: false, message: "Select active dates belonging to this course. Cancelled dates cannot be cancelled again." });
    }
    try {
      await beginnersCourseWriteGateway.cancelLessonDates({ courseId: course.id, lessonIds });
    } catch (error) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (auditChangeLogger) {
      const [date, time] = getUtcTimestampParts();
      await auditChangeLogger.recordEntityChange({ action: "session_dates_cancelled", actorUsername: actor.username, before: lessons.filter((lesson) => lessonIds.includes(Number(lesson.id))), after: { lessonIds, isCancelled: true }, changedAtDate: date, changedAtTime: time, entityId: String(course.id), entityLabel: "Course session dates", entityType: "beginners_course", req, target: `/api/beginners-courses/${course.id}/cancel-dates` }).catch((error) => console.error("Failed to record session date cancellation audit event", error));
    }
    broadcastBeginnersUpdated(course.course_type, "beginners.cancel_dates");
    broadcastCalendarUpdated("beginners.cancel_dates");
    return res.json({ success: true });
  });
}
