import assert from "node:assert/strict";
import { test } from "node:test";
import { runPostgresMigrations } from "./runPostgresMigrations.js";
import { migration as fixSyncChangeTriggerMigration } from "./postgresMigrations/004_fix_sync_change_trigger.js";
import { migration as operationalSyncMigration } from "./postgresMigrations/005_operational_sync.js";
import { migration as phase2a1ReportingSyncMigration } from "./postgresMigrations/006_phase_2a1_reporting_sync.js";

const NUMBERED_MIGRATION_VERSIONS = [
  "002_sync_foundation",
  "003_sync_login_event_external_ids",
  "004_fix_sync_change_trigger",
  "005_operational_sync",
  "006_phase_2a1_reporting_sync",
];

function createPoolDouble({
  appliedVersions = NUMBERED_MIGRATION_VERSIONS,
  schemaApplied = true,
} = {}) {
  const queries = [];
  const appliedVersionSet = new Set([
    ...(schemaApplied ? ["001_initial_schema"] : []),
    ...appliedVersions,
  ]);
  const client = {
    async query(sql, values) {
      const normalizedSql = String(sql).trim().replace(/\s+/g, " ");
      queries.push({ sql: normalizedSql, values: values ?? [] });

      if (normalizedSql.includes("FROM schema_migrations")) {
        return {
          rowCount: appliedVersionSet.has(values?.[0]) ? 1 : 0,
          rows: [],
        };
      }

      return {
        rowCount: 0,
        rows: [],
      };
    },
    release() {},
  };

  return {
    pool: {
      async connect() {
        return client;
      },
    },
    queries,
  };
}

test("runPostgresMigrations installs user reference sync triggers and backfills", async () => {
  const { pool, queries } = createPoolDouble();

  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [],
    pool,
    seedUsers: [],
    systemRoleDefinitions: [],
  });

  assert.equal(queries[0].sql, "BEGIN");
  assert.deepEqual(queries[1], {
    sql: "SELECT pg_advisory_xact_lock($1)",
    values: [81420732],
  });
  assert.ok(
    queries.some((entry) =>
      entry.sql.includes("CREATE OR REPLACE FUNCTION sync_login_events_user_refs()"),
    ),
  );
  assert.ok(
    queries.some((entry) =>
      entry.sql.includes("CREATE TRIGGER equipment_items_user_refs_trigger"),
    ),
  );
  assert.ok(
    queries.some((entry) => entry.sql.startsWith("UPDATE beginners_courses SET")),
  );
  assert.equal(queries.at(-1)?.sql, "COMMIT");
});

test("runPostgresMigrations still seeds initial schema when missing", async () => {
  const { pool, queries } = createPoolDouble({ schemaApplied: false });

  await runPostgresMigrations({
    committeeRoleSeed: [
      {
        displayOrder: 1,
        personalBlurb: "",
        photoDataUrl: null,
        responsibilities: "Coordinate",
        roleKey: "chair",
        summary: "Club chair",
        title: "Chair",
      },
    ],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [
      {
        description: "Manage things",
        key: "manage_things",
        label: "Manage things",
      },
    ],
    pool,
    seedUsers: [
      {
        activeMember: true,
        coachingVolunteer: false,
        disciplines: ["Recurve Bow"],
        firstName: "Alice",
        membershipFeesDue: "2026-12-31",
        password: "hashed",
        rfidTag: "TAG-1",
        surname: "Example",
        userType: "admin",
        username: "alice",
      },
    ],
    systemRoleDefinitions: [
      {
        permissions: ["manage_things"],
        roleKey: "admin",
        title: "Admin",
      },
    ],
  });

  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO permissions")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO roles")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO committee_roles")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO users")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO user_types")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO user_disciplines")),
  );
  const cupboardSeed = queries.find((entry) =>
    entry.sql.includes("INSERT INTO equipment_storage_locations"),
  );
  assert.ok(cupboardSeed);
  assert.match(cupboardSeed.sql, /md5\('equipment_storage_locations:' \|\| \$1\)/);
  assert.deepEqual(cupboardSeed.values, ["Main Cupboard"]);
  assert.ok(
    queries.some(
      (entry) =>
        entry.sql.includes("INSERT INTO schema_migrations (version)") &&
        entry.values[0] === "001_initial_schema",
    ),
  );
});

function deriveRecordKey(payload, keyStrategy) {
  if (keyStrategy === "__composite__") {
    return [payload.username, payload.discipline].filter(Boolean).join(":");
  }

  if (keyStrategy === "__role_permission__") {
    return [payload.role_key, payload.permission_key].filter(Boolean).join(":");
  }

  return payload[keyStrategy] ?? "";
}

function buildExpectedChange({ key, operation, payload }) {
  return {
    operation: operation === "DELETE" ? "delete" : "upsert",
    payload,
    recordKey: deriveRecordKey(payload, key),
  };
}

