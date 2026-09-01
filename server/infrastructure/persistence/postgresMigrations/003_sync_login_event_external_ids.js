export const migration = {
  version: "003_sync_login_event_external_ids",
  statements: [
    `
      ALTER TABLE login_events
      ADD COLUMN IF NOT EXISTS sync_event_id TEXT
    `,
    `
      ALTER TABLE login_events
      ADD COLUMN IF NOT EXISTS sync_source_machine_id TEXT
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS login_events_sync_event_id_uidx
      ON login_events (sync_event_id)
      WHERE sync_event_id IS NOT NULL
    `,
    `
      CREATE INDEX IF NOT EXISTS login_events_sync_source_machine_id_idx
      ON login_events (sync_source_machine_id)
      WHERE sync_source_machine_id IS NOT NULL
    `,
  ],
};
