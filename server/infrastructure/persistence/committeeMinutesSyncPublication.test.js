import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const gatewayUrl = new URL(
  "./syncGateway.js",
  import.meta.url,
);

const source = await readFile(gatewayUrl, "utf8");

test("committee meeting minutes are included in synced domains", () => {
  assert.match(
    source,
    /"committee_meeting_minutes"/,
  );
});

test("committee meeting minutes snapshot uses portable identity", () => {
  const start = source.indexOf(
    "const committeeMeetingMinutes = await snapshotClient.query",
  );

  const end = source.indexOf(
    "const committeeRoles = await snapshotClient.query",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const query = source.slice(start, end);

  assert.match(query, /\bsync_id\b/);
  assert.match(query, /\bmeeting_date\b/);
  assert.match(query, /\btitle\b/);
  assert.match(query, /\bsections_json\b/);
  assert.match(query, /\bactions_json\b/);
  assert.match(query, /\bcreated_at_date\b/);
  assert.match(query, /\bcreated_at_time\b/);
  assert.match(query, /\bupdated_at_date\b/);
  assert.match(query, /\bupdated_at_time\b/);
  assert.match(query, /\bupdated_by_username\b/);

  assert.doesNotMatch(
    query,
    /^\s*id\s*,?\s*$/m,
  );

  assert.doesNotMatch(
    query,
    /\bupdated_by_user_id\b/,
  );
});

test("committee meeting minutes are returned in publication snapshot", () => {
  assert.match(
    source,
    /committeeMeetingMinutes:\s*committeeMeetingMinutes\.rows/,
  );
});
