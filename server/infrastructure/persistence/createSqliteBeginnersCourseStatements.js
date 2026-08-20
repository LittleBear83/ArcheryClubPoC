export function createSqliteBeginnersCourseStatements(db) {
  const listBeginnersCourses = db.prepare(`
    SELECT
      beginners_courses.*,
      coordinator.first_name AS coordinator_first_name,
      coordinator.surname AS coordinator_surname,
      submitted_by.first_name AS submitted_by_first_name,
      submitted_by.surname AS submitted_by_surname,
      approved_by.first_name AS approved_by_first_name,
      approved_by.surname AS approved_by_surname
    FROM beginners_courses
    INNER JOIN users AS coordinator
      ON (
        (
          beginners_courses.coordinator_user_id IS NOT NULL AND
          coordinator.id = beginners_courses.coordinator_user_id
        ) OR (
          beginners_courses.coordinator_user_id IS NULL AND
          LOWER(coordinator.username) = LOWER(beginners_courses.coordinator_username)
        )
      )
    INNER JOIN users AS submitted_by
      ON (
        (
          beginners_courses.submitted_by_user_id IS NOT NULL AND
          submitted_by.id = beginners_courses.submitted_by_user_id
        ) OR (
          beginners_courses.submitted_by_user_id IS NULL AND
          LOWER(submitted_by.username) = LOWER(beginners_courses.submitted_by_username)
        )
      )
    LEFT JOIN users AS approved_by
      ON (
        (
          beginners_courses.approved_by_user_id IS NOT NULL AND
          approved_by.id = beginners_courses.approved_by_user_id
        ) OR (
          beginners_courses.approved_by_user_id IS NULL AND
          beginners_courses.approved_by_username IS NOT NULL AND
          LOWER(approved_by.username) = LOWER(beginners_courses.approved_by_username)
        )
      )
    ORDER BY beginners_courses.first_lesson_date ASC, beginners_courses.start_time ASC, beginners_courses.id ASC
  `);

  const findBeginnersCourseById = db.prepare(`
    SELECT *
    FROM beginners_courses
    WHERE id = ?
  `);

  const insertBeginnersCourse = db.prepare(`
    INSERT INTO beginners_courses (
      course_type,
      coordinator_username,
      submitted_by_username,
      first_lesson_date,
      start_time,
      end_time,
      lesson_count,
      beginner_capacity,
      approval_status,
      rejection_reason,
      approved_by_username,
      approved_at_date,
      approved_at_time,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateBeginnersCourseApproval = db.prepare(`
    UPDATE beginners_courses
    SET
      approval_status = ?,
      rejection_reason = ?,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  const updateBeginnersCourseSchedule = db.prepare(`
    UPDATE beginners_courses
    SET
      first_lesson_date = ?,
      start_time = ?,
      end_time = ?,
      approval_status = ?,
      rejection_reason = ?,
      approved_by_username = ?,
      approved_at_date = ?,
      approved_at_time = ?
    WHERE id = ?
  `);

  const cancelBeginnersCourse = db.prepare(`
    UPDATE beginners_courses
    SET
      is_cancelled = 1,
      cancellation_reason = ?,
      cancelled_by_username = ?,
      cancelled_at_date = ?,
      cancelled_at_time = ?
    WHERE id = ?
  `);

  const listBeginnersCourseLessons = db.prepare(`
    SELECT
      beginners_course_lessons.*
    FROM beginners_course_lessons
    ORDER BY beginners_course_lessons.lesson_date ASC, beginners_course_lessons.start_time ASC, beginners_course_lessons.lesson_number ASC
  `);

  const listBeginnersCourseLessonsByCourseId = db.prepare(`
    SELECT *
    FROM beginners_course_lessons
    WHERE course_id = ?
    ORDER BY lesson_number ASC
  `);

  const findBeginnersCourseLessonById = db.prepare(`
    SELECT *
    FROM beginners_course_lessons
    WHERE id = ?
  `);

  const insertBeginnersCourseLesson = db.prepare(`
    INSERT INTO beginners_course_lessons (
      course_id,
      lesson_number,
      lesson_date,
      start_time,
      end_time
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateBeginnersCourseLessonSchedule = db.prepare(`
    UPDATE beginners_course_lessons
    SET
      lesson_date = ?,
      start_time = ?,
      end_time = ?
    WHERE course_id = ? AND lesson_number = ?
  `);

  const listBeginnersCourseParticipants = db.prepare(`
    SELECT
      beginners_course_participants.*,
      users.password IS NOT NULL AND users.password <> '' AS password_set,
      user_types.user_type AS participant_user_type,
      case_item.item_number AS assigned_case_number
    FROM beginners_course_participants
    INNER JOIN users
      ON users.id = beginners_course_participants.user_id
    INNER JOIN user_types
      ON user_types.user_id = users.id
    LEFT JOIN equipment_items AS case_item
      ON case_item.id = beginners_course_participants.assigned_case_id
    ORDER BY beginners_course_participants.course_id ASC, beginners_course_participants.surname ASC, beginners_course_participants.first_name ASC
  `);

  const listBeginnersCourseParticipantsByCourseId = db.prepare(`
    SELECT
      beginners_course_participants.*,
      users.password IS NOT NULL AND users.password <> '' AS password_set,
      user_types.user_type AS participant_user_type,
      case_item.item_number AS assigned_case_number
    FROM beginners_course_participants
    INNER JOIN users
      ON users.id = beginners_course_participants.user_id
    INNER JOIN user_types
      ON user_types.user_id = users.id
    LEFT JOIN equipment_items AS case_item
      ON case_item.id = beginners_course_participants.assigned_case_id
    WHERE beginners_course_participants.course_id = ?
    ORDER BY beginners_course_participants.surname ASC, beginners_course_participants.first_name ASC
  `);

  const findBeginnersCourseParticipantById = db.prepare(`
    SELECT *
    FROM beginners_course_participants
    WHERE id = ?
  `);

  const deleteBeginnersCourseParticipant = db.prepare(`
    DELETE FROM beginners_course_participants
    WHERE id = ?
  `);

  const findBeginnersCourseParticipantByUsername = db.prepare(`
    SELECT *
    FROM beginners_course_participants
    WHERE username = ?
  `);

  const listBeginnersCourseParticipantLoginDates = db.prepare(`
    SELECT
      beginners_course_participants.course_id,
      beginners_course_participants.username,
      login_events.logged_in_date
    FROM beginners_course_participants
    INNER JOIN users
      ON users.id = beginners_course_participants.user_id
    INNER JOIN login_events
      ON login_events.user_id = users.id
    ORDER BY beginners_course_participants.course_id ASC,
      beginners_course_participants.username ASC,
      login_events.logged_in_date ASC
  `);

  const insertBeginnersCourseParticipant = db.prepare(`
    INSERT INTO beginners_course_participants (
      course_id,
      username,
      first_name,
      surname,
      beginner_size_category,
      height_text,
      draw_length,
      handedness,
      eye_dominance,
      initial_email_sent,
      thirty_day_reminder_sent,
      course_fee_paid,
      origin_course_type,
      assigned_case_id,
      assigned_case_by_username,
      assigned_case_at_date,
      assigned_case_at_time,
      created_by_username,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateBeginnersCourseParticipant = db.prepare(`
    UPDATE beginners_course_participants
    SET
      first_name = @firstName,
      surname = @surname,
      beginner_size_category = @sizeCategory,
      height_text = @heightText,
      draw_length = @drawLength,
      handedness = @handedness,
      eye_dominance = @eyeDominance,
      initial_email_sent = @initialEmailSent,
      thirty_day_reminder_sent = @thirtyDayReminderSent,
      course_fee_paid = @courseFeePaid
    WHERE id = @id
  `);

  const transferBeginnersCourseParticipant = db.prepare(`
    UPDATE beginners_course_participants
    SET
      course_id = ?,
      assigned_case_id = NULL,
      assigned_case_by_username = NULL,
      assigned_case_at_date = NULL,
      assigned_case_at_time = NULL,
      converted_to_member = 0,
      converted_at_date = NULL,
      converted_at_time = NULL,
      converted_by_username = NULL
    WHERE id = ?
  `);

  const updateBeginnersCourseParticipantCase = db.prepare(`
    UPDATE beginners_course_participants
    SET
      assigned_case_id = ?,
      assigned_case_by_username = ?,
      assigned_case_at_date = ?,
      assigned_case_at_time = ?
    WHERE id = ?
  `);

  const markBeginnersCourseParticipantConverted = db.prepare(`
    UPDATE beginners_course_participants
    SET
      converted_to_member = 1,
      converted_at_date = ?,
      converted_at_time = ?,
      converted_by_username = ?
    WHERE id = ?
  `);

  const listBeginnersLessonCoaches = db.prepare(`
    SELECT
      beginners_course_lesson_coaches.lesson_id,
      beginners_course_lesson_coaches.coach_username,
      users.first_name,
      users.surname
    FROM beginners_course_lesson_coaches
    INNER JOIN users
      ON users.id = beginners_course_lesson_coaches.coach_user_id
    ORDER BY beginners_course_lesson_coaches.lesson_id ASC, users.surname ASC, users.first_name ASC
  `);

  const listBeginnersLessonCoachesByLessonId = db.prepare(`
    SELECT
      beginners_course_lesson_coaches.lesson_id,
      beginners_course_lesson_coaches.coach_username,
      users.first_name,
      users.surname
    FROM beginners_course_lesson_coaches
    INNER JOIN users
      ON users.id = beginners_course_lesson_coaches.coach_user_id
    WHERE beginners_course_lesson_coaches.lesson_id = ?
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  const insertBeginnersLessonCoach = db.prepare(`
    INSERT OR IGNORE INTO beginners_course_lesson_coaches (
      lesson_id,
      coach_username,
      assigned_by_username,
      assigned_at_date,
      assigned_at_time
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const deleteBeginnersLessonCoachesByLessonId = db.prepare(`
    DELETE FROM beginners_course_lesson_coaches
    WHERE lesson_id = ?
  `);

  const listCoachBeginnersLessonsByUserId = db.prepare(`
    SELECT
      beginners_course_lessons.id,
      beginners_course_lessons.course_id,
      beginners_course_lessons.lesson_number,
      beginners_course_lessons.lesson_date,
      beginners_course_lessons.start_time,
      beginners_course_lessons.end_time,
      beginners_courses.course_type,
      beginners_courses.first_lesson_date,
      coordinator.first_name AS coordinator_first_name,
      coordinator.surname AS coordinator_surname
    FROM beginners_course_lesson_coaches
    INNER JOIN beginners_course_lessons
      ON beginners_course_lessons.id = beginners_course_lesson_coaches.lesson_id
    INNER JOIN beginners_courses
      ON beginners_courses.id = beginners_course_lessons.course_id
    INNER JOIN users AS coordinator
      ON (
        (
          beginners_courses.coordinator_user_id IS NOT NULL AND
          coordinator.id = beginners_courses.coordinator_user_id
        ) OR (
          beginners_courses.coordinator_user_id IS NULL AND
          LOWER(coordinator.username) = LOWER(beginners_courses.coordinator_username)
        )
      )
    WHERE beginners_course_lesson_coaches.coach_user_id = ?
      AND beginners_courses.is_cancelled = 0
      AND beginners_courses.approval_status = 'approved'
    ORDER BY beginners_course_lessons.lesson_date ASC, beginners_course_lessons.start_time ASC
  `);

  return {
    cancelBeginnersCourse,
    deleteBeginnersCourseParticipant,
    deleteBeginnersLessonCoachesByLessonId,
    findBeginnersCourseById,
    findBeginnersCourseLessonById,
    findBeginnersCourseParticipantById,
    findBeginnersCourseParticipantByUsername,
    insertBeginnersCourse,
    insertBeginnersCourseLesson,
    insertBeginnersCourseParticipant,
    insertBeginnersLessonCoach,
    listBeginnersCourseLessons,
    listBeginnersCourseLessonsByCourseId,
    listBeginnersCourseParticipantLoginDates,
    listBeginnersCourseParticipants,
    listBeginnersCourseParticipantsByCourseId,
    listBeginnersCourses,
    listBeginnersLessonCoaches,
    listBeginnersLessonCoachesByLessonId,
    listCoachBeginnersLessonsByUserId,
    markBeginnersCourseParticipantConverted,
    transferBeginnersCourseParticipant,
    updateBeginnersCourseApproval,
    updateBeginnersCourseLessonSchedule,
    updateBeginnersCourseParticipant,
    updateBeginnersCourseParticipantCase,
    updateBeginnersCourseSchedule,
  };
}
