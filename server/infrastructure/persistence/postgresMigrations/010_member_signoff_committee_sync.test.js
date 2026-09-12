import assert from "node:assert/strict";
import { test } from "node:test";

import { migration } from "./010_member_signoff_committee_sync.js";
import { postgresMigrations } from "./index.js";

test("migration 010 is registered after migration 009", () => {
  assert.equal(migration.version, "010_member_signoff_committee_sync");

  const versions = postgresMigrations.map((entry) => entry.version);

  assert.equal(
    versions.at(-2),
    "009_extended_sse_domains",
  );

  assert.equal(
    versions.at(-1),
    "010_member_signoff_committee_sync",
  );
});

test("migration 010 creates bow sign-off and committee role change-log triggers", () => {
  const sql = migration.statements.join("\n");

  assert.match(
    sql,
    /append_sync_member_distance_sign_off_change_log/,
  );

  assert.match(
    sql,
    /sync_member_distance_sign_offs_change_log_trigger/,
  );

  assert.match(
    sql,
    /'member_distance_sign_offs'/,
  );

  assert.match(
    sql,
    /sync_committee_roles_change_log_trigger/,
  );

  assert.match(
    sql,
    /'committee_roles'/,
  );

  assert.match(
    sql,
    /'role_key'/,
  );
});

test("migration 010 suppresses change logging during sync apply", () => {
  const sql = migration.statements.join("\n");

  assert.match(
    sql,
    /archery\.sync\.apply_mode/,
  );

  assert.match(
    sql,
    /'pull', 'maintenance'/,
  );
});
