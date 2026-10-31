import assert from "node:assert/strict";
import test from "node:test";
import { formatGoldenRecordsSyncHeading } from "./goldenRecordsSyncHeading.js";

test("collapsed club sync heading shows the queued or started attempt in London time", () => {
  assert.equal(formatGoldenRecordsSyncHeading(null), "Not run");
  assert.equal(formatGoldenRecordsSyncHeading({ state: "queued", queuedAt: "2026-07-01T12:00:00Z" }),
    "queued · Last Attempt: 01 Jul 2026, 13:00 BST");
  assert.equal(formatGoldenRecordsSyncHeading({
    state: "completed-with-errors", queuedAt: "2026-10-31T08:00:00Z",
    startedAt: "2026-10-31T09:00:00Z", completedAt: "2026-10-31T09:30:00Z",
  }), "completed-with-errors · Last Attempt: 31 Oct 2026, 09:00 GMT");
});
