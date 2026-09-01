import { migration as syncFoundationMigration } from "./002_sync_foundation.js";
import { migration as syncLoginEventExternalIdsMigration } from "./003_sync_login_event_external_ids.js";

export const postgresMigrations = [
  syncFoundationMigration,
  syncLoginEventExternalIdsMigration,
];
