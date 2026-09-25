export const migration = {
  version: "012_lesson_cancellation",
  statements: [
    `ALTER TABLE beginners_course_lessons
     ADD COLUMN IF NOT EXISTS is_cancelled INTEGER NOT NULL DEFAULT 0
     CHECK (is_cancelled IN (0, 1))`,
  ],
};
