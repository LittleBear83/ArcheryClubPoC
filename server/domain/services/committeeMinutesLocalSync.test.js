import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { REPLICATED_DOMAINS } from "./localDatabaseSyncService.js";

const serviceUrl = new URL(
  "./localDatabaseSyncService.js",
  import.meta.url,
);

const source = await readFile(serviceUrl, "utf8");

test("committee meeting minutes are a replicated Pi domain", () => {
  assert.ok(
    REPLICATED_DOMAINS.includes("committee_meeting_minutes"),
  );
});

test("committee minutes upsert uses sync_id and rebuilds local user id", () => {
  const start = source.indexOf(
    "async function upsertCommitteeMeetingMinuteRows",
  );

  const end = source.indexOf(
    "async function upsertBeginnersCourses",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const helper = source.slice(start, end);

  assert.match(
    helper,
    /ON CONFLICT \(sync_id\) DO UPDATE SET/,
  );

  assert.match(
    helper,
    /updated_by_user_id/,
  );

  assert.match(
    helper,
    /FROM users/,
  );

  assert.match(
    helper,
    /LOWER\(username\) = LOWER\(\$10\)/,
  );

  assert.match(
    helper,
    /\$4::jsonb/,
  );

  assert.match(
    helper,
    /\$5::jsonb/,
  );
});

test("committee minutes are optionally reconciled from snapshots", () => {
  assert.match(
    source,
    /Object\.hasOwn\(snapshot, "committeeMeetingMinutes"\)/,
  );

  assert.match(
    source,
    /snapshot\.committeeMeetingMinutes\.map[\s\S]*row\.sync_id/,
  );

  assert.match(
    source,
    /tableName: "committee_meeting_minutes"/,
  );
});

test("committee minutes incremental changes use sync_id", () => {
  assert.match(
    source,
    /case "committee_meeting_minutes":/,
  );

  assert.match(
    source,
    /DELETE FROM committee_meeting_minutes WHERE sync_id = \$1/,
  );

  assert.match(
    source,
    /upsertCommitteeMeetingMinuteRows\(client, \[change\.payload\]\)/,
  );
});
