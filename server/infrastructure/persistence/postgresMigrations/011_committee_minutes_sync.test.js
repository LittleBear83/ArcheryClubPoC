import assert from "node:assert/strict";
import { test } from "node:test";

import { migration } from "./011_committee_minutes_sync.js";
import { postgresMigrations } from "./index.js";

test("migration 011 is registered after migration 010", () => {
  assert.equal(
    migration.version,
    "011_committee_minutes_sync",
  );

  const versions = postgresMigrations.map(
    (entry) => entry.version,
  );

  const migration010Index = versions.indexOf(
    "010_member_signoff_committee_sync",
  );

  const migration011Index = versions.indexOf(
    "011_committee_minutes_sync",
  );

  assert.notEqual(migration010Index, -1);
  assert.notEqual(migration011Index, -1);

  assert.equal(
    migration011Index,
    migration010Index + 1,
  );
});

test("migration 011 adds opaque committee minutes sync identity", () => {
  const sql = migration.statements.join("\n");

  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS sync_id TEXT/i,
  );

  assert.match(
    sql,
    /SET sync_id = gen_random_uuid\(\)::text/i,
  );

  assert.match(
    sql,
    /ALTER COLUMN sync_id SET DEFAULT gen_random_uuid\(\)::text/i,
  );

  assert.match(
    sql,
    /ALTER COLUMN sync_id SET NOT NULL/i,
  );

  assert.match(
    sql,
    /committee_meeting_minutes_sync_id_uidx/i,
  );
});

test("migration 011 backfills identity before installing the sync trigger", () => {
  const sql = migration.statements.join("\n");

  const backfillPosition = sql.indexOf(
    "SET sync_id = gen_random_uuid()::text",
  );

  const triggerPosition = sql.indexOf(
    "sync_committee_meeting_minutes_change_log_trigger",
  );

  assert.notEqual(backfillPosition, -1);
  assert.notEqual(triggerPosition, -1);

  assert.ok(
    backfillPosition < triggerPosition,
    "sync_id must be backfilled before the trigger is installed",
  );
});

test("migration 011 publishes portable committee minute fields", () => {
  const sql = migration.statements.join("\n");

  for (const field of [
    "sync_id",
    "meeting_date",
    "title",
    "sections_json",
    "actions_json",
    "created_at_date",
    "created_at_time",
    "updated_at_date",
    "updated_at_time",
    "updated_by_username",
  ]) {
    assert.match(
      sql,
      new RegExp(`'${field}'`),
    );
  }

  assert.doesNotMatch(
    sql,
    /'id'\s*,\s*source_row\.id/,
  );

  assert.doesNotMatch(
    sql,
    /'updated_by_user_id'\s*,/,
  );
});

test("migration 011 supports change publication and echo suppression", () => {
  const sql = migration.statements.join("\n");

  assert.match(
    sql,
    /append_sync_committee_meeting_minutes_change_log/,
  );

  assert.match(
    sql,
    /'committee_meeting_minutes'/,
  );

  assert.match(
    sql,
    /AFTER INSERT OR UPDATE OR DELETE/,
  );

  assert.match(
    sql,
    /archery\.sync\.apply_mode/,
  );

  assert.match(
    sql,
    /'pull', 'maintenance'/,
  );

  assert.match(
    sql,
    /OLD\.sync_id IS DISTINCT FROM NEW\.sync_id/,
  );
});
