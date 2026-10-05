import { syncedRfidAuditSql } from "../syncedRfidAudit.js";

export const migration = {
  version: "018_synced_rfid_audit",
  statements: [
    `ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS sync_event_id TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS audit_events_sync_event_id_key
       ON audit_events (sync_event_id)`,
    `${syncedRfidAuditSql} ON CONFLICT (sync_event_id) DO NOTHING`,
  ],
};
