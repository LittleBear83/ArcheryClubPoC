import assert from "node:assert/strict";
import test from "node:test";
import { aggregateIndoorTableRows } from "./aggregateIndoorTableRows.js";

test("one member and bowstyle row retains every distinct dated indoor award", () => {
  const rows = [
    { id: 1, archerUsername: "Cfleetham", bowType: "Rec", seasonYear: 2024,
      handicap: 44, classifications: {}, scores: { 300: "2024-09-24", 400: "2025-03-20" } },
    { id: 2, archerUsername: "cfleetham", bowType: "Rec", seasonYear: 2026,
      handicap: 31, classifications: {}, scores: { 400: "2026-10-01" } },
    { id: 3, archerUsername: "other", bowType: "Rec", seasonYear: 2024,
      handicap: null, classifications: {}, scores: { 300: "2024-11-01" } },
  ];
  const combined = aggregateIndoorTableRows(rows);
  assert.equal(combined.length, 2);
  assert.equal(combined[0].id, 2);
  assert.equal(combined[0].handicap, 31);
  assert.equal(combined[0].scores[300], "2024-09-24");
  assert.deepEqual(combined[0].scoreDates[400], ["2025-03-20", "2026-10-01"]);
  assert.deepEqual(combined[1].scoreDates[300], ["2024-11-01"]);
  assert.equal(rows[0].scores[400], "2025-03-20");
});
