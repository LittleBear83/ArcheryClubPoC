import assert from "node:assert/strict";
import test from "node:test";
import { findKnownHandicap, getMemberBowOptions, tableMatchesMemberBow } from "./handicapMemberDefaults.js";

test("profile bows become the selectable disciplines", () => {
  assert.deepEqual(getMemberBowOptions(["Long Bow", "Recurve Bow", "Unknown"]), [
    { value: "recurve", label: "Recurve" }, { value: "longbow", label: "Longbow" },
  ]);
});

test("shared and bow-specific tables remain available to the relevant bows", () => {
  assert.equal(tableMatchesMemberBow("Non-Compound Portsmouth", "recurve"), true);
  assert.equal(tableMatchesMemberBow("Non-Compound Portsmouth", "barebow"), true);
  assert.equal(tableMatchesMemberBow("Non-Compound Portsmouth", "compound"), false);
  assert.equal(tableMatchesMemberBow("All Bows Worcester", "compound"), true);
  assert.equal(tableMatchesMemberBow("WA 50m (Barebow)", "recurve"), false);
  assert.equal(tableMatchesMemberBow("WA 50m (Compound)", "compound"), true);
  assert.equal(tableMatchesMemberBow("York", "longbow"), true);
});

test("known handicap follows table family and bow, preferring Golden Records over local rows", () => {
  const values = {
    bow: "recurve", familyKey: "indoor-allowances", username: "member",
    handicaps: [
      { bowClass: "Recurve", type: "Indoor Handicap", handicap: 42 },
      { bowClass: "Recurve", type: "Outdoor Handicap", handicap: 35 },
    ],
    indoorRows: [{ archerUsername: "member", bowType: "Rec", handicap: 45 }],
    outdoorRows: [{ archerUsername: "member", bowType: "Rec", handicap: 38 }],
  };
  assert.equal(findKnownHandicap(values), 42);
  assert.equal(findKnownHandicap({ ...values, familyKey: "metric-allowances" }), 35);
  assert.equal(findKnownHandicap({ ...values, handicaps: [] }), 45);
  assert.equal(findKnownHandicap({ ...values, bow: "longbow" }), null);
  assert.equal(findKnownHandicap({ ...values, handicaps: [{ bowClass: "Recurve", type: "Indoor", handicap: null }] }), 45);
  assert.equal(findKnownHandicap({ ...values, handicaps: [], indoorRows: [
    { archerUsername: "someone-else", bowType: "Rec", handicap: 12 },
    { archerUsername: "member", bowType: "Comp", handicap: 20 },
  ] }), null);
  assert.equal(findKnownHandicap({ ...values, handicaps: [
    { bowClass: "Recurve", type: "Indoor", handicap: 0 },
  ] }), 0);
});
