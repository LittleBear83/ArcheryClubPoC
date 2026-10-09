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

function initials(firstName, surname) {
  return `${String(firstName ?? "").trim().charAt(0)}${String(surname ?? "").trim().charAt(0)}`.toUpperCase();
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
  coachingAssignmentNotificationGateway,
  coachingParticipantNoteGateway,
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
  const noteContext = async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) { sendError(res, 401, "An authenticated member is required."); return null; }
    if (!isCoachEligible(actor)) { sendError(res, 403, "Coaching volunteer access is required."); return null; }
    const lessonId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !Number.isSafeInteger(participantId) || participantId < 1) {
      sendError(res, 400, "Invalid lesson or participant."); return null;
    }
    const lesson = await beginnersCourseReadGateway.findLessonById(lessonId);
    if (!lesson) { sendError(res, 404, "Lesson not found."); return null; }
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson) || normalizeCourseType(course.course_type) !== "beginners") {
      sendError(res, 404, "Beginners course not found."); return null;
    }
    const assigned = await beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id);
    if (!assigned.some((entry) => Number(entry.course_id) === Number(course.id))) {
      sendError(res, 403, "Only coaches assigned to this course can access participant notes."); return null;
    }
    const participants = await beginnersCourseReadGateway.listParticipantsByCourseId(course.id);
    const participant = participants.find((entry) => Number(entry.id) === participantId);
    if (!participant) { sendError(res, 404, "Participant is not enrolled in this course."); return null; }
    return { actor, course, participant };
  };

  app.get("/api/my-coaching-lessons/:id/participants/:participantId/notes", async (req, res) => {
    const context = await noteContext(req, res);
    if (!context) return;
    const notes = await coachingParticipantNoteGateway.listForParticipant(context.participant.id);
    return res.json({ success: true, notes });
  });

  app.post("/api/my-coaching-lessons/:id/participants/:participantId/notes", async (req, res) => {
    const context = await noteContext(req, res);
    if (!context) return;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 500) return sendError(res, 400, "Enter a note of 1 to 500 characters.");
    const { actor, course, participant } = context;
    const note = await coachingParticipantNoteGateway.add({
      courseId: course.id,
      participantId: participant.id,
      authorUsername: actor.username,
      authorInitials: initials(actor.first_name ?? actor.firstName, actor.surname) || String(actor.username).slice(0, 2).toUpperCase(),
      attendeeInitials: initials(participant.first_name, participant.surname),
      text,
    });
    return res.status(201).json({ success: true, note });
  });

  app.get("/api/my-coaching-notes", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");
    const notes = await coachingParticipantNoteGateway.listForAuthor(actor.username);
    return res.json({ success: true, notes });
  });

  app.get("/api/my-coaching-assignment-notifications", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    const notifications = await coachingAssignmentNotificationGateway.list(actor.username);
    return res.json({ success: true, notifications });
  });

  app.delete("/api/my-coaching-assignment-notifications/:id", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!/^[1-9]\d*$/.test(String(req.params.id))) return sendError(res, 400, "Invalid notification.");
    const removed = await coachingAssignmentNotificationGateway.remove(actor.username, req.params.id);
    if (!removed) return sendError(res, 404, "Notification not found.");
    return res.json({ success: true });
  });

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
    const isCoordinator = actorName === String(course.coordinator_username ?? "").toLowerCase();
    const isLessonCoach = coaches.some((coach) => String(coach.coach_username).toLowerCase() === actorName);
    const isCourseCoach = !isCoordinator && !isLessonCoach && actor.id != null &&
      (await beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id))
        .some((assignedLesson) => Number(assignedLesson.course_id) === Number(course.id));
    if (!isCoordinator && !isLessonCoach && !isCourseCoach) {
      return sendError(res, 403, "Only the coordinator or an assigned coach can record attendance.");
    }
    const participants = await beginnersCourseReadGateway.listParticipantsByCourseId(course.id);
    const participant = participants.find((row) => Number(row.id) === participantId);
    if (!participant) return sendError(res, 404, "Participant is not enrolled in this course.");
    if (attended) {
      const signIns = await beginnersCourseReadGateway.listParticipantAttendanceByDate(course.id, lesson.lesson_date);
      if (signIns.some((row) => String(row.username).toLowerCase() === String(participant.username).toLowerCase())) {
        return sendError(res, 409, "This participant already signed in on this date.");
      }
    }
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
    await broadcastCoachingAssignmentChanged({ action: "volunteered", actor, actorUsername, broadcastToUsers, coachingAssignmentNotificationGateway, course, lesson, requiredCoachCount, assignedCoachCount: currentCoaches.length + 1, reason: "" });
    return res.json({ success: true, message: "You have volunteered for this session." });
  });

  app.post("/api/beginners-course-lessons/:id/unavailability", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return sendError(res, 401, "An authenticated member is required.");
    if (!isCoachEligible(actor)) return sendError(res, 403, "Coaching volunteer access is required.");

    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);
    if (!lesson) return sendError(res, 404, "Coaching session not found.");
    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    if (!isApprovedActiveCourse(course, lesson)) return sendError(res, 409, "This session is no longer active.");
    if (!course.coordinator_username) return sendError(res, 409, "This session has no coordinator to notify.");
    const actorUsername = await resolveCanonicalUsername(actor.username);
    const currentCoaches = await beginnersCourseReadGateway.listLessonCoachesByLessonId(lesson.id);
    if (!currentCoaches.some((coach) => coach.coach_username.toLowerCase() === actorUsername.toLowerCase())) {
      return sendError(res, 404, "Your assignment was not found.");
    }
    if (new Date(`${lesson.lesson_date}T${lesson.end_time}`).getTime() <= Date.now()) {
      return sendError(res, 409, "You cannot report unavailability for a completed session.");
    }

    const pendingNotices = await coachingAssignmentNotificationGateway.list(course.coordinator_username);
    if (pendingNotices.some((notice) =>
      notice.action === "cannot_attend" &&
      String(notice.lessonId) === String(lesson.id) &&
      String(notice.actorUsername).toLowerCase() === actorUsername.toLowerCase()
    )) {
      return res.json({ success: true, message: "The coordinator has already been notified. You remain assigned until they update the session." });
    }

    const [date, time] = getUtcTimestampParts();
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
    const requiredCoachCount = Number(lesson.required_coach_count ?? defaultRequiredCoaches(lesson.course_type));
    await broadcastCoachingAssignmentChanged({
      action: "cannot_attend", actor, actorUsername, broadcastToUsers,
      coachingAssignmentNotificationGateway, course, lesson, requiredCoachCount,
      assignedCoachCount: currentCoaches.length, reason,
    });
    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "coach_unavailability_reported",
        actorUsername,
        after: { lessonId: lesson.id, coachUsername: actorUsername, reason, assignmentRetained: true },
        before: null,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(lesson.id),
        entityLabel: `Lesson ${lesson.lesson_number} ${lesson.lesson_date}`,
        entityType: "beginners_lesson",
        req,
        target: `/api/beginners-course-lessons/${lesson.id}/unavailability`,
      }).catch((error) => console.error("Failed to record coaching unavailability audit event", error));
    }
    return res.json({ success: true, message: "The coordinator has been notified. You remain assigned until they update the session." });
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
    const [coaches, participants, attendanceRows, manualRows, noteCounts] = await Promise.all([
      beginnersCourseReadGateway.listLessonCoachesByLessonId(lesson.id),
      beginnersCourseReadGateway.listParticipantsByCourseId(course.id),
      beginnersCourseReadGateway.listParticipantAttendanceByDate(course.id, lesson.lesson_date),
      manualLessonAttendanceGateway.listAll(),
      normalizeCourseType(course.course_type) === "beginners" ? coachingParticipantNoteGateway.listCountsForCourse(course.id) : Promise.resolve(new Map()),
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
          noteCount: noteCounts.get(Number(participant.id)) ?? 0,
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

async function broadcastCoachingAssignmentChanged({ action, actor, actorUsername, broadcastToUsers, coachingAssignmentNotificationGateway, course, lesson, requiredCoachCount, assignedCoachCount, reason }) {
  const coordinatorUsername = course.coordinator_username;
  if (!coordinatorUsername || (action !== "cannot_attend" && coordinatorUsername.toLowerCase() === actorUsername.toLowerCase())) return;
  const payload = {
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
  };
  const eventId = await coachingAssignmentNotificationGateway.add(coordinatorUsername, payload);
  broadcastToUsers([coordinatorUsername], "coaching.assignment.changed", { ...payload, eventId });
}
