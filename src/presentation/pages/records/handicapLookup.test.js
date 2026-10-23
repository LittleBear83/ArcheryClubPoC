import assert from "node:assert/strict";
import test from "node:test";
import { calculateHandicapLookupScores, findHandicapReferenceScores } from "./handicapLookup.js";

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

test("lookup applies the percentage to each allowance before adding the archer score", () => {
  const tables = [
    { tableKey: "one", title: "One", rows: [{ handicapValue: 12, referenceScore: 200 }] },
    { tableKey: "two", title: "Two", rows: [{ handicapValue: 12, referenceScore: 201 }] },
  ];
  const lookup = findHandicapReferenceScores("12", tables[0], tables);
  assert.deepEqual(calculateHandicapLookupScores(lookup, "500", "0").scores, [
    { tableKey: "one", adjustedAllowance: 0, adjustedScore: 500 },
    { tableKey: "two", adjustedAllowance: 0, adjustedScore: 500 },
  ]);
  assert.deepEqual(calculateHandicapLookupScores(lookup, "500", "95").scores, [
    { tableKey: "one", adjustedAllowance: 190, adjustedScore: 690 },
    { tableKey: "two", adjustedAllowance: 191, adjustedScore: 691 },
  ]);
  assert.deepEqual(calculateHandicapLookupScores(lookup, "500", "100").scores, [
    { tableKey: "one", adjustedAllowance: 200, adjustedScore: 700 },
    { tableKey: "two", adjustedAllowance: 201, adjustedScore: 701 },
  ]);
  assert.deepEqual(calculateHandicapLookupScores(lookup, "500", "95.5").scores, [
    { tableKey: "one", adjustedAllowance: 191, adjustedScore: 691 },
    { tableKey: "two", adjustedAllowance: 192, adjustedScore: 692 },
  ]);
});

test("lookup leaves missing allowances unavailable and validates entered values", () => {
  const table = { tableKey: "one", title: "One", rows: [{ handicapValue: 12, referenceScore: null }] };
  const lookup = findHandicapReferenceScores("12", table, [table]);
  assert.deepEqual(calculateHandicapLookupScores(lookup, "500", "95").scores, [
    { tableKey: "one", adjustedAllowance: null, adjustedScore: null },
  ]);
  assert.equal(calculateHandicapLookupScores(lookup, "", "95").status, "empty");
  for (const score of ["-1", "1.5", "not a score"]) {
    assert.equal(calculateHandicapLookupScores(lookup, score, "95").status, "invalid-score");
  }
  for (const percent of ["", "-0.1", "100.1", "not a percentage"]) {
    assert.equal(calculateHandicapLookupScores(lookup, "500", percent).status, "invalid-percent");
  }
});
