export const migration = {
  version: "022_coaching_assignment_notifications",
  statements: [
    `CREATE TABLE IF NOT EXISTS coaching_assignment_notifications (
      id BIGSERIAL PRIMARY KEY,
      coordinator_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS coaching_assignment_notifications_recipient_idx
      ON coaching_assignment_notifications (coordinator_username, id)`,
  ],
};
