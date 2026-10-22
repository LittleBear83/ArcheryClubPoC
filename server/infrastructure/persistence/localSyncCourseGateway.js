

export async function upsertBeginnersCourses(client, courses = []) {
  for (const course of courses) {
    await client.query(
      `
        INSERT INTO beginners_courses (
          sync_id,
          course_type,
          coordinator_username,
          submitted_by_username,
          first_lesson_date,
          start_time,
          end_time,
          lesson_count,
          beginner_capacity,
          approval_status,
          is_cancelled,
          cancellation_reason,
          cancelled_by_username,
          cancelled_at_date,
          cancelled_at_time,
          rejection_reason,
          approved_by_username,
          approved_at_date,
          approved_at_time,
          created_at_date,
          created_at_time,
          coordinator_user_id,
          submitted_by_user_id,
          cancelled_by_user_id,
          approved_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($3) LIMIT 1),
          (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1),
          (SELECT id FROM users WHERE LOWER(username) = LOWER($13) LIMIT 1),
          (SELECT id FROM users WHERE LOWER(username) = LOWER($17) LIMIT 1)
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          course_type = EXCLUDED.course_type,
          coordinator_username = EXCLUDED.coordinator_username,
          submitted_by_username = EXCLUDED.submitted_by_username,
          first_lesson_date = EXCLUDED.first_lesson_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          lesson_count = EXCLUDED.lesson_count,
          beginner_capacity = EXCLUDED.beginner_capacity,
          approval_status = EXCLUDED.approval_status,
          is_cancelled = EXCLUDED.is_cancelled,
          cancellation_reason = EXCLUDED.cancellation_reason,
          cancelled_by_username = EXCLUDED.cancelled_by_username,
          cancelled_at_date = EXCLUDED.cancelled_at_date,
          cancelled_at_time = EXCLUDED.cancelled_at_time,
          rejection_reason = EXCLUDED.rejection_reason,
          approved_by_username = EXCLUDED.approved_by_username,
          approved_by_user_id = EXCLUDED.approved_by_user_id,
          approved_at_date = EXCLUDED.approved_at_date,
          approved_at_time = EXCLUDED.approved_at_time,
          cancelled_by_user_id = EXCLUDED.cancelled_by_user_id,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time,
          coordinator_user_id = EXCLUDED.coordinator_user_id,
          submitted_by_user_id = EXCLUDED.submitted_by_user_id
      `,
      [
        course.sync_id,
        course.course_type,
        course.coordinator_username,
        course.submitted_by_username,
        course.first_lesson_date,
        course.start_time,
        course.end_time,
        course.lesson_count,
        course.beginner_capacity,
        course.approval_status,
        Number(course.is_cancelled ?? 0),
        course.cancellation_reason,
        course.cancelled_by_username,
        course.cancelled_at_date,
        course.cancelled_at_time,
        course.rejection_reason,
        course.approved_by_username,
        course.approved_at_date,
        course.approved_at_time,
        course.created_at_date,
        course.created_at_time,
      ],
    );
  }
}

export async function upsertBeginnersCourseParticipants(client, participants = []) {
  for (const participant of participants) {
    await client.query(
      `
        INSERT INTO beginners_course_participants (
          sync_id,
          course_id,
          username,
          user_id,
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
          converted_to_member,
          converted_at_date,
          converted_at_time,
          converted_by_username,
          converted_by_user_id,
          assigned_case_id,
          assigned_case_by_username,
          assigned_case_by_user_id,
          assigned_case_at_date,
          assigned_case_at_time,
          created_at_date,
          created_at_time,
          created_by_username,
          created_by_user_id,
          origin_course_id
        )
        VALUES (
          $1,
          (SELECT id FROM beginners_courses WHERE sync_id = $2 LIMIT 1),
          $3,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($3) LIMIT 1),
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($18) LIMIT 1),
          (SELECT id FROM equipment_items WHERE sync_id = $19 LIMIT 1),
          $20,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($20) LIMIT 1),
          $21,
          $22,
          $23,
          $24,
          $25,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($25) LIMIT 1),
          (SELECT id FROM beginners_courses WHERE sync_id = $26 LIMIT 1)
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          course_id = EXCLUDED.course_id,
          username = EXCLUDED.username,
          user_id = EXCLUDED.user_id,
          first_name = EXCLUDED.first_name,
          surname = EXCLUDED.surname,
          beginner_size_category = EXCLUDED.beginner_size_category,
          height_text = EXCLUDED.height_text,
          draw_length = EXCLUDED.draw_length,
          handedness = EXCLUDED.handedness,
          eye_dominance = EXCLUDED.eye_dominance,
          initial_email_sent = EXCLUDED.initial_email_sent,
          thirty_day_reminder_sent = EXCLUDED.thirty_day_reminder_sent,
          course_fee_paid = EXCLUDED.course_fee_paid,
          origin_course_type = EXCLUDED.origin_course_type,
          converted_to_member = EXCLUDED.converted_to_member,
          converted_at_date = EXCLUDED.converted_at_date,
          converted_at_time = EXCLUDED.converted_at_time,
          converted_by_username = EXCLUDED.converted_by_username,
          converted_by_user_id = EXCLUDED.converted_by_user_id,
          assigned_case_id = EXCLUDED.assigned_case_id,
          assigned_case_by_username = EXCLUDED.assigned_case_by_username,
          assigned_case_by_user_id = EXCLUDED.assigned_case_by_user_id,
          assigned_case_at_date = EXCLUDED.assigned_case_at_date,
          assigned_case_at_time = EXCLUDED.assigned_case_at_time,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time,
          created_by_username = EXCLUDED.created_by_username,
          created_by_user_id = EXCLUDED.created_by_user_id,
          origin_course_id = EXCLUDED.origin_course_id
      `,
      [
        participant.sync_id,
        participant.course_sync_id,
        participant.username,
        participant.first_name,
        participant.surname,
        participant.beginner_size_category,
        participant.height_text,
        participant.draw_length,
        participant.handedness,
        participant.eye_dominance,
        Number(participant.initial_email_sent ?? 0),
        Number(participant.thirty_day_reminder_sent ?? 0),
        Number(participant.course_fee_paid ?? 0),
        participant.origin_course_type,
        Number(participant.converted_to_member ?? 0),
        participant.converted_at_date,
        participant.converted_at_time,
        participant.converted_by_username,
        participant.assigned_case_sync_id ?? null,
        participant.assigned_case_by_username,
        participant.assigned_case_at_date,
        participant.assigned_case_at_time,
        participant.created_at_date,
        participant.created_at_time,
        participant.created_by_username,
        participant.origin_course_sync_id ?? null,
      ],
    );
  }
}

