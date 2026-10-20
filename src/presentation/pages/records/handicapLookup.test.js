import assert from "node:assert/strict";
import test from "node:test";
import { findHandicapReferenceScores } from "./handicapLookup.js";

test("handicap lookup matches exact whole-number values across related tables", () => {
  const primary = { tableKey: "primary", title: "Primary", rows: [
    { handicapValue: 0, referenceScore: 600 }, { handicapValue: 12, referenceScore: 450 },
  ] };
  const related = { tableKey: "related", title: "Related", rows: [
    { handicapValue: 12, referenceScore: 420 },
  ] };
  assert.deepEqual(findHandicapReferenceScores("12", primary, [primary, related]), {
    status: "found", handicap: 12, scores: [
      { tableKey: "primary", title: "Primary", score: 450 },
      { tableKey: "related", title: "Related", score: 420 },
    ],
  });
  assert.equal(findHandicapReferenceScores("0", primary, [primary]).status, "found");
  assert.equal(findHandicapReferenceScores("", primary, [primary]).status, "empty");
  assert.equal(findHandicapReferenceScores("12.5", primary, [primary]).status, "invalid");
  assert.equal(findHandicapReferenceScores("-1", primary, [primary]).status, "invalid");
  assert.equal(findHandicapReferenceScores("13", primary, [primary]).status, "missing");
});
