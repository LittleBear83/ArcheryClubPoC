function expiryFor(createdAt) {
  const date = new Date(createdAt);
  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())).toISOString();
}

function toNote(row, now) {
  const expiresAt = new Date(row.expires_at).toISOString();
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    participantId: Number(row.participant_id),
    authorUsername: row.author_username,
    authorInitials: row.author_initials,
    attendeeInitials: row.attendee_initials,
    text: row.note_text,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt,
    dueForDeletion: new Date(expiresAt).getTime() <= now.getTime() + 30 * 86400000,
  };
}

export function createCoachingParticipantNoteGateway({ databaseEngine, db, pool }) {
  const postgres = databaseEngine === "postgres";
  const allColumns = "id, course_id, participant_id, author_username, author_initials, attendee_initials, note_text, created_at, expires_at";
  const sqliteInsert = !postgres && db.prepare(`INSERT INTO coaching_participant_notes (course_id, participant_id, author_username, author_initials, attendee_initials, note_text, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const sqlitePurge = !postgres && db.prepare("DELETE FROM coaching_participant_notes WHERE expires_at <= ?");
  const sqliteParticipant = !postgres && db.prepare(`SELECT ${allColumns} FROM coaching_participant_notes WHERE participant_id = ? AND expires_at > ? ORDER BY created_at DESC, id DESC`);
  const sqliteAuthor = !postgres && db.prepare(`SELECT ${allColumns} FROM coaching_participant_notes WHERE lower(author_username) = lower(?) AND expires_at > ? ORDER BY created_at DESC, id DESC`);
  const sqliteCounts = !postgres && db.prepare("SELECT participant_id, COUNT(*) AS note_count FROM coaching_participant_notes WHERE course_id = ? AND expires_at > ? GROUP BY participant_id");
  return {
    async purgeExpired(now = new Date()) {
      if (postgres) await pool.query("DELETE FROM coaching_participant_notes WHERE expires_at <= $1", [now.toISOString()]);
      else sqlitePurge.run(now.toISOString());
    },
    async add({ courseId, participantId, authorUsername, authorInitials, attendeeInitials, text }, now = new Date()) {
      await this.purgeExpired(now);
      const createdAt = now.toISOString();
      const expiresAt = expiryFor(createdAt);
      if (postgres) {
        const result = await pool.query(
          `INSERT INTO coaching_participant_notes (course_id, participant_id, author_username, author_initials, attendee_initials, note_text, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${allColumns}`,
          [courseId, participantId, authorUsername, authorInitials, attendeeInitials, text, createdAt, expiresAt],
        );
        return toNote(result.rows[0], now);
      }
      const result = sqliteInsert.run(courseId, participantId, authorUsername, authorInitials, attendeeInitials, text, createdAt, expiresAt);
      return toNote({ id: result.lastInsertRowid, course_id: courseId, participant_id: participantId, author_username: authorUsername, author_initials: authorInitials, attendee_initials: attendeeInitials, note_text: text, created_at: createdAt, expires_at: expiresAt }, now);
    },
    async listForParticipant(participantId, now = new Date()) {
      await this.purgeExpired(now);
      const rows = postgres
        ? (await pool.query(`SELECT ${allColumns} FROM coaching_participant_notes WHERE participant_id = $1 AND expires_at > $2 ORDER BY created_at DESC, id DESC`, [participantId, now.toISOString()])).rows
        : sqliteParticipant.all(participantId, now.toISOString());
      return rows.map((row) => toNote(row, now));
    },
    async listCountsForCourse(courseId, now = new Date()) {
      await this.purgeExpired(now);
      const rows = postgres
        ? (await pool.query("SELECT participant_id, COUNT(*) AS note_count FROM coaching_participant_notes WHERE course_id = $1 AND expires_at > $2 GROUP BY participant_id", [courseId, now.toISOString()])).rows
        : sqliteCounts.all(courseId, now.toISOString());
      return new Map(rows.map((row) => [Number(row.participant_id), Number(row.note_count)]));
    },
    async listForAuthor(authorUsername, now = new Date()) {
      await this.purgeExpired(now);
      const rows = postgres
        ? (await pool.query(`SELECT ${allColumns} FROM coaching_participant_notes WHERE lower(author_username) = lower($1) AND expires_at > $2 ORDER BY created_at DESC, id DESC`, [authorUsername, now.toISOString()])).rows
        : sqliteAuthor.all(authorUsername, now.toISOString());
      return rows.map((row) => toNote(row, now));
    },
  };
}
