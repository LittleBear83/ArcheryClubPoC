export const migration = {
  version: "021_manual_lesson_attendance",
  statements: [
    `CREATE TABLE IF NOT EXISTS beginners_course_manual_attendance (
      lesson_id BIGINT NOT NULL REFERENCES beginners_course_lessons(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES beginners_course_participants(id) ON DELETE CASCADE,
      recorded_by_username TEXT NOT NULL REFERENCES users(username),
      recorded_at_date TEXT NOT NULL,
      recorded_at_time TEXT NOT NULL,
      PRIMARY KEY (lesson_id, participant_id)
    )`,
  ],
};
