function defaultRequiredCoaches(courseType) {
  return courseType === "beginners" || courseType === "taster-session" ? 5 : 1;
}

function lessonHasStarted(lesson, now) {
  return new Date(`${lesson.lesson_date}T${lesson.start_time}`).getTime() <= now.getTime();
}

function lessonHasEnded(lesson, now) {
  return new Date(`${lesson.lesson_date}T${lesson.end_time}`).getTime() <= now.getTime();
}

function lessonStatus(lesson, now) {
  if (lessonHasEnded(lesson, now)) return "completed";
  if (lessonHasStarted(lesson, now)) return "in-progress";
  return "upcoming";
}

function isApprovedActiveCourse(course, lesson) {
  return course &&
    (course.approval_status ?? "pending") === "approved" &&
    !course.is_cancelled && !lesson.is_cancelled;
}

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

export function registerCoachingHubRoutes({
  app,
  actorHasPermission,
  getCourseTypePermissions,
  getActorUser,
  isCoachEligible,
  beginnersCourseReadGateway,
  beginnersCourseWriteGateway,
  manualLessonAttendanceGateway,
  buildBeginnersCourseCalendarLessons,
  getUtcTimestampParts,
  normalizeCourseType,
  resolveCanonicalUsername,
  findBeginnersLessonAuditSnapshot,
  auditChangeLogger,
  broadcastBeginnersUpdated,
  broadcastCalendarUpdated,
  broadcastToUsers = () => {},
}) {
  const changeManualAttendance = async (req, res, attended) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "Sign in to record attendance.");
    const lessonId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !Number.isSafeInteger(participantId) || participantId < 1) {
      return sendError(res, 400, "Invalid lesson or participant.");
    }
    const lesson = await beginnersCourseReadGateway.findLessonById(lessonId);
    if (!lesson) return sendError(res, 404, "Lesson not found.");
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson)) return sendError(res, 409, "This lesson is not active.");
    const coaches = await beginnersCourseReadGateway.listLessonCoachesByLessonId(lessonId);
    const actorName = String(actor.username ?? "").toLowerCase();
    if (actorName !== String(course.coordinator_username ?? "").toLowerCase() &&
      !coaches.some((coach) => String(coach.coach_username).toLowerCase() === actorName)) {
      return sendError(res, 403, "Only the coordinator or an assigned coach can record attendance.");
    }
    if (!lessonHasStarted(lesson, new Date())) return sendError(res, 409, "Attendance can be recorded once the lesson starts.");
    const participants = await beginnersCourseReadGateway.listParticipantsByCourseId(course.id);
    const participant = participants.find((row) => Number(row.id) === participantId);
    if (!participant) return sendError(res, 404, "Participant is not enrolled in this course.");
    const [date, time] = getUtcTimestampParts();
    if (attended) {
      await manualLessonAttendanceGateway.set({ lessonId, participantId, actorUsername: actor.username, date, time });
    } else {
      await manualLessonAttendanceGateway.remove({ lessonId, participantId });
    }
    if (auditChangeLogger) void auditChangeLogger.recordEntityChange({
      action: attended ? "manual_attendance_recorded" : "manual_attendance_removed",
      actorUsername: actor.username, before: null,
      after: { lessonId, participantId, username: participant.username, attended },
      changedAtDate: date, changedAtTime: time, entityId: `${lessonId}:${participantId}`,
      entityLabel: `${participant.first_name} ${participant.surname}`.trim(),
      entityType: "beginners_lesson_attendance", req,
      target: `/api/beginners-course-lessons/${lessonId}/attendance/${participantId}`,
    }).catch((error) => console.error("Failed to audit manual attendance", error));
    broadcastBeginnersUpdated(normalizeCourseType(course.course_type), "beginners.attendance-changed");
    return res.json({ success: true, attended });
  };
  app.post("/api/beginners-course-lessons/:id/attendance/:participantId", (req, res) => changeManualAttendance(req, res, true));
  app.delete("/api/beginners-course-lessons/:id/attendance/:participantId", (req, res) => changeManualAttendance(req, res, false));

  app.get("/api/my-beginner-coaching-assignments", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");

    const now = new Date();
    const lessons = (await beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id)).map((lesson) => ({
      id: lesson.id,
      courseId: lesson.course_id,
      courseType: normalizeCourseType(lesson.course_type),
      lessonNumber: lesson.lesson_number,
      date: lesson.lesson_date,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      coordinatorName: `${lesson.coordinator_first_name} ${lesson.coordinator_surname}`.trim(),
      beginnerCount: Number(lesson.participant_count ?? 0),
      participantCapacity: Number(lesson.beginner_capacity ?? 0),
      coachCount: Number(lesson.coach_count ?? 0),
      requiredCoachCount: Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)),
      assignedCoachCount: Number(lesson.coach_count ?? 0),
      coachShortfall: Math.max(Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)) - Number(lesson.coach_count ?? 0), 0),
      isFullyCovered: Number(lesson.coach_count ?? 0) >= Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)),
      sessionStatus: lessonStatus(lesson, now),
    }));

    return res.json({ success: true, lessons });
  });

  app.get("/api/my-coaching-opportunities", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");

    const [calendarLessons, assignedLessons] = await Promise.all([
      buildBeginnersCourseCalendarLessons(),
      beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id),
    ]);
    const assignedIds = new Set(assignedLessons.map((lesson) => String(lesson.id)));
    const now = new Date();
    const lessons = calendarLessons
      .filter((lesson) =>
        !lesson.isCancelled &&
        new Date(`${lesson.date}T${lesson.startTime}`).getTime() > now.getTime() &&
        !assignedIds.has(String(lesson.lessonId)) &&
        lesson.coachNames.length < Number(lesson.requiredCoachCount ?? defaultRequiredCoaches(lesson.courseType)),
      )
      .map((lesson) => ({
        lessonId: lesson.lessonId,
        courseId: lesson.courseId,
        courseType: lesson.courseType,
        lessonNumber: lesson.lessonNumber,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        coordinatorName: lesson.coordinatorName,
        participantCount: lesson.participantCount ?? lesson.beginnerCount,
        participantCapacity: lesson.participantCapacity ?? lesson.beginnerCapacity,
        coachNames: lesson.coachNames,
        requiredCoachCount: Number(lesson.requiredCoachCount ?? defaultRequiredCoaches(lesson.courseType)),
        assignedCoachCount: lesson.coachNames.length,
        coachShortfall: Math.max(Number(lesson.requiredCoachCount ?? defaultRequiredCoaches(lesson.courseType)) - lesson.coachNames.length, 0),
        isFullyCovered: lesson.coachNames.length >= Number(lesson.requiredCoachCount ?? defaultRequiredCoaches(lesson.courseType)),
      }))
      .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime) || right.coachShortfall - left.coachShortfall);
    return res.json({ success: true, lessons });
  });

  app.post("/api/beginners-course-lessons/:id/volunteer", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");

    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);
    if (!lesson) return sendError(res, 404, "Coaching session not found.");
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson)) return sendError(res, 409, "This session is not available for volunteering.");
    if (new Date(`${lesson.lesson_date}T${lesson.start_time}`).getTime() <= Date.now()) {
      return sendError(res, 409, "You can only volunteer for a future session.");
    }

    const currentCoaches = await beginnersCourseReadGateway.listLessonCoachesByLessonId(lesson.id);
    if (currentCoaches.some((coach) => coach.coach_username.toLowerCase() === actor.username.toLowerCase())) {
      return sendError(res, 409, "You are already assigned to this session.");
    }
    if (currentCoaches.length >= Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type))) return sendError(res, 409, "This session already has its required coach coverage.");

    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [date, time] = getUtcTimestampParts();
    const before = await findBeginnersLessonAuditSnapshot(lesson.id, normalizeCourseType(course.course_type));
    const inserted = await beginnersCourseWriteGateway.addLessonCoachSelf({
      actorUsername,
      assignedAtDate: date,
      assignedAtTime: time,
      lessonId: lesson.id,
    });
    if (!inserted) return sendError(res, 409, "This session has changed. Refresh and try again.");

    const after = await findBeginnersLessonAuditSnapshot(lesson.id, normalizeCourseType(course.course_type));
    if (auditChangeLogger && after) {
      void auditChangeLogger.recordEntityChange({
        action: "coach_volunteered",
        actorUsername,
        after,
        before,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(lesson.id),
        entityLabel: `Lesson ${lesson.lesson_number} ${lesson.lesson_date}`,
        entityType: "beginners_lesson",
        req,
        target: `/api/beginners-course-lessons/${lesson.id}/volunteer`,
      }).catch((error) => console.error("Failed to record coaching volunteer audit event", error));
    }
    const courseType = normalizeCourseType(course.course_type);
    broadcastBeginnersUpdated(courseType, "beginners.coach-volunteered");
    broadcastCalendarUpdated("beginners.coach-volunteered");
    const requiredCoachCount = Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type));
    broadcastCoachingAssignmentChanged({ action: "volunteered", actor, actorUsername, broadcastToUsers, course, lesson, requiredCoachCount, assignedCoachCount: currentCoaches.length + 1, reason: "" });
    return res.json({ success: true, message: "You have volunteered for this session." });
  });

  app.delete("/api/beginners-course-lessons/:id/my-assignment", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");

    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);
    if (!lesson) return sendError(res, 404, "Coaching session not found.");
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson)) return sendError(res, 409, "This session is no longer active.");
    const actorUsername = await resolveCanonicalUsername(actor.username);
    const currentCoaches = await beginnersCourseReadGateway.listLessonCoachesByLessonId(lesson.id);
    if (!currentCoaches.some((coach) => coach.coach_username.toLowerCase() === actorUsername.toLowerCase())) {
      return sendError(res, 404, "Your assignment was not found.");
    }
    if (new Date(`${lesson.lesson_date}T${lesson.end_time}`).getTime() <= Date.now()) {
      return sendError(res, 409, "You cannot withdraw from a completed session.");
    }

    const [date, time] = getUtcTimestampParts();
    const before = await findBeginnersLessonAuditSnapshot(lesson.id, normalizeCourseType(course.course_type));
    const removed = await beginnersCourseWriteGateway.removeLessonCoachSelf({
      actorUsername,
      lessonId: lesson.id,
      nowDate: date,
      nowTime: time,
    });
    if (!removed) return sendError(res, 409, "This session has changed. Refresh and try again.");
    const after = await findBeginnersLessonAuditSnapshot(lesson.id, normalizeCourseType(course.course_type));
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    if (auditChangeLogger && before) {
      void auditChangeLogger.recordEntityChange({
        action: "coach_withdrew",
        actorUsername,
        after: reason ? { ...after, withdrawalReason: reason } : after,
        before,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(lesson.id),
        entityLabel: `Lesson ${lesson.lesson_number} ${lesson.lesson_date}`,
        entityType: "beginners_lesson",
        req,
        target: `/api/beginners-course-lessons/${lesson.id}/my-assignment`,
      }).catch((error) => console.error("Failed to record coaching withdrawal audit event", error));
    }
    const courseType = normalizeCourseType(course.course_type);
    broadcastBeginnersUpdated(courseType, "beginners.coach-withdrew");
    broadcastCalendarUpdated("beginners.coach-withdrew");
    const requiredCoachCount = Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type));
    broadcastCoachingAssignmentChanged({ action: "withdrew", actor, actorUsername, broadcastToUsers, course, lesson, requiredCoachCount, assignedCoachCount: currentCoaches.length - 1, reason });
    return res.json({ success: true, message: "You have withdrawn from this session." });
  });

  app.put("/api/beginners-course-lessons/:id/required-coaches", async (req, res) => {
    const actor = getActorUser(req);
    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);
    if (!lesson) return sendError(res, 404, "Coaching session not found.");
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const permission = getCourseTypePermissions(courseType)?.manage;
    if (!actor || !permission || !actorHasPermission(actor, permission)) return sendError(res, 403, "Course management access is required.");
    const requiredCoachCount = req.body?.requiredCoachCount;
    if (!Number.isInteger(requiredCoachCount) || requiredCoachCount < 1 || requiredCoachCount > 2147483647) return sendError(res, 400, "Required coach count must be a whole number from 1 to 2,147,483,647.");
    const [date, time] = getUtcTimestampParts();
    const before = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);
    const updated = await beginnersCourseWriteGateway.setLessonRequiredCoachCount({ lessonId: lesson.id, requiredCoachCount });
    if (!updated) return sendError(res, 409, "This session has changed. Refresh and try again.");
    const after = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);
    if (auditChangeLogger && after) void auditChangeLogger.recordEntityChange({ action: "required_coach_count_changed", actorUsername: actor.username, after, before, changedAtDate: date, changedAtTime: time, entityId: String(lesson.id), entityLabel: `Lesson ${lesson.lesson_number} ${lesson.lesson_date}`, entityType: "beginners_lesson", req, target: `/api/beginners-course-lessons/${lesson.id}/required-coaches` }).catch((error) => console.error("Failed to record required coach count audit event", error));
    broadcastBeginnersUpdated(courseType, "beginners.required-coaches-changed");
    broadcastCalendarUpdated("beginners.required-coaches-changed");
    return res.json({ success: true, requiredCoachCount });
  });

  app.get("/api/my-coaching-lessons/:id/details", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");
    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);
    if (!lesson) return sendError(res, 404, "Coaching session not found.");
    const assigned = await beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id);
    const assignment = assigned.find((entry) => String(entry.id) === String(lesson.id));
    if (!assignment) {
      return sendError(res, 403, "Only assigned coaches can view session participants.");
    }
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson)) return sendError(res, 404, "Coaching session not found.");
    const [coaches, participants, attendanceRows, manualRows] = await Promise.all([
      beginnersCourseReadGateway.listLessonCoachesByLessonId(lesson.id),
      beginnersCourseReadGateway.listParticipantsByCourseId(course.id),
      beginnersCourseReadGateway.listParticipantAttendanceByDate(course.id, lesson.lesson_date),
      manualLessonAttendanceGateway.listAll(),
    ]);
    const now = new Date();
    const attendedUsernames = new Set(attendanceRows.map((row) => row.username.toLowerCase()));
    const manualParticipantIds = new Set(manualRows.filter((row) => Number(row.lesson_id) === Number(lesson.id)).map((row) => Number(row.participant_id)));
    return res.json({
      success: true,
      lesson: {
        id: lesson.id,
        courseId: course.id,
        courseType: normalizeCourseType(course.course_type),
        lessonNumber: lesson.lesson_number,
        date: lesson.lesson_date,
        startTime: lesson.start_time,
        endTime: lesson.end_time,
        coordinatorName: `${assignment.coordinator_first_name ?? ""} ${assignment.coordinator_surname ?? ""}`.trim(),
        participantCount: participants.length,
        participantCapacity: course.beginner_capacity,
        status: lessonStatus(lesson, now),
        requiredCoachCount: Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)),
        assignedCoachCount: coaches.length,
        coachShortfall: Math.max(Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)) - coaches.length, 0),
        isFullyCovered: coaches.length >= Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type)),
        coaches: coaches.map((coach) => ({
          username: coach.coach_username,
          fullName: `${coach.first_name} ${coach.surname}`.trim(),
          isCoordinator: coach.coach_username.toLowerCase() === course.coordinator_username.toLowerCase(),
        })),
        participants: participants.map((participant) => ({
          id: participant.id,
          firstName: participant.first_name,
          surname: participant.surname,
          sizeCategory: participant.beginner_size_category,
          handedness: participant.handedness,
          eyeDominance: participant.eye_dominance,
          drawLength: participant.draw_length,
          noShowRecorded: Boolean(participant.no_show_recorded),
          attendanceRecorded: attendedUsernames.has(participant.username.toLowerCase()) || manualParticipantIds.has(Number(participant.id)),
          manualAttendanceRecorded: manualParticipantIds.has(Number(participant.id)),
        })),
      },
    });
  });
}

function broadcastCoachingAssignmentChanged({ action, actor, actorUsername, broadcastToUsers, course, lesson, requiredCoachCount, assignedCoachCount, reason }) {
  const coordinatorUsername = course.coordinator_username;
  if (!coordinatorUsername || coordinatorUsername.toLowerCase() === actorUsername.toLowerCase()) return;
  broadcastToUsers([coordinatorUsername], "coaching.assignment.changed", {
    eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action,
    courseId: course.id,
    lessonId: lesson.id,
    type: course.course_type,
    courseType: course.course_type,
    lessonNumber: lesson.lesson_number,
    lessonDate: lesson.lesson_date,
    actorUsername,
    actorName: `${actor.first_name ?? ""} ${actor.surname ?? ""}`.trim() || actor.username,
    coordinatorUsername,
    requiredCoachCount,
    assignedCoachCount,
    coachShortfall: Math.max(requiredCoachCount - assignedCoachCount, 0),
    reason,
  });
}
