function createSqliteBeginnersCourseReadGateway({
  findBeginnersCourseById,
  findBeginnersCourseLessonById,
  findBeginnersCourseParticipantById,
  findBeginnersCourseParticipantByUsername,
  listBeginnersCourseLessons,
  listBeginnersCourseLessonsByCourseId,
  listBeginnersCourseParticipantLoginDates,
  listBeginnersCourseParticipants,
  listBeginnersCourseParticipantsByCourseId,
  listBeginnersCourses,
  listBeginnersLessonCoaches,
  listBeginnersLessonCoachesByLessonId,
  listCoachBeginnersLessonsByUserId,
}) {
  return {
    async findCourseById(id) {
      return findBeginnersCourseById.get(id) ?? null;
    },
    async findLessonById(id) {
      return findBeginnersCourseLessonById.get(id) ?? null;
    },
    async findParticipantById(id) {
      return findBeginnersCourseParticipantById.get(id) ?? null;
    },
    async findParticipantByUsername(username) {
      return findBeginnersCourseParticipantByUsername.get(username) ?? null;
    },
    async listCourses() {
      return listBeginnersCourses.all();
    },
    async listLessonCoaches() {
      return listBeginnersLessonCoaches.all();
    },
    async listLessonCoachesByLessonId(lessonId) {
      return listBeginnersLessonCoachesByLessonId.all(lessonId);
    },
    async listLessons() {
      return listBeginnersCourseLessons.all();
    },
    async listLessonsByCourseId(courseId) {
      return listBeginnersCourseLessonsByCourseId.all(courseId);
    },
    async listParticipantLoginDates() {
      return listBeginnersCourseParticipantLoginDates.all();
    },
    async listParticipants() {
      return listBeginnersCourseParticipants.all();
    },
    async listParticipantsByCourseId(courseId) {
      return listBeginnersCourseParticipantsByCourseId.all(courseId);
    },
    async listCoachLessonsByUserId(userId) {
      return listCoachBeginnersLessonsByUserId.all(userId);
    },
  };
}

function createPostgresBeginnersCourseReadGateway({ pool }) {
  return {
    async findCourseById(id) {
      const result = await pool.query(
        `
          SELECT *
          FROM beginners_courses
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async findLessonById(id) {
      const result = await pool.query(
        `
          SELECT *
          FROM beginners_course_lessons
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async findParticipantById(id) {
      const result = await pool.query(
        `
          SELECT *
          FROM beginners_course_participants
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );
      return result.rows[0] ?? null;
    },
    async findParticipantByUsername(username) {
      const result = await pool.query(
        `
          SELECT *
          FROM beginners_course_participants
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );
      return result.rows[0] ?? null;
    },
    async listCourses() {
      const result = await pool.query(
        `
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
            ON coordinator.id = beginners_courses.coordinator_user_id
          INNER JOIN users AS submitted_by
            ON submitted_by.id = beginners_courses.submitted_by_user_id
          LEFT JOIN users AS approved_by
            ON approved_by.id = beginners_courses.approved_by_user_id
          ORDER BY beginners_courses.first_lesson_date ASC,
            beginners_courses.start_time ASC,
            beginners_courses.id ASC
        `,
      );
      return result.rows;
    },
    async listLessonCoaches() {
      const result = await pool.query(
        `
          SELECT
            beginners_course_lesson_coaches.lesson_id,
            beginners_course_lesson_coaches.coach_username,
            users.first_name,
            users.surname
          FROM beginners_course_lesson_coaches
          INNER JOIN users
            ON users.id = beginners_course_lesson_coaches.coach_user_id
          ORDER BY beginners_course_lesson_coaches.lesson_id ASC,
            users.surname ASC,
            users.first_name ASC
        `,
      );
      return result.rows;
    },
    async listLessonCoachesByLessonId(lessonId) {
      const result = await pool.query(
        `
          SELECT
            beginners_course_lesson_coaches.lesson_id,
            beginners_course_lesson_coaches.coach_username,
            users.first_name,
            users.surname
          FROM beginners_course_lesson_coaches
          INNER JOIN users
            ON users.id = beginners_course_lesson_coaches.coach_user_id
          WHERE beginners_course_lesson_coaches.lesson_id = $1
          ORDER BY users.surname ASC, users.first_name ASC
        `,
        [lessonId],
      );
      return result.rows;
    },
    async listLessons() {
      const result = await pool.query(
        `
          SELECT beginners_course_lessons.*
          FROM beginners_course_lessons
          ORDER BY beginners_course_lessons.lesson_date ASC,
            beginners_course_lessons.start_time ASC,
            beginners_course_lessons.lesson_number ASC
        `,
      );
      return result.rows;
    },
    async listLessonsByCourseId(courseId) {
      const result = await pool.query(
        `
          SELECT *
          FROM beginners_course_lessons
          WHERE course_id = $1
          ORDER BY lesson_number ASC
        `,
        [courseId],
      );
      return result.rows;
    },
    async listParticipantLoginDates() {
      const result = await pool.query(
        `
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
        `,
      );
      return result.rows;
    },
    async listParticipants() {
      const result = await pool.query(
        `
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
          ORDER BY beginners_course_participants.course_id ASC,
            beginners_course_participants.surname ASC,
            beginners_course_participants.first_name ASC
        `,
      );
      return result.rows;
    },
    async listParticipantsByCourseId(courseId) {
      const result = await pool.query(
        `
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
          WHERE beginners_course_participants.course_id = $1
          ORDER BY beginners_course_participants.surname ASC,
            beginners_course_participants.first_name ASC
        `,
        [courseId],
      );
      return result.rows;
    },
    async listCoachLessonsByUserId(userId) {
      const result = await pool.query(
        `
          SELECT
            beginners_course_lessons.id,
            beginners_course_lessons.course_id,
            beginners_course_lessons.lesson_number,
            beginners_course_lessons.lesson_date,
            beginners_course_lessons.start_time,
            beginners_course_lessons.end_time,
            beginners_courses.first_lesson_date,
            coordinator.first_name AS coordinator_first_name,
            coordinator.surname AS coordinator_surname
          FROM beginners_course_lesson_coaches
          INNER JOIN beginners_course_lessons
            ON beginners_course_lessons.id = beginners_course_lesson_coaches.lesson_id
          INNER JOIN beginners_courses
            ON beginners_courses.id = beginners_course_lessons.course_id
          INNER JOIN users AS coordinator
            ON coordinator.id = beginners_courses.coordinator_user_id
          WHERE beginners_course_lesson_coaches.coach_user_id = $1
            AND beginners_courses.is_cancelled = 0
            AND beginners_courses.approval_status = 'approved'
          ORDER BY beginners_course_lessons.lesson_date ASC,
            beginners_course_lessons.start_time ASC
        `,
        [userId],
      );
      return result.rows;
    },
  };
}

export function createBeginnersCourseReadGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresBeginnersCourseReadGateway(options);
  }

  return createSqliteBeginnersCourseReadGateway(options);
}
