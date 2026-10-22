export function createBeginnerCourseViews({
  LEGACY_NON_MEMBER_ROLE_KEYS,
  beginnersCourseReadGateway,
  getUserDisplayName,
  groupRowsBy,
  manualLessonAttendanceGateway,
  normalizeCourseType,
}) {
  async function buildBeginnersCourseDashboard(courseType = "beginners") {
    const normalizedCourseType = normalizeCourseType(courseType);
    const [allCourses, allLessons, allParticipants, allLoginDates, allLessonCoaches, manualAttendance] =
      await Promise.all([
        beginnersCourseReadGateway.listCourses(),
        beginnersCourseReadGateway.listLessons(),
        beginnersCourseReadGateway.listParticipants(),
        beginnersCourseReadGateway.listParticipantLoginDates(),
        beginnersCourseReadGateway.listLessonCoaches(),
        manualLessonAttendanceGateway.listAll(),
      ]);
    const courses = allCourses.filter(
      (course) => normalizeCourseType(course.course_type) === normalizedCourseType,
    );
    const lessonsByCourseId = groupRowsBy(
      allLessons,
      (lesson) => lesson.course_id,
    );
    const participantsByCourseId = groupRowsBy(
      allParticipants,
      (participant) => participant.course_id,
    );
    const loginDatesByCourseParticipant = groupRowsBy(
      allLoginDates,
      (row) => `${row.course_id}:${row.username}`,
      (row) => row.logged_in_date,
    );
    const manualDatesByCourseParticipant = groupRowsBy(
      manualAttendance,
      (row) => `${row.course_id}:${row.username}`,
      (row) => row.lesson_date,
    );
    const manualLessonIdsByParticipant = groupRowsBy(
      manualAttendance,
      (row) => `${row.course_id}:${row.username}`,
      (row) => Number(row.lesson_id),
    );
    const coachesByLessonId = groupRowsBy(
      allLessonCoaches,
      (row) => row.lesson_id,
      (row) => ({
        username: row.coach_username,
        fullName: `${row.first_name} ${row.surname}`.trim(),
      }),
    );

    return courses.map((course) => {
      const lessons = (lessonsByCourseId.get(course.id) ?? []).map((lesson) => {
        const coaches = coachesByLessonId.get(lesson.id) ?? [];
        const requiredCoachCount = Number(lesson.required_coach_count ?? 1);
        const isCancelled = Boolean(course.is_cancelled || lesson.is_cancelled);
        return {
          id: lesson.id,
          lessonNumber: lesson.lesson_number,
          date: lesson.lesson_date,
          startTime: lesson.start_time,
          endTime: lesson.end_time,
          isCancelled: Boolean(lesson.is_cancelled),
          coaches,
          requiredCoachCount,
          assignedCoachCount: coaches.length,
          coachShortfall: isCancelled ? 0 : Math.max(requiredCoachCount - coaches.length, 0),
          isFullyCovered: isCancelled || coaches.length >= requiredCoachCount,
        };
      });
      const beginners = (participantsByCourseId.get(course.id) ?? []).map((participant) => ({
        id: participant.id,
        username: participant.username,
        passwordSet: Boolean(participant.password_set),
        userType: participant.participant_user_type,
        firstName: participant.first_name,
        surname: participant.surname,
        fullName: `${participant.first_name} ${participant.surname}`.trim(),
        sizeCategory: participant.beginner_size_category,
        heightText: participant.height_text ?? "",
        drawLength: participant.draw_length ?? "",
        handedness: participant.handedness ?? "",
        eyeDominance: participant.eye_dominance ?? "",
        initialEmailSent: Boolean(participant.initial_email_sent),
        thirtyDayReminderSent: Boolean(participant.thirty_day_reminder_sent),
        courseFeePaid: Boolean(participant.course_fee_paid),
        noShowRecorded: Boolean(participant.no_show_recorded),
        noShowRecordedAt: participant.no_show_recorded_at_date
          ? `${participant.no_show_recorded_at_date} ${participant.no_show_recorded_at_time ?? ""}`.trim()
          : "",
        noShowRecordedByUsername: participant.no_show_recorded_by_username ?? "",
        attendanceDates: [
          ...new Set([
            ...(loginDatesByCourseParticipant.get(`${participant.course_id}:${participant.username}`) ?? []),
            ...(manualDatesByCourseParticipant.get(`${participant.course_id}:${participant.username}`) ?? []),
          ]),
        ],
        manualAttendanceLessonIds: manualLessonIdsByParticipant.get(`${participant.course_id}:${participant.username}`) ?? [],
        attendedLessonIds: lessons.filter((lesson) =>
          (loginDatesByCourseParticipant.get(`${participant.course_id}:${participant.username}`) ?? []).includes(lesson.date) ||
          (manualLessonIdsByParticipant.get(`${participant.course_id}:${participant.username}`) ?? []).includes(Number(lesson.id)),
        ).map((lesson) => Number(lesson.id)),
        convertedToMember:
          Boolean(participant.converted_to_member) ||
          !LEGACY_NON_MEMBER_ROLE_KEYS.has(
            String(participant.participant_user_type ?? "").trim().toLowerCase(),
          ),
        assignedCaseId: participant.assigned_case_id ?? null,
        assignedCaseNumber: participant.assigned_case_number ?? "",
      }));
      const historicalAttendees = normalizedCourseType === "taster-session"
        ? allParticipants
          .filter((participant) =>
            Number(participant.origin_course_id) === Number(course.id) &&
            Number(participant.course_id) !== Number(course.id))
          .map((participant) => ({
            id: participant.id,
            username: participant.username,
            fullName: `${participant.first_name} ${participant.surname}`.trim(),
            sizeCategory: participant.beginner_size_category,
            heightText: participant.height_text ?? "",
            drawLength: participant.draw_length ?? "",
            handedness: participant.handedness ?? "",
            eyeDominance: participant.eye_dominance ?? "",
            courseFeePaid: Boolean(participant.course_fee_paid),
            attendanceDates: [...new Set(
              loginDatesByCourseParticipant.get(`${participant.course_id}:${participant.username}`) ?? [],
            )].filter((date) => lessons.some((lesson) => lesson.date === date)),
            transferredToCourse: allCourses.find((entry) =>
              Number(entry.id) === Number(participant.course_id))?.first_lesson_date ?? "",
          }))
        : [];

      return {
        id: course.id,
        coordinatorUsername: course.coordinator_username,
        coordinatorName: getUserDisplayName(course, "coordinator_first_name", "coordinator_surname"),
        submittedByUsername: course.submitted_by_username,
        submittedByName: getUserDisplayName(course, "submitted_by_first_name", "submitted_by_surname"),
        approvedByUsername: course.approved_by_username ?? "",
        approvedByName: getUserDisplayName(course, "approved_by_first_name", "approved_by_surname"),
        firstLessonDate: course.first_lesson_date,
        startTime: course.start_time,
        endTime: course.end_time,
        lessonCount: course.lesson_count,
        beginnerCapacity: course.beginner_capacity,
        approvalStatus: course.approval_status,
        isCancelled: Boolean(course.is_cancelled),
        cancellationReason: course.cancellation_reason ?? "",
        rejectionReason: course.rejection_reason ?? "",
        createdAt: `${course.created_at_date} ${course.created_at_time}`.trim(),
        approvedAt: course.approved_at_date
          ? `${course.approved_at_date} ${course.approved_at_time}`.trim()
          : "",
        lessons,
        beginners,
        historicalAttendees,
        placesRemaining: Math.max(course.beginner_capacity - beginners.length, 0),
      };
    });
  }

  async function buildBeginnersCourseCalendarLessons(courseType = null) {
    const requestedCourseType =
      typeof courseType === "string" ? normalizeCourseType(courseType) : null;
    const [allCourses, allLessons, allParticipants, allLessonCoaches] =
      await Promise.all([
        beginnersCourseReadGateway.listCourses(),
        beginnersCourseReadGateway.listLessons(),
        beginnersCourseReadGateway.listParticipants(),
        beginnersCourseReadGateway.listLessonCoaches(),
      ]);
    const approvedCourses = allCourses.filter(
      (course) =>
        (!requestedCourseType ||
          normalizeCourseType(course.course_type) === requestedCourseType) &&
        (course.approval_status ?? "pending") === "approved",
    );
    const lessonsByCourseId = groupRowsBy(
      allLessons,
      (lesson) => lesson.course_id,
    );
    const participantsByCourseId = groupRowsBy(
      allParticipants,
      (participant) => participant.course_id,
    );
    const coachesByLessonId = groupRowsBy(
      allLessonCoaches,
      (row) => row.lesson_id,
      (row) => `${row.first_name} ${row.surname}`.trim(),
    );

    return approvedCourses
      .flatMap((course) => {
        const normalizedCourseType = normalizeCourseType(course.course_type);
        const participantCount = (participantsByCourseId.get(course.id) ?? []).length;
        const title =
          normalizedCourseType === "have-a-go"
            ? "Have a Go session"
            : normalizedCourseType === "taster-session"
              ? "Taster session"
              : "Beginners course";

        return (lessonsByCourseId.get(course.id) ?? []).map((lesson) => ({
          id: `${normalizedCourseType}-course-${course.id}-lesson-${lesson.id}`,
          courseId: course.id,
          lessonId: lesson.id,
          courseType: normalizedCourseType,
          title,
          date: lesson.lesson_date,
          startTime: lesson.start_time,
          endTime: lesson.end_time,
          lessonNumber: lesson.lesson_number,
          requiredCoachCount: Number(lesson.required_coach_count ?? 1),
          assignedCoachCount: (coachesByLessonId.get(lesson.id) ?? []).length,
          coachShortfall: course.is_cancelled || lesson.is_cancelled ? 0 : Math.max(Number(lesson.required_coach_count ?? 1) - (coachesByLessonId.get(lesson.id) ?? []).length, 0),
          isFullyCovered: course.is_cancelled || lesson.is_cancelled || (coachesByLessonId.get(lesson.id) ?? []).length >= Number(lesson.required_coach_count ?? 1),
          coordinatorName: getUserDisplayName(
            course,
            "coordinator_first_name",
            "coordinator_surname",
          ),
          coachNames: coachesByLessonId.get(lesson.id) ?? [],
          beginnerCount: participantCount,
          participantCount,
          beginnerCapacity: course.beginner_capacity,
          participantCapacity: course.beginner_capacity,
          placesRemaining: Math.max(course.beginner_capacity - participantCount, 0),
          isCancelled: Boolean(course.is_cancelled || lesson.is_cancelled),
          cancellationReason: course.cancellation_reason ?? "",
        }));
      })
      .sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        return byDate !== 0
          ? byDate
          : left.startTime.localeCompare(right.startTime);
      });
  }

    return { buildBeginnersCourseDashboard, buildBeginnersCourseCalendarLessons };
}
