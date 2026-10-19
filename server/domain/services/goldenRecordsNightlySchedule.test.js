import assert from "node:assert/strict";
import test from "node:test";
import { getGoldenRecordsNightlyDate } from "./goldenRecordsNightlySchedule.js";

test("nightly slot follows London GMT and BST", () => {
  assert.equal(getGoldenRecordsNightlyDate("2026-01-12T01:00:00Z"), "2026-01-12");
  assert.equal(getGoldenRecordsNightlyDate("2026-07-12T00:00:00Z"), "2026-07-12");
  assert.equal(getGoldenRecordsNightlyDate("2026-01-12T00:00:00Z"), null);
  assert.equal(getGoldenRecordsNightlyDate("2026-07-12T01:00:00Z"), null);
});

test("spring clock gap runs at the first valid London hour and autumn repeats share a date", () => {
  assert.equal(getGoldenRecordsNightlyDate("2026-03-29T01:00:00Z"), "2026-03-29");
  assert.equal(getGoldenRecordsNightlyDate("2026-03-29T00:00:00Z"), null);
  assert.equal(getGoldenRecordsNightlyDate("2026-10-25T00:00:00Z"), "2026-10-25");
  assert.equal(getGoldenRecordsNightlyDate("2026-10-25T01:00:00Z"), "2026-10-25");
  assert.equal(getGoldenRecordsNightlyDate("invalid"), null);
});