export async function upsertBeginnersCourseLessons(client, lessons = []) {
  for (const lesson of lessons) {
    await client.query(
      `
        INSERT INTO beginners_course_lessons (
          sync_id, course_id, lesson_number, lesson_date, start_time, end_time, is_cancelled, required_coach_count
        )
        VALUES (
          $1,
          (SELECT id FROM beginners_courses WHERE sync_id = $2 LIMIT 1),
          $3, $4, $5, $6, $7,
          COALESCE($8, CASE
            WHEN (SELECT course_type FROM beginners_courses WHERE sync_id = $2 LIMIT 1) = 'beginners' THEN 5
            ELSE 1
          END)
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          course_id = EXCLUDED.course_id,
          lesson_number = EXCLUDED.lesson_number,
          lesson_date = EXCLUDED.lesson_date,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          is_cancelled = EXCLUDED.is_cancelled,
          required_coach_count = EXCLUDED.required_coach_count
      `,
      [lesson.sync_id, lesson.course_sync_id, lesson.lesson_number, lesson.lesson_date, lesson.start_time, lesson.end_time, lesson.is_cancelled ?? 0, lesson.required_coach_count ?? null],
    );
  }
}

export async function upsertBeginnersCourseLessonCoaches(client, coaches = []) {
  for (const coach of coaches) {
    await client.query(
      `
        INSERT INTO beginners_course_lesson_coaches (
          lesson_id, coach_username, assigned_by_username, assigned_at_date,
          assigned_at_time, coach_user_id, assigned_by_user_id
        )
        VALUES (
          (SELECT id FROM beginners_course_lessons WHERE sync_id = $1 LIMIT 1),
          $2, $3, $4, $5,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($2) LIMIT 1),
          (SELECT id FROM users WHERE LOWER(username) = LOWER($3) LIMIT 1)
        )
        ON CONFLICT (lesson_id, coach_username) DO UPDATE SET
          assigned_by_username = EXCLUDED.assigned_by_username,
          assigned_at_date = EXCLUDED.assigned_at_date,
          assigned_at_time = EXCLUDED.assigned_at_time,
          coach_user_id = EXCLUDED.coach_user_id,
          assigned_by_user_id = EXCLUDED.assigned_by_user_id
      `,
      [coach.lesson_sync_id, coach.coach_username, coach.assigned_by_username, coach.assigned_at_date, coach.assigned_at_time],
    );
  }
}

export async function replaceCourseReportingGraph(client, snapshot) {
  await client.query(`DELETE FROM beginners_course_lesson_coaches`);
  await client.query(`DELETE FROM beginners_course_lessons`);
  await client.query(`DELETE FROM beginners_course_participants`);
  await client.query(`DELETE FROM beginners_courses`);

  await upsertBeginnersCourses(client, snapshot.beginnersCourses);
  await upsertBeginnersCourseLessons(client, snapshot.beginnersCourseLessons);
  await upsertBeginnersCourseLessonCoaches(client, snapshot.beginnersCourseLessonCoaches);
  await upsertBeginnersCourseParticipants(client, snapshot.beginnersCourseParticipants);
}
