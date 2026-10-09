export const migration = {
  version: "023_coaching_participant_notes",
  statements: [
    `CREATE TABLE IF NOT EXISTS coaching_participant_notes (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES beginners_courses(id) ON DELETE CASCADE,
      participant_id BIGINT NOT NULL REFERENCES beginners_course_participants(id) ON DELETE CASCADE,
      author_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      author_initials TEXT NOT NULL,
      attendee_initials TEXT NOT NULL,
      note_text TEXT NOT NULL CHECK (char_length(note_text) BETWEEN 1 AND 500),
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS coaching_participant_notes_participant_idx ON coaching_participant_notes (participant_id, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS coaching_participant_notes_author_idx ON coaching_participant_notes (author_username, created_at DESC, id DESC)`,
    `CREATE INDEX IF NOT EXISTS coaching_participant_notes_expiry_idx ON coaching_participant_notes (expires_at)`,
  ],
};
