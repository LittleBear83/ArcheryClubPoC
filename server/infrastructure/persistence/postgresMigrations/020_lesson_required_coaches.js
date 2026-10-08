export const migration = {
  version: "020_lesson_required_coaches",
  statements: [
    `ALTER TABLE beginners_course_lessons
     ADD COLUMN IF NOT EXISTS required_coach_count INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE beginners_course_lessons
     ALTER COLUMN required_coach_count SET DEFAULT 1`,
    `UPDATE beginners_course_lessons AS lesson
     SET required_coach_count = 5
     FROM beginners_courses AS course
     WHERE course.id = lesson.course_id
       AND course.course_type = 'beginners'
       AND lesson.required_coach_count = 1
       AND NOT EXISTS (
         SELECT 1 FROM audit_events AS audit
         WHERE audit.action = 'required_coach_count_changed'
           AND audit.target = ('/api/beginners-course-lessons/' || lesson.id::text || '/required-coaches')
       )`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'beginners_course_lessons_required_coach_count_check'
       ) THEN
         ALTER TABLE beginners_course_lessons
         ADD CONSTRAINT beginners_course_lessons_required_coach_count_check
         CHECK (required_coach_count >= 1);
       END IF;
     END $$`,
  ],
};
