import { getClubTodayDate } from "../../../shared/clubDate.js";

export function registerBeginnersCourseParticipantRoutes({
  app,
  BeginnerConversionFailure,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  LEGACY_NON_MEMBER_ROLE_KEYS,
  PERMISSIONS,
  actorHasPermission,
  auditChangeLogger,
  beginnersCourseReadGateway,
  beginnersCourseWriteGateway,
  broadcastBeginnersUpdated,
  broadcastEquipmentUpdated,
  broadcastMembersUpdated,
  buildBeginnersCourseDashboard,
  buildBeginnersLessonAuditLabel,
  buildBeginnersParticipantAuditLabel,
  buildBeginnersPassword,
  buildBeginnersUsername,
  buildLoanBowRecord,
  canReallocateBeginnersCourseBooking,
  createEquipmentGateway,
  db,
  equipmentGateway,
  findBeginnersLessonAuditSnapshot,
  findBeginnersParticipantAuditSnapshot,
  getActorUser,
  getCourseParticipantMembershipStatus,
  getCourseParticipantProgrammeType,
  getCourseParticipantUserType,
  getCourseTypePermissions,
  getDefaultLoanBowRecord,
  getUtcTimestampParts,
  hasBeginnersCourseCompleted,
  hasParticipantRecordedAttendance,
  hasScheduleEntryStarted,
  hashPassword,
  isBeginnersCourseCoachEligible,
  loanAssignedCaseForBeginnerConversion,
  memberDirectoryGateway,
  memberPersistenceService,
  normalizeCourseType,
  runBeginnerConversion,
  sanitizeBeginnersParticipantPayload,
  serverRuntime,
  toUtcDateString,
  validateAssignedCaseForBeginnerConversion,
  validateBeginnerConversionDate,
  withBeginnerConversionTransaction,
}) {
  app.post("/api/beginners-courses/:id/beginners", async (req, res) => {
    const actor = getActorUser(req);

    const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to add participants to a Have a Go session."
            : "You do not have permission to add beginners to a course.",
      });
      return;
    }

    if (course.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "Cancelled beginners courses cannot accept new beginners.",
      });
      return;
    }

    if (course.approval_status !== "approved") {
      res.status(400).json({
        success: false,
        message: "Approve the course before booking beginners onto it.",
      });
      return;
    }

    if (
      (await beginnersCourseReadGateway.listParticipantsByCourseId(course.id)).length >=
      course.beginner_capacity
    ) {
      res.status(400).json({
        success: false,
        message: "This beginners course is already full.",
      });
      return;
    }

    const sanitized = sanitizeBeginnersParticipantPayload(req.body);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const password = buildBeginnersPassword();
    const username = await buildBeginnersUsername(
      sanitized.value.firstName,
      sanitized.value.surname,
    );
    const [date, time] = getUtcTimestampParts();
    const userResult = await memberPersistenceService.saveMemberProfile({
      username,
      firstName: sanitized.value.firstName,
      surname: sanitized.value.surname,
      archeryGbMembershipNumber: "",
      password,
      rfidTag: "",
      activeMember: true,
      affiliateMember: false,
      juniorMember: false,
      membershipFeesDue: "",
      coachingVolunteer: false,
      userType: getCourseParticipantUserType(courseType),
      membershipStatus: getCourseParticipantMembershipStatus(),
      programmeType: getCourseParticipantProgrammeType(courseType),
      disciplines: [],
      loanBow: getDefaultLoanBowRecord(),
      existingUser: null,
    });

    if (!userResult.success) {
      res.status(userResult.status).json(userResult);
      return;
    }

    await beginnersCourseWriteGateway.createParticipant({
      actorUsername: actor.username,
      courseId: course.id,
      createdAtDate: date,
      createdAtTime: time,
      originCourseType: courseType,
      participant: sanitized.value,
      username,
    });
    const createdParticipant = await beginnersCourseReadGateway.findParticipantByUsername(username);
    const createdParticipantSnapshot = createdParticipant
      ? await findBeginnersParticipantAuditSnapshot(createdParticipant.id, courseType)
      : null;

    if (auditChangeLogger && createdParticipantSnapshot) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: createdParticipantSnapshot,
        before: null,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(createdParticipant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(createdParticipantSnapshot),
        entityType: "beginners_participant",
        req,
        statusCode: 201,
        target: `/api/beginners-course-participants/${createdParticipant.id}`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.participant-create");
    broadcastMembersUpdated("beginners.participant-create", username);

    res.status(201).json({
      success: true,
      username,
      temporaryPassword: password,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === course.id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-participants/:id/reset-password", async (req, res) => {
    const actor = getActorUser(req);
    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Beginner record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    const courseType = normalizeCourseType(course.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to reset Have a Go participant passwords."
            : "You do not have permission to reset beginner passwords.",
      });
      return;
    }

    const password = buildBeginnersPassword();
    const [resetAtDate, resetAtTime] = getUtcTimestampParts();
    await beginnersCourseWriteGateway.resetParticipantPassword({
      passwordHash: hashPassword(password),
      username: participant.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "password_reset",
        actorUsername: actor.username,
        after: {
          passwordReset: true,
          username: participant.username,
        },
        before: {
          passwordReset: false,
          username: participant.username,
        },
        changedAtDate: resetAtDate,
        changedAtTime: resetAtTime,
        entityId: String(participant.id),
        entityLabel: `${participant.first_name} ${participant.surname}`.trim(),
        entityType: "beginners_participant_credentials",
        req,
        target: `/api/beginners-course-participants/${participant.id}/reset-password`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.password-reset");
    broadcastMembersUpdated("beginners.password-reset", participant.username);

    res.json({
      success: true,
      username: participant.username,
      temporaryPassword: password,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === course.id,
        ) ?? null,
    });
  });

  app.put("/api/beginners-course-participants/:id", async (req, res) => {
    const actor = getActorUser(req);

    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Beginner record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to update Have a Go participants."
            : "You do not have permission to update beginners.",
      });
      return;
    }

    const sanitized = sanitizeBeginnersParticipantPayload(req.body);

    if (!sanitized.success) {
      res.status(sanitized.status).json(sanitized);
      return;
    }

    const existingUser = await memberDirectoryGateway.findUserByUsername(
      participant.username,
    );
    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );

    await beginnersCourseWriteGateway.updateParticipant({
      existingUser,
      participant: sanitized.value,
      participantId: participant.id,
    });
    const updatedParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    if (auditChangeLogger && updatedParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedParticipant,
        before: previousParticipant,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(updatedParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.participant-update");
    broadcastMembersUpdated("beginners.participant-update", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === participant.course_id,
        ) ?? null,
    });
  });

  app.delete("/api/beginners-course-participants/:id", async (req, res) => {
    const actor = getActorUser(req);
    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Participant record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "taster-session"
            ? "You do not have permission to remove Taster Session attendees."
            : "You do not have permission to remove beginners.",
      });
      return;
    }

    if (courseType === "have-a-go") {
      res.status(400).json({
        success: false,
        message: "Have a Go participants cannot be removed from this screen.",
      });
      return;
    }

    if (participant.converted_to_member) {
      res.status(400).json({
        success: false,
        message: "Converted beginners cannot be removed from the course register.",
      });
      return;
    }

    const existingUser = await memberDirectoryGateway.findUserByUsername(participant.username);
    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );

    if (existingUser) {
      const saveResult = await memberPersistenceService.saveMemberProfile({
        username: existingUser.username,
        firstName: existingUser.first_name,
        surname: existingUser.surname,
        archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
        emailAddress: existingUser.email_address ?? "",
        rfidTag: existingUser.rfid_tag ?? "",
        activeMember: false,
        affiliateMember: Boolean(existingUser.affiliate_member),
        juniorMember: Boolean(existingUser.junior_member),
        membershipFeesDue: existingUser.membership_fees_due ?? "",
        coachingVolunteer: Boolean(existingUser.coaching_volunteer),
        userType: existingUser.user_type,
        membershipStatus: existingUser.membership_status,
        programmeType: existingUser.programme_type,
        disciplines: await memberDirectoryGateway.findDisciplinesByUsername(existingUser.username),
        loanBow: buildLoanBowRecord(
          await memberDirectoryGateway.findLoanBowByUsername(existingUser.username),
        ),
        existingUser,
      });

      if (!saveResult.success) {
        res.status(saveResult.status).json(saveResult);
        return;
      }
    }

    await beginnersCourseWriteGateway.deleteParticipant(participant.id);

    const [removedAtDate, removedAtTime] = getUtcTimestampParts();
    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "removed",
        actorUsername: actor.username,
        after: null,
        before: previousParticipant,
        changedAtDate: removedAtDate,
        changedAtTime: removedAtTime,
        entityId: String(participant.id),
        entityLabel: `${participant.first_name} ${participant.surname}`.trim(),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant removal audit event", auditError);
      });
    }

    broadcastBeginnersUpdated(courseType, "beginners.participant-delete");
    broadcastMembersUpdated("beginners.participant-delete", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === participant.course_id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-participants/:id/no-show", async (req, res) => {
    const actor = getActorUser(req);
    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Participant record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "taster-session"
            ? "You do not have permission to update Taster Session attendees."
            : "You do not have permission to update beginners.",
      });
      return;
    }

    if (courseType === "have-a-go") {
      res.status(400).json({
        success: false,
        message: "Have a Go attendees cannot be marked as no-shows from this screen.",
      });
      return;
    }

    const marked = Boolean(req.body?.marked);

    if (marked) {
      if (!hasScheduleEntryStarted(course.first_lesson_date, course.start_time)) {
        res.status(400).json({
          success: false,
          message: "No-show status can only be recorded once the session has started.",
        });
        return;
      }

      if (participant.converted_to_member) {
        res.status(400).json({
          success: false,
          message: "Converted members cannot be marked as no-shows.",
        });
        return;
      }

      if (await hasParticipantRecordedAttendance(participant)) {
        res.status(400).json({
          success: false,
          message: "Participants with recorded attendance cannot be marked as no-shows.",
        });
        return;
      }
    }

    const previousParticipant = await findBeginnersParticipantAuditSnapshot(participant.id, courseType);
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    await beginnersCourseWriteGateway.updateParticipantNoShow({
      noShowRecorded: marked,
      noShowRecordedAtDate: marked ? updatedAtDate : null,
      noShowRecordedAtTime: marked ? updatedAtTime : null,
      noShowRecordedByUsername: marked ? actor.username : null,
      participantId: participant.id,
    });

    const updatedParticipant = await findBeginnersParticipantAuditSnapshot(participant.id, courseType);

    if (auditChangeLogger && updatedParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedParticipant,
        before: previousParticipant,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(updatedParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}/no-show`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant no-show audit event", auditError);
      });
    }

    broadcastBeginnersUpdated(courseType, "beginners.participant-no-show");
    broadcastMembersUpdated("beginners.participant-no-show", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === participant.course_id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-participants/:id/reallocate", async (req, res) => {
    const actor = getActorUser(req);
    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Participant record not found.",
      });
      return;
    }

    const sourceCourse = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const sourceCourseType = normalizeCourseType(sourceCourse?.course_type);

    if (!actor || !canReallocateBeginnersCourseBooking(actor, sourceCourseType)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to reallocate beginner course bookings.",
      });
      return;
    }

    if (sourceCourseType === "have-a-go") {
      res.status(400).json({
        success: false,
        message: "Have a Go attendees cannot be reallocated from this screen.",
      });
      return;
    }

    if (!participant.no_show_recorded) {
      res.status(400).json({
        success: false,
        message: "Only participants marked as no-shows can be reallocated.",
      });
      return;
    }

    const targetCourseId = Number.parseInt(String(req.body?.targetCourseId ?? ""), 10);
    if (!Number.isInteger(targetCourseId)) {
      res.status(400).json({
        success: false,
        message: "Choose a later course to reallocate this booking onto.",
      });
      return;
    }

    if (Number(targetCourseId) === Number(participant.course_id)) {
      res.status(400).json({
        success: false,
        message: "Choose a different course for reallocation.",
      });
      return;
    }

    const targetCourse = await beginnersCourseReadGateway.findCourseById(targetCourseId);
    const targetCourseType = normalizeCourseType(targetCourse?.course_type);

    if (!targetCourse || targetCourseType !== sourceCourseType) {
      res.status(404).json({
        success: false,
        message: "Target course not found.",
      });
      return;
    }

    if (targetCourse.is_cancelled || targetCourse.approval_status !== "approved") {
      res.status(400).json({
        success: false,
        message: "Only approved future courses can accept reallocations.",
      });
      return;
    }

    if (hasScheduleEntryStarted(targetCourse.first_lesson_date, targetCourse.start_time)) {
      res.status(400).json({
        success: false,
        message: "Only future courses can accept reallocations.",
      });
      return;
    }

    if (
      (await beginnersCourseReadGateway.listParticipantsByCourseId(targetCourse.id)).length >=
      targetCourse.beginner_capacity
    ) {
      res.status(400).json({
        success: false,
        message: "This course is already full.",
      });
      return;
    }

    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      sourceCourseType,
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    await beginnersCourseWriteGateway.transferParticipantToCourse({
      courseId: targetCourse.id,
      participantId: participant.id,
    });

    const reallocatedParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      sourceCourseType,
    );

    if (auditChangeLogger && reallocatedParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: reallocatedParticipant,
        before: previousParticipant,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(reallocatedParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}/reallocate`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant reallocation audit event", auditError);
      });
    }

    broadcastBeginnersUpdated(sourceCourseType, "beginners.participant-reallocated");
    broadcastMembersUpdated("beginners.participant-reallocated", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(sourceCourseType)).find(
          (entry) => entry.id === targetCourse.id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-participants/:id/transfer-to-beginners-course", async (req, res) => {
    const actor = getActorUser(req);

    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Participant record not found.",
      });
      return;
    }

    const sourceCourse = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const sourceCourseType = normalizeCourseType(sourceCourse?.course_type);

    if (!actor || !actorHasPermission(actor, getCourseTypePermissions(sourceCourseType).manage)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to transfer taster participants.",
      });
      return;
    }

    if (sourceCourseType !== "taster-session") {
      res.status(400).json({
        success: false,
        message: "Only Taster Session participants can be transferred to a beginners course.",
      });
      return;
    }

    const targetCourseId = Number.parseInt(String(req.body?.targetCourseId ?? ""), 10);
    if (!Number.isInteger(targetCourseId)) {
      res.status(400).json({
        success: false,
        message: "Choose a beginners course to transfer this participant onto.",
      });
      return;
    }

    const targetCourse = await beginnersCourseReadGateway.findCourseById(targetCourseId);
    const targetCourseType = normalizeCourseType(targetCourse?.course_type);

    if (!targetCourse || targetCourseType !== "beginners") {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (targetCourse.is_cancelled) {
      res.status(400).json({
        success: false,
        message: "Cancelled beginners courses cannot accept transfers.",
      });
      return;
    }

    if (targetCourse.approval_status !== "approved") {
      res.status(400).json({
        success: false,
        message: "Approve the beginners course before transferring participants onto it.",
      });
      return;
    }

    if (hasScheduleEntryStarted(targetCourse.first_lesson_date, targetCourse.start_time)) {
      res.status(400).json({
        success: false,
        message:
          "Only future beginners courses can accept transfers from a Taster Session.",
      });
      return;
    }

    if (
      (await beginnersCourseReadGateway.listParticipantsByCourseId(targetCourse.id)).length >=
      targetCourse.beginner_capacity
    ) {
      res.status(400).json({
        success: false,
        message: "This beginners course is already full.",
      });
      return;
    }

    const existingUser = await memberDirectoryGateway.findUserByUsername(participant.username);
    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "The participant account could not be found.",
      });
      return;
    }

    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      sourceCourseType,
    );
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

    const saveUserResult = await memberPersistenceService.saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
      emailAddress: existingUser.email_address ?? "",
      password: null,
      rfidTag: existingUser.rfid_tag ?? "",
      activeMember: Boolean(existingUser.active_member),
      affiliateMember: Boolean(existingUser.affiliate_member),
      juniorMember: Boolean(existingUser.junior_member),
      membershipFeesDue: existingUser.membership_fees_due ?? "",
      coachingVolunteer: Boolean(existingUser.coaching_volunteer),
      userType: getCourseParticipantUserType("beginners"),
      membershipStatus: getCourseParticipantMembershipStatus(),
      programmeType: getCourseParticipantProgrammeType("beginners"),
      disciplines: (
        await memberDirectoryGateway.findDisciplinesByUsername(existingUser.username)
      ).map((entry) => entry.discipline),
      loanBow: buildLoanBowRecord(
        await memberDirectoryGateway.findLoanBowByUsername(existingUser.username),
      ),
      existingUser,
    });

    if (!saveUserResult.success) {
      res.status(saveUserResult.status).json(saveUserResult);
      return;
    }

    await beginnersCourseWriteGateway.transferParticipantToCourse({
      courseId: targetCourse.id,
      participantId: participant.id,
      originCourseId: sourceCourse.id,
    });

    const transferredParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      "beginners",
    );

    if (auditChangeLogger && transferredParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: transferredParticipant,
        before: previousParticipant,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(transferredParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}/transfer-to-beginners-course`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant transfer audit event", auditError);
      });
    }

    broadcastBeginnersUpdated(sourceCourseType, "beginners.participant-transfer");
    broadcastBeginnersUpdated("beginners", "beginners.participant-transfer");
    broadcastMembersUpdated("beginners.participant-transfer", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard("beginners")).find(
          (entry) => entry.id === targetCourse.id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-participants/:id/convert", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to convert beginners into members.",
      });
      return;
    }

    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Beginner record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);

    if (!course) {
      res.status(404).json({
        success: false,
        message: "Beginners course not found.",
      });
      return;
    }

    if (normalizeCourseType(course.course_type) !== "beginners") {
      res.status(400).json({
        success: false,
        message: "Only beginners course participants can be converted to members.",
      });
      return;
    }

    const canConvert = actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS) ||
      (actorHasPermission(actor, PERMISSIONS.MANAGE_BEGINNERS_COURSES) &&
        String(course.coordinator_username).toLowerCase() === String(actor.username).toLowerCase());
    if (!canConvert) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to convert beginners into members.",
      });
      return;
    }

    if (!(await hasBeginnersCourseCompleted(course))) {
      res.status(400).json({
        success: false,
        message: "Beginners can only be converted after the course has completed.",
      });
      return;
    }

    const expectedReturnDate = req.body?.expectedReturnDate;
    const dateError = validateBeginnerConversionDate(participant.assigned_case_id, expectedReturnDate);
    if (dateError) {
      res.status(400).json({ success: false, message: dateError });
      return;
    }

    const existingUser = await memberDirectoryGateway.findUserByUsername(
      participant.username,
    );

    if (!existingUser) {
      res.status(404).json({
        success: false,
        message: "The linked beginner user could not be found.",
      });
      return;
    }

    const needsMembershipUpdate = LEGACY_NON_MEMBER_ROLE_KEYS.has(
      String(existingUser.user_type ?? "").trim().toLowerCase(),
    );
    const saveMembership = async (transactionClient) => {
      if (!needsMembershipUpdate) return { success: true };
      return memberPersistenceService.saveMemberProfile({
        username: existingUser.username,
        firstName: existingUser.first_name,
        surname: existingUser.surname,
        archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
        rfidTag: existingUser.rfid_tag ?? "",
        activeMember: Boolean(existingUser.active_member),
        affiliateMember: Boolean(existingUser.affiliate_member),
        juniorMember: Boolean(existingUser.junior_member),
        membershipFeesDue: existingUser.membership_fees_due ?? "",
        coachingVolunteer: Boolean(existingUser.coaching_volunteer),
        userType: "general",
        membershipStatus: "member",
        programmeType: "none",
        disciplines: (
          await memberDirectoryGateway.findDisciplinesByUsername(
            existingUser.username,
          )
        ).map((entry) => entry.discipline),
        loanBow: buildLoanBowRecord(
          await memberDirectoryGateway.findLoanBowByUsername(
            existingUser.username,
          ),
        ),
        existingUser,
        transactionClient,
      });
    };

    const courseType = normalizeCourseType(course.course_type);
    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );
    const [convertedAtDate, convertedAtTime] = getUtcTimestampParts();

    try {
      await runBeginnerConversion({
        inTransaction: (operation) => withBeginnerConversionTransaction(
          { databaseEngine: serverRuntime.databaseEngine, db }, operation,
        ),
        prepareCase: participant.assigned_case_id ? async (client) => {
          if (client) {
            // Serialize conversions of the same case before checking for open loans.
            await client.query("SELECT id FROM equipment_items WHERE id = $1 FOR UPDATE", [participant.assigned_case_id]);
          }
          const scopedEquipmentGateway = client
            ? createEquipmentGateway({ databaseEngine: "postgres", pool: client })
            : equipmentGateway;
          const prepared = await validateAssignedCaseForBeginnerConversion({
            caseId: participant.assigned_case_id,
            equipmentGateway: scopedEquipmentGateway,
            caseEquipmentType: EQUIPMENT_TYPES.CASE,
            memberLocationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
            memberUsername: existingUser.username,
          });
          return { ...prepared, scopedEquipmentGateway };
        } : null,
        saveMembership,
        loanCase: async (preparedCase) => loanAssignedCaseForBeginnerConversion({
          caseId: participant.assigned_case_id,
          equipmentGateway: preparedCase.scopedEquipmentGateway,
          caseEquipmentType: EQUIPMENT_TYPES.CASE,
          memberLocationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
          memberUsername: existingUser.username,
          actorUsername: actor.username,
          convertedAtDate,
          convertedAtTime,
          expectedReturnDate,
          preparedCase,
        }),
        markParticipant: async (client) => {
          const payload = {
            actorUsername: actor.username, convertedAtDate, convertedAtTime,
            participantId: participant.id,
          };
          if (client) {
            await client.query(`UPDATE beginners_course_participants SET
              converted_to_member = 1, converted_at_date = $1,
              converted_at_time = $2, converted_by_username = $3 WHERE id = $4`,
            [convertedAtDate, convertedAtTime, actor.username, participant.id]);
          } else {
            await beginnersCourseWriteGateway.markParticipantConverted(payload);
          }
        },
      });
    } catch (error) {
      if (error instanceof BeginnerConversionFailure) {
        res.status(error.response.status).json(error.response);
        return;
      }
      res.status(participant.assigned_case_id ? 400 : 500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to convert the beginner with the assigned case.",
      });
      return;
    }
    const convertedParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );

    if (auditChangeLogger && convertedParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "converted",
        actorUsername: actor.username,
        after: convertedParticipant,
        before: previousParticipant,
        changedAtDate: convertedAtDate,
        changedAtTime: convertedAtTime,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(convertedParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}/convert`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.participant-convert");
    broadcastMembersUpdated("beginners.participant-convert", participant.username);

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === participant.course_id,
        ) ?? null,
    });
  });

  async function releaseCourseEquipment(req, res, { bulk }) {
    if (serverRuntime?.sync?.isLocalPiNode) return res.status(503).json({ success: false, message: "Course equipment changes are unavailable on the Pi." });
    const actor = getActorUser(req);
    const participant = bulk ? null : await beginnersCourseReadGateway.findParticipantById(req.params.id);
    const courseId = bulk ? Number(req.params.id) : Number(participant?.course_id);
    const course = Number.isSafeInteger(courseId) ? await beginnersCourseReadGateway.findCourseById(courseId) : null;
    if (!course || (!bulk && !participant)) return res.status(404).json({ success: false, message: "Course or participant not found." });
    const courseType = normalizeCourseType(course.course_type);
    if (courseType !== "beginners") return res.status(400).json({ success: false, message: "Equipment release is for beginners courses." });
    const authorised = actor && (actorHasPermission(actor, getCourseTypePermissions(courseType).manage) ||
      actorHasPermission(actor, PERMISSIONS.ASSIGN_EQUIPMENT) || actorHasPermission(actor, PERMISSIONS.RETURN_EQUIPMENT));
    if (!authorised) return res.status(403).json({ success: false, message: "You do not have permission to release course equipment." });
    if (req.body?.confirmed !== true) return res.status(400).json({ success: false, message: "Confirm the equipment has been physically returned and is available." });
    const returnActiveLoans = req.body?.returnActiveLoans === true;
    if (returnActiveLoans && (bulk || !actorHasPermission(actor, PERMISSIONS.RETURN_EQUIPMENT))) {
      return res.status(403).json({ success: false, message: "Only an equipment return manager can record and release an active loan individually." });
    }
    if (returnActiveLoans && req.body?.loansConfirmed !== true) {
      return res.status(400).json({ success: false, message: "Confirm the outstanding loaned equipment is physically back before recording its return." });
    }
    const returnedOn = req.body?.returnedOn ?? getClubTodayDate();
    const parsedReturnDate = typeof returnedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(returnedOn)
      ? new Date(`${returnedOn}T00:00:00Z`) : null;
    if (!parsedReturnDate || Number.isNaN(parsedReturnDate.getTime()) ||
      parsedReturnDate.toISOString().slice(0, 10) !== returnedOn || returnedOn > getClubTodayDate()) {
      return res.status(400).json({ success: false, message: "Choose a valid physical return date no later than today." });
    }
    if (bulk && (course.is_cancelled || course.approval_status !== "approved" || !(await hasBeginnersCourseCompleted(course)))) {
      return res.status(409).json({ success: false, message: "Bulk release is available only after an approved beginners course has finished." });
    }
    const reservations = bulk ? req.body?.reservations : [{ participantId: participant.id, caseId: req.body?.caseId }];
    if (!Array.isArray(reservations) || !reservations.length || reservations.length > 500 ||
      reservations.some((row) => !Number.isSafeInteger(Number(row.participantId)) || Number(row.participantId) < 1 ||
        !Number.isSafeInteger(Number(row.caseId)) || Number(row.caseId) < 1) ||
      new Set(reservations.map((row) => Number(row.participantId))).size !== reservations.length) {
      return res.status(400).json({ success: false, message: "Choose valid case reservations to release." });
    }
    const expected = reservations.map((row) => ({ participantId: Number(row.participantId), caseId: Number(row.caseId) }));
    const before = new Map();
    for (const row of expected) before.set(row.participantId, await findBeginnersParticipantAuditSnapshot(row.participantId, courseType));
    const [date, time] = getUtcTimestampParts();
    let released;
    try {
      released = await beginnersCourseWriteGateway.releaseParticipantCases({
        actorUsername: actor.username, courseId, reservations: expected,
        returnActiveLoans, returnedOn, returnedAtTime: time,
      });
    } catch (error) {
      const message = error instanceof Error && !/SQL|database|syntax|relation|constraint|connection/i.test(error.message)
        ? error.message : "Equipment could not be released. Refresh the course and try again.";
      return res.status(409).json({ success: false, message });
    }
    for (const row of released) {
      if (!auditChangeLogger) continue;
      const after = await findBeginnersParticipantAuditSnapshot(row.participantId, courseType);
      try {
        await auditChangeLogger.recordEntityChange({
          action: "case_released", actorUsername: actor.username, before: before.get(row.participantId),
          after: { ...(after ?? {}), equipmentReturnedOn: returnedOn },
          changedAtDate: date, changedAtTime: time, entityId: String(row.participantId),
          entityLabel: `${buildBeginnersParticipantAuditLabel(after ?? before.get(row.participantId))} · course ${courseId} · case ${row.caseId} · returned ${returnedOn}`,
          entityType: "beginners_participant", req,
          target: bulk ? `/api/beginners-courses/${courseId}/release-equipment` : `/api/beginners-course-participants/${row.participantId}/release-equipment`,
        });
      } catch (auditError) { console.error("Failed to record course equipment release audit event", auditError); }
      for (const loan of row.returnedLoans ?? []) {
        try {
          await auditChangeLogger.recordEntityChange({
            action: "returned", actorUsername: actor.username, changedAtDate: date, changedAtTime: time,
            before: { loanId: loan.loanId, memberUsername: loan.memberUsername, status: "on-loan" },
            after: { loanId: loan.loanId, memberUsername: loan.memberUsername, status: "in-case", returnedOn },
            entityId: String(loan.itemId), entityLabel: `${loan.itemNumber || `Item ${loan.itemId}`} · case ${row.caseId}`,
            entityType: "equipment_item", req,
            target: `/api/beginners-course-participants/${row.participantId}/release-equipment`,
          });
        } catch (auditError) { console.error("Failed to record overridden course equipment loan return audit event", auditError); }
      }
    }
    if (released.length) {
      broadcastBeginnersUpdated(courseType, "beginners.case-release");
      broadcastEquipmentUpdated("beginners.case-release");
    }
    return res.json({ success: true, releasedCount: released.length,
      returnedLoanCount: released.reduce((count, row) => count + (row.returnedLoans?.length ?? 0), 0),
      course: (await buildBeginnersCourseDashboard(courseType)).find((entry) => Number(entry.id) === courseId) ?? null });
  }

  app.post("/api/beginners-course-participants/:id/release-equipment", (req, res) => releaseCourseEquipment(req, res, { bulk: false }));
  app.post("/api/beginners-courses/:id/release-equipment", (req, res) => releaseCourseEquipment(req, res, { bulk: true }));

  app.post("/api/beginners-course-participants/:id/assign-case", async (req, res) => {
    const actor = getActorUser(req);

    const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

    if (!participant) {
      res.status(404).json({
        success: false,
        message: "Beginner record not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to assign Have a Go equipment."
            : "You do not have permission to assign course equipment.",
      });
      return;
    }

    if (actor.username === participant.username) {
      res.status(400).json({
        success: false,
        message: "The staff member assigning equipment cannot be the borrowing beginner.",
      });
      return;
    }

    const nextCaseId =
      req.body?.caseId === "" || req.body?.caseId == null
        ? null
        : Number.parseInt(req.body.caseId, 10);
    if (participant.assigned_case_id != null && Number(participant.assigned_case_id) !== nextCaseId) {
      return res.status(409).json({ success: false, message: "Release the current case and confirm its physical return before changing the assignment." });
    }
    const nextCase = nextCaseId
      ? await equipmentGateway.findEquipmentItemById(nextCaseId)
      : null;
    const [date, time] = getUtcTimestampParts();

    if (nextCase) {
      if (nextCase.equipment_type !== EQUIPMENT_TYPES.CASE || nextCase.status !== "active") {
        res.status(400).json({
          success: false,
          message: "Choose a valid active case.",
        });
        return;
      }

      if (
        nextCase.location_type === EQUIPMENT_LOCATION_TYPES.MEMBER &&
        nextCase.location_member_username &&
        nextCase.location_member_username !== participant.username
      ) {
        res.status(400).json({
          success: false,
          message: "That case is already assigned to another member.",
        });
        return;
      }

      if (
        await equipmentGateway.findOpenEquipmentLoanByItemId(nextCase.id) &&
        nextCase.location_member_username !== participant.username
      ) {
        res.status(400).json({
          success: false,
          message: "That case is already on loan.",
        });
        return;
      }
    }

    const previousParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );
    try {
      if (nextCase) {
        await equipmentGateway.updateEquipmentAssignmentMetadata({
          id: nextCase.id,
          assignedByUsername: actor.username,
          assignedAtDate: date,
          assignedAtTime: time,
        });
      }

      await beginnersCourseWriteGateway.updateParticipantCase({
        actorUsername: actor.username,
        assignedAtDate: date,
        assignedAtTime: time,
        assignedCaseId: nextCase?.id ?? null,
        participantId: participant.id,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : "Unable to assign course equipment.",
      });
      return;
    }
    const updatedParticipant = await findBeginnersParticipantAuditSnapshot(
      participant.id,
      courseType,
    );

    if (auditChangeLogger && updatedParticipant) {
      void auditChangeLogger.recordEntityChange({
        action: "case_assigned",
        actorUsername: actor.username,
        after: updatedParticipant,
        before: previousParticipant,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(participant.id),
        entityLabel: buildBeginnersParticipantAuditLabel(updatedParticipant),
        entityType: "beginners_participant",
        req,
        target: `/api/beginners-course-participants/${participant.id}/assign-case`,
      }).catch((auditError) => {
        console.error("Failed to record beginners participant audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.case-assign");
    broadcastEquipmentUpdated("beginners.case-assign");

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === participant.course_id,
        ) ?? null,
    });
  });

  app.post("/api/beginners-course-lessons/:id/coaches", async (req, res) => {
    const actor = getActorUser(req);

    const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);

    if (!lesson) {
      res.status(404).json({
        success: false,
        message: "Beginners lesson not found.",
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
    const courseType = normalizeCourseType(course?.course_type);
    const coursePermissions = getCourseTypePermissions(courseType);

    if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
      res.status(403).json({
        success: false,
        message:
          courseType === "have-a-go"
            ? "You do not have permission to assign coaches to Have a Go sessions."
            : "You do not have permission to assign coaches to beginners lessons.",
      });
      return;
    }

    if (lesson.is_cancelled || course?.is_cancelled) {
      return res.status(409).json({ success: false, message: "Coaches cannot be assigned to a cancelled session date." });
    }

    const coachUsernames = Array.isArray(req.body?.coachUsernames)
      ? [...new Set(req.body.coachUsernames.filter((value) => typeof value === "string"))]
      : [];
    const coaches = await Promise.all(
      coachUsernames.map((username) => memberDirectoryGateway.findUserByUsername(username)),
    );
    const invalidCoach = coachUsernames.find((username, index) => {
      const coach = coaches[index];
      return !coach || !isBeginnersCourseCoachEligible(coach);
    });

    if (invalidCoach) {
      res.status(400).json({
        success: false,
        message: "One or more selected coaches are not eligible for beginners lessons.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();
    const previousLesson = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);
    await beginnersCourseWriteGateway.replaceLessonCoaches({
      actorUsername: actor.username,
      assignedAtDate: date,
      assignedAtTime: time,
      coachUsernames,
      lessonId: lesson.id,
    });
    const updatedLesson = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);

    if (auditChangeLogger && updatedLesson) {
      void auditChangeLogger.recordEntityChange({
        action: "coaches_assigned",
        actorUsername: actor.username,
        after: updatedLesson,
        before: previousLesson,
        changedAtDate: date,
        changedAtTime: time,
        entityId: String(lesson.id),
        entityLabel: buildBeginnersLessonAuditLabel(updatedLesson),
        entityType: "beginners_lesson",
        req,
        target: `/api/beginners-course-lessons/${lesson.id}/coaches`,
      }).catch((auditError) => {
        console.error("Failed to record beginners lesson audit event", auditError);
      });
    }
    broadcastBeginnersUpdated(courseType, "beginners.lesson-coaches");

    res.json({
      success: true,
      course:
        (await buildBeginnersCourseDashboard(courseType)).find(
          (entry) => entry.id === lesson.course_id,
        ) ?? null,
    });
  });

  app.get("/api/my-beginner-dashboard", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const participant = await beginnersCourseReadGateway.findParticipantByUsername(
      actor.username,
    );

    if (!participant) {
      res.json({
        success: true,
        dashboard: null,
      });
      return;
    }

    const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
    if (
      !course ||
      course.is_cancelled ||
      (course.approval_status ?? "pending") !== "approved"
    ) {
      res.json({
        success: true,
        dashboard: null,
      });
      return;
    }
    const today = toUtcDateString(new Date());
    const lessons = await beginnersCourseReadGateway.listLessonsByCourseId(course.id);
    const todayLesson = lessons.find((lesson) => !lesson.is_cancelled && lesson.lesson_date === today) ?? null;
    const coaches = todayLesson
      ? (await beginnersCourseReadGateway.listLessonCoachesByLessonId(todayLesson.id)).map((row) => ({
          username: row.coach_username,
          fullName: `${row.first_name} ${row.surname}`.trim(),
        }))
      : [];
    const equipment = (await equipmentGateway
      .listOpenEquipmentLoansByMemberUserId(actor.username))
      .map((loan) => ({
        id: loan.id,
        equipmentType: loan.equipment_type,
        typeLabel: EQUIPMENT_TYPE_LABELS[loan.equipment_type] ?? loan.equipment_type,
        reference:
          loan.equipment_type === EQUIPMENT_TYPES.ARROWS
            ? `${loan.arrow_quantity} x ${loan.arrow_length}"`
            : loan.item_number ?? "",
        expectedReturnDate: loan.expected_return_date ?? null,
      }))
      .sort((left, right) => {
        const leftIsCase = left.equipmentType === EQUIPMENT_TYPES.CASE;
        const rightIsCase = right.equipmentType === EQUIPMENT_TYPES.CASE;

        if (leftIsCase !== rightIsCase) {
          return leftIsCase ? -1 : 1;
        }

        return left.typeLabel.localeCompare(right.typeLabel);
      })
      .map((item) => ({
        id: item.id,
        typeLabel: item.typeLabel,
        reference: item.reference,
        expectedReturnDate: item.expectedReturnDate,
      }));

    res.json({
      success: true,
      dashboard: {
        courseId: course.id,
        firstLessonDate: course.first_lesson_date,
        lessonToday: todayLesson
          ? {
              id: todayLesson.id,
              lessonNumber: todayLesson.lesson_number,
              date: todayLesson.lesson_date,
              startTime: todayLesson.start_time,
              endTime: todayLesson.end_time,
            }
          : null,
        coaches,
        equipment,
        showSafetyMessage: today === course.first_lesson_date,
      },
    });
  });

}
