export function createManualLessonAttendanceGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return {
      async listAll() {
        const result = await pool.query(`
          SELECT attendance.lesson_id, attendance.participant_id,
            lesson.course_id, lesson.lesson_date, participant.username
          FROM beginners_course_manual_attendance AS attendance
          JOIN beginners_course_lessons AS lesson ON lesson.id = attendance.lesson_id
          JOIN beginners_course_participants AS participant ON participant.id = attendance.participant_id
        `);
        return result.rows;
      },
      async set({ lessonId, participantId, actorUsername, date, time }) {
        await pool.query(`
          INSERT INTO beginners_course_manual_attendance
            (lesson_id, participant_id, recorded_by_username, recorded_at_date, recorded_at_time)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (lesson_id, participant_id) DO NOTHING
        `, [lessonId, participantId, actorUsername, date, time]);
      },
      async remove({ lessonId, participantId }) {
        await pool.query(`DELETE FROM beginners_course_manual_attendance
          WHERE lesson_id = $1 AND participant_id = $2`, [lessonId, participantId]);
      },
    };
  }

  const list = db.prepare(`
    SELECT attendance.lesson_id, attendance.participant_id,
      lesson.course_id, lesson.lesson_date, participant.username
    FROM beginners_course_manual_attendance AS attendance
    JOIN beginners_course_lessons AS lesson ON lesson.id = attendance.lesson_id
    JOIN beginners_course_participants AS participant ON participant.id = attendance.participant_id
  `);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO beginners_course_manual_attendance
      (lesson_id, participant_id, recorded_by_username, recorded_at_date, recorded_at_time)
    VALUES (?, ?, ?, ?, ?)
  `);
  const remove = db.prepare(`DELETE FROM beginners_course_manual_attendance
    WHERE lesson_id = ? AND participant_id = ?`);
  return {
    async listAll() { return list.all(); },
    async set({ lessonId, participantId, actorUsername, date, time }) {
      insert.run(lessonId, participantId, actorUsername, date, time);
    },
    async remove({ lessonId, participantId }) { remove.run(lessonId, participantId); },
  };
}
