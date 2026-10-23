export function registerBeginnersCourseRoutes({
  app,
  EQUIPMENT_TYPES,
  LEGACY_NON_MEMBER_ROLE_KEYS,
  actorHasPermission,
  auditChangeLogger,
  beginnersCourseReadGateway,
  beginnersCourseWriteGateway,
  broadcastApprovalsUpdated,
  broadcastBeginnersUpdated,
  broadcastCalendarUpdated,
  buildBeginnersCourseAuditLabel,
  buildBeginnersCourseCalendarLessons,
  buildBeginnersCourseDashboard,
  buildBeginnersLessonDates,
  buildBeginnersRescheduleNotification,
  buildEquipmentCaseResponse,
  buildEquipmentMaps,
  canReallocateBeginnersCourseBooking,
  findBeginnersCourseAuditSnapshot,
  getActorUser,
  getCourseTypePermissions,
  getUtcTimestampParts,
  hasScheduleEntryStarted,
  isBeginnersCourseCoachEligible,
  memberDirectoryGateway,
  normalizeCourseType,
  requestMatchesCourseType,
  resolveCanonicalUsername,
  sanitizeBeginnersCoursePayload,
  sanitizeBeginnersCourseReschedulePayload,
  serverEventBus,
}) {
  app.get("/api/beginners-courses/dashboard", async (req, res) => {
    const actor = getActorUser(req);
    const courseType = normalizeCourseType(req.query?.courseType);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (
      !actor ||
      (!actorHasPermission(actor, coursePermissions.manage) &&
        !actorHasPermission(actor, coursePermissions.approve) &&
        !canReallocateBeginnersCourseBooking(actor, courseType))
    ) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to view Have a Go sessions."
            : "You do not have permission to view beginners courses.",
      });
      return;
    }

    const maps = await buildEquipmentMaps();
    const cases = maps.items
      .filter((item) => item.equipment_type === EQUIPMENT_TYPES.CASE)
      .map((item) => buildEquipmentCaseResponse(item, maps));
    const users = (await memberDirectoryGateway
      .listAllUsers())
      .filter(
        (user) =>
          !LEGACY_NON_MEMBER_ROLE_KEYS.has(
            String(user.user_type ?? "").trim().toLowerCase(),
          ),
      )
      .map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`.trim(),
        userType: user.user_type,
        coachingVolunteer: Boolean(user.coaching_volunteer),
      }));

    res.json({
      success: true,
      permissions: {
        canManageBeginnersCourses: actorHasPermission(
          actor,
          coursePermissions.manage,
        ),
        canApproveBeginnersCourses: actorHasPermission(
          actor,
          coursePermissions.approve,
        ),
        canReallocateBeginnerCourseBooking: canReallocateBeginnersCourseBooking(
          actor,
          courseType,
        ),
      },
      courses: await buildBeginnersCourseDashboard(courseType),
      coordinators: users,
      coaches: users.filter((user) =>
        isBeginnersCourseCoachEligible({
          user_type: user.userType,
          coaching_volunteer: user.coachingVolunteer,
        }),
      ),
      availableCases: cases.map((caseItem) => ({
        id: caseItem.id,
        reference: caseItem.number || caseItem.label || "",
        locationLabel: caseItem.currentLocation?.label ?? "",
        memberUsername: caseItem.currentLocation?.memberUsername ?? "",
        reservedParticipantUsername:
          caseItem.currentReservation?.participantUsername ?? "",
        reservedParticipantName:
          caseItem.currentReservation?.participantName ?? "",
      })),
    });
  });

  app.get("/api/beginners-courses/calendar", async (req, res) => {
    res.json({
      success: true,
      lessons: await buildBeginnersCourseCalendarLessons(req.query?.courseType),
    });
  });

  app.post("/api/beginners-courses", async (req, res) => {
    const actor = getActorUser(req);
    const courseType = normalizeCourseType(req.body?.courseType);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to submit Have a Go sessions."
            : "You do not have permission to submit beginners courses.",
      });
      return;
    }

    const sanitized = await sanitizeBeginnersCoursePayload(req.body, courseType);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [date, time] = getUtcTimestampParts();
    const courseId = await beginnersCourseWriteGateway.createCourseWithLessons({
      actorUsername,
      beginnerCapacity: sanitized.value.beginnerCapacity,
      coordinatorUsername: sanitized.value.coordinatorUsername,
      courseType,
      createdAtDate: date,
      createdAtTime: time,
      endTime: sanitized.value.endTime,
      firstLessonDate: sanitized.value.firstLessonDate,
      lessonCount: sanitized.value.lessonCount,
      lessonDates: buildBeginnersLessonDates(
        sanitized.value.firstLessonDate,
        sanitized.value.lessonCount,
      ).map((lesson) => ({
        ...lesson,
        requiredCoachCount: sanitized.value.lessonCoachRequirements[lesson.lessonNumber],
      })),
      requiredCoachesDefault: sanitized.value.requiredCoachesDefault,
      startTime: sanitized.value.startTime,
    });
    const createdCourse = await findBeginnersCourseAuditSnapshot(courseId, courseType);

    if (auditChangeLogger && createdCourse) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername,
        after: createdCourse,
        before: null,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(courseId),
        entityLabel: buildBeginnersCourseAuditLabel(createdCourse),
        entityType: "beginners_course",
        req,
        statusCode: 201,
        target: `/api/beginners-courses/${courseId}`,
      }).catch((auditError) => {
        console.error("Failed to record beginners course audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.create");
    broadcastApprovalsUpdated("beginners.create");
    broadcastCalendarUpdated("beginners.create");

    res.status(201).json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (course) => course.id === courseId,
        ) ?? null,
    });
  });

  app.post("/api/beginners-courses/:id/reschedule", async (req, res) => {
    const actor = getActorUser(req);
    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (!requestMatchesCourseType(req, course)) {
      res.status(404).json({
        success: false,
        message: "Course not found for the requested course type.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "taster-session"
            ? "You do not have permission to reschedule Taster Sessions."
            : "You do not have permission to reschedule beginners courses.",
      });
      return;
    }

    if (courseType === "have-a-go") {
      res.status(400).json({
        success: false,
        message: "Have a Go sessions cannot be rescheduled from this screen.",
      });
      return;
    }

    if (course.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "Cancelled sessions cannot be rescheduled.",
      });
      return;
    }

    if (hasScheduleEntryStarted(course.first_lesson_date, course.start_time)) {
      res.status(400).json({
        success: false,
        message: "Only future sessions can be rescheduled.",
      });
      return;
    }

    const sanitized = sanitizeBeginnersCourseReschedulePayload(req.body);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const sameDayMove = course.first_lesson_date === sanitized.value.firstLessonDate;
    const nextApprovalStatus = sameDayMove ? (course.approval_status ?? "pending") : "pending";
    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [changedAtDate, changedAtTime] = getUtcTimestampParts();
    const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

    await beginnersCourseWriteGateway.rescheduleCourse({
      approvalStatus: nextApprovalStatus,
      approvedAtDate: sameDayMove ? course.approved_at_date ?? null : null,
      approvedAtTime: sameDayMove ? course.approved_at_time ?? null : null,
      approvedByUsername: sameDayMove ? course.approved_by_username ?? null : null,
      courseId: course.id,
      endTime: sanitized.value.endTime,
      firstLessonDate: sanitized.value.firstLessonDate,
      lessonDates: buildBeginnersLessonDates(
        sanitized.value.firstLessonDate,
        course.lesson_count,
      ),
      rejectionReason: null,
      startTime: sanitized.value.startTime,
    });

    const updatedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

    if (auditChangeLogger && updatedCourse) {
      void auditChangeLogger.recordEntityChange({
        action: "rescheduled",
        actorUsername,
        after: updatedCourse,
        before: previousCourse,
        changedAtDate,
        changedAtTime,
        entityId: String(course.id),
        entityLabel: buildBeginnersCourseAuditLabel(updatedCourse),
        entityType: "beginners_course",
        req,
        target: `/api/beginners-courses/${course.id}/reschedule`,
      }).catch((auditError) => {
        console.error("Failed to record beginners course reschedule audit event", auditError);
      });
    }

    if (sameDayMove && updatedCourse) {
      serverEventBus.broadcastToAnyPermission(
        [coursePermissions.approve],
        "beginners.rescheduled",
        buildBeginnersRescheduleNotification(updatedCourse),
      );
    }

    broadcastBeginnersUpdated(courseType, "beginners.reschedule");
    broadcastCalendarUpdated("beginners.reschedule");
    if (!sameDayMove) {
      broadcastApprovalsUpdated("beginners.reschedule");
    }

    res.json({
      success: true,
      approvalReset: !sameDayMove,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === course.id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-courses/:id/approve", async (req, res) => {
    const actor = getActorUser(req);

    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (!requestMatchesCourseType(req, course)) {
      res.status(404).json({
        success: false,
        message: "Course not found for the requested course type.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.approve)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to approve Have a Go sessions."
            : "You do not have permission to approve beginners courses.",
      });
      return;
    }

    if (course.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "Cancelled beginners courses cannot be approved.",
      });
      return;
    }

    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [date, time] = getUtcTimestampParts();
    const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
    await beginnersCourseWriteGateway.reviewCourse({
      approvalStatus: "approved",
      approvedAtDate: date,
      approvedAtTime: time,
      approvedByUsername: actorUsername,
      courseId: course.id,
      rejectionReason: null,
    });
    const approvedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

    if (auditChangeLogger && approvedCourse) {
      void auditChangeLogger.recordEntityChange({
        action: "approved",
        actorUsername,
        after: approvedCourse,
        before: previousCourse,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(course.id),
        entityLabel: buildBeginnersCourseAuditLabel(approvedCourse),
        entityType: "beginners_course",
        req,
        target: `/api/beginners-courses/${course.id}/approve`,
      }).catch((auditError) => {
        console.error("Failed to record beginners course audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.approve");
    broadcastApprovalsUpdated("beginners.approve");
    broadcastCalendarUpdated("beginners.approve");

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === course.id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-courses/:id/reject", async (req, res) => {
    const actor = getActorUser(req);

    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (!requestMatchesCourseType(req, course)) {
      res.status(404).json({
        success: false,
        message: "Course not found for the requested course type.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.approve)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to reject Have a Go sessions."
            : "You do not have permission to reject beginners courses.",
      });
      return;
    }

    if (course.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "Cancelled beginners courses cannot be rejected.",
      });
      return;
    }

    const rejectionReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 280) : "";

    if (!rejectionReason) {
      res.status(400).json({
        success: false,
        message: "Please add a short rejection reason.",
      });
      return;
    }

    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [date, time] = getUtcTimestampParts();
    const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
    await beginnersCourseWriteGateway.reviewCourse({
      approvalStatus: "rejected",
      approvedAtDate: date,
      approvedAtTime: time,
      approvedByUsername: actorUsername,
      courseId: course.id,
      rejectionReason,
    });
    const rejectedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

    if (auditChangeLogger && rejectedCourse) {
      void auditChangeLogger.recordEntityChange({
        action: "rejected",
        actorUsername,
        after: rejectedCourse,
        before: previousCourse,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(course.id),
        entityLabel: buildBeginnersCourseAuditLabel(rejectedCourse),
        entityType: "beginners_course",
        req,
        target: `/api/beginners-courses/${course.id}/reject`,
      }).catch((auditError) => {
        console.error("Failed to record beginners course audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.reject");
    broadcastApprovalsUpdated("beginners.reject");
    broadcastCalendarUpdated("beginners.reject");

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === course.id,
        ) ?? null,
    });
  });

  app.delete("/api/beginners-courses/:id", async (req, res) => {
    const actor = getActorUser(req);
    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (!requestMatchesCourseType(req, course)) {
      res.status(404).json({
        success: false,
        message: "Course not found for the requested course type.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);
    const canCancelCourse =
      actorHasPermission(actor, coursePermissions.approve) ||
      String(actor.username ?? "").localeCompare(
        String(course.coordinator_username ?? ""),
        undefined,
        { sensitivity: "accent" },
      ) === 0;

    if (!canCancelCourse) {
      res.status(403).json({
        success: false,
        message: "Only the course coordinator or an admin can cancel this course.",
      });
      return;
    }

    if (course.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "This beginners course is already cancelled.",
      });
      return;
    }

    const cancellationReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 280) : "";

    if (!cancellationReason) {
      res.status(400).json({
        success: false,
        message: "Please add a reason for cancelling this course.",
      });
      return;
    }

    const actorUsername = await resolveCanonicalUsername(actor.username);
    const [date, time] = getUtcTimestampParts();
    const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
    await beginnersCourseWriteGateway.cancelCourse({
      actorUsername,
      cancelledAtDate: date,
      cancelledAtTime: time,
      courseId: course.id,
      reason: cancellationReason,
    });
    const cancelledCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

    if (auditChangeLogger && cancelledCourse) {
      void auditChangeLogger.recordEntityChange({
        action: "cancelled",
        actorUsername,
        after: cancelledCourse,
        before: previousCourse,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(course.id),
        entityLabel: buildBeginnersCourseAuditLabel(cancelledCourse),
        entityType: "beginners_course",
        req,
        target: `/api/beginners-courses/${course.id}`,
      }).catch((auditError) => {
        console.error("Failed to record beginners course audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.cancel");
    broadcastApprovalsUpdated("beginners.cancel");
    broadcastCalendarUpdated("beginners.cancel");

    res.json({
      success: true,
    });
  });

}
