import { migration as syncFoundationMigration } from "./002_sync_foundation.js";
import { migration as syncLoginEventExternalIdsMigration } from "./003_sync_login_event_external_ids.js";
import { migration as fixSyncChangeTriggerMigration } from "./004_fix_sync_change_trigger.js";
import { migration as operationalSyncMigration } from "./005_operational_sync.js";
import { migration as phase2a1ReportingSyncMigration } from "./006_phase_2a1_reporting_sync.js";

export const postgresMigrations = [
  syncFoundationMigration,
  syncLoginEventExternalIdsMigration,
  fixSyncChangeTriggerMigration,
  operationalSyncMigration,
  phase2a1ReportingSyncMigration,
];