test("004 sync trigger derives keys from JSON payloads for every synchronized table shape", () => {
  const triggerSql = fixSyncChangeTriggerMigration.statements[0];

  assert.match(triggerSql, /next_payload := to_jsonb\(OLD\)/);
  assert.match(triggerSql, /next_payload := to_jsonb\(NEW\)/);
  assert.doesNotMatch(triggerSql, /\b(?:OLD|NEW)\.(?:username|discipline|role_key|permission_key)\b/);
  assert.match(triggerSql, /'maintenance'/);

  const cases = [
    { expectedOperation: "upsert", key: "username", operation: "INSERT", payload: { username: "robin" }, table: "users" },
    { expectedOperation: "upsert", key: "username", operation: "UPDATE", payload: { user_type: "admin", username: "robin" }, table: "user_types" },
    { expectedOperation: "upsert", key: "__composite__", operation: "INSERT", payload: { discipline: "Recurve", username: "robin" }, table: "user_disciplines" },
    { expectedOperation: "upsert", key: "role_key", operation: "UPDATE", payload: { role_key: "admin" }, table: "roles" },
    { expectedOperation: "upsert", key: "permission_key", operation: "INSERT", payload: { permission_key: "manage_users" }, table: "permissions" },
    { expectedOperation: "delete", key: "__role_permission__", operation: "DELETE", payload: { permission_key: "manage_users", role_key: "admin" }, table: "role_permissions" },
  ];

  for (const entry of cases) {
    const change = buildExpectedChange(entry);
    assert.notEqual(change.recordKey, "", entry.table);
    assert.equal(change.operation, entry.expectedOperation, entry.table);
    assert.deepEqual(change.payload, entry.payload, entry.table);
  }

  // A role-permission delete uses OLD, but its JSON shape is still complete.
  assert.equal(
    deriveRecordKey(
      { permission_key: "manage_users", role_key: "admin" },
      "__role_permission__",
    ),
    "admin:manage_users",
  );
});

test("005 custom operational sync triggers suppress pull and maintenance changes", () => {
  const customFunctions = [
    "append_sync_event_booking_change_log",
    "append_sync_coaching_booking_change_log",
    "append_sync_equipment_item_change_log",
  ];
  const expectedGuard = "current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance')";

  for (const functionName of customFunctions) {
    const functionSql = operationalSyncMigration.statements.find((statement) =>
      statement.includes(`FUNCTION ${functionName}()`),
    );

    assert.ok(functionSql, `${functionName} migration statement is present`);
    assert.ok(functionSql.includes(expectedGuard), `${functionName} suppresses pull and maintenance`);
    assert.match(functionSql, /IF TG_OP = 'DELETE' THEN\s+RETURN OLD;/);
    assert.match(functionSql, /RETURN NEW;/);
  }
});

test("006 reporting sync migration adds stable identities and reporting change tracking", () => {
  const statements = phase2a1ReportingSyncMigration.statements.join("\n");

  assert.match(statements, /ALTER TABLE guest_login_events\s+ADD COLUMN IF NOT EXISTS sync_event_id/i);
  assert.match(statements, /ALTER TABLE beginners_courses\s+ADD COLUMN IF NOT EXISTS sync_id/i);
  assert.match(statements, /ALTER TABLE beginners_course_participants\s+ADD COLUMN IF NOT EXISTS sync_id/i);
  assert.match(statements, /ALTER TABLE range_presence_extensions\s+ADD COLUMN IF NOT EXISTS sync_version/i);
  assert.match(statements, /CREATE TRIGGER sync_login_events_change_log_trigger/i);
  assert.match(statements, /CREATE TRIGGER sync_guest_login_events_change_log_trigger/i);
  assert.match(statements, /CREATE TRIGGER sync_range_presence_extensions_change_log_trigger/i);
});

test("004 repairs an upgraded database before bootstrap updates can invoke the old trigger", async () => {
  const { pool, queries } = createPoolDouble({
    appliedVersions: ["002_sync_foundation", "003_sync_login_event_external_ids"],
  });

  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [],
    pool,
    seedUsers: [],
    systemRoleDefinitions: [],
  });

  const repairIndex = queries.findIndex((entry) =>
    entry.sql.includes("CREATE OR REPLACE FUNCTION append_sync_change_log()"),
  );
  const maintenanceModeIndex = queries.findIndex((entry) =>
    entry.sql.includes("set_config('archery.sync.apply_mode', 'maintenance', true)"),
  );
  const usersUpdateIndex = queries.findIndex((entry) =>
    entry.sql.startsWith("UPDATE users SET membership_status"),
  );

  assert.ok(repairIndex > -1);
  assert.ok(maintenanceModeIndex > repairIndex);
  assert.ok(usersUpdateIndex > maintenanceModeIndex);
});

test("fresh databases repair the trigger before seed writes and suppress startup change noise", async () => {
  const { pool, queries } = createPoolDouble({
    appliedVersions: [],
    schemaApplied: false,
  });

  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [],
    pool,
    seedUsers: [
      {
        activeMember: true,
        coachingVolunteer: false,
        disciplines: [],
        firstName: "Alice",
        membershipFeesDue: "2026-12-31",
        password: "hashed",
        rfidTag: "TAG-1",
        surname: "Example",
        userType: "admin",
        username: "alice",
      },
    ],
    systemRoleDefinitions: [],
  });

  const repairIndex = queries.findIndex((entry) =>
    entry.sql.includes("CREATE OR REPLACE FUNCTION append_sync_change_log()"),
  );
  const maintenanceModeIndex = queries.findIndex((entry) =>
    entry.sql.includes("set_config('archery.sync.apply_mode', 'maintenance', true)"),
  );
  const firstUserSeedIndex = queries.findIndex((entry) =>
    entry.sql.includes("INSERT INTO users"),
  );

  assert.ok(repairIndex > -1);
  assert.ok(maintenanceModeIndex > repairIndex);
  assert.ok(firstUserSeedIndex > maintenanceModeIndex);
});
