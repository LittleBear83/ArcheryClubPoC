import assert from "node:assert/strict";
import test from "node:test";
import { indoorSeasonYear, mapIndoorEvidence } from "./goldenRecordsIndoorMapping.js";

const scores = [300, 325, 350, 375, 400, 425, 450, 475, 500, 525, 550, 575, 580, 585, 590, 595, 600];
const classes = [
  ["Indoor Archer 3rd Class", "archer3rd"], ["Indoor Archer 2nd Class", "archer2nd"],
  ["Indoor Archer 1st Class", "archer1st"], ["Indoor Bowman 3rd Class", "bowman3rd"],
  ["Indoor Bowman 2nd Class", "bowman2nd"], ["Indoor Bowman 1st Class", "bowman1st"],
  ["Indoor MB", "indoorMasterBowman"],
];
const bow = (value) => ({ Recurve: "Rec", Compound: "Comp", Barebow: "B/bow", Longbow: "L/bow" })[value] ?? "";

test("indoor seasons start in July and all explicit Portsmouth score labels map", () => {
  assert.equal(indoorSeasonYear("2026-06-30"), 2025);
  assert.equal(indoorSeasonYear("2026-07-01"), 2026);
  assert.equal(indoorSeasonYear("not-a-date"), null);
  const snapshot = { achievements: scores.map((score) => ({
    memberId: "gr-1", bowClass: "Recurve", achievement: `Portsmouth ${score}`,
    round: "Portsmouth", achieved: "2026-10-01",
  })) };
  const result = mapIndoorEvidence(snapshot, "gr-1", bow, new Set(["Rec"]));
  assert.deepEqual(Object.keys(result.bySeason.get("2026:Rec").scores).map(Number).sort((a, b) => a - b), scores);
});

test("verified indoor classifications map by bow, member and achieved season", () => {
  const snapshot = { indoorClassifications: classes.map(([classification], index) => ({
    memberId: "gr-1", bowClass: index % 2 ? "Compound" : "Recurve",
    type: "Indoor", classification, achieved: "2026-06-25",
  })).concat([
    { memberId: "other", bowClass: "Recurve", type: "Indoor", classification: "Indoor Archer 1st Class", achieved: "2026-10-01" },
    { memberId: "gr-1", bowClass: "Recurve", type: "Outdoor", classification: "Archer 3rd Class", achieved: "2026-10-01" },
  ]) };
  const result = mapIndoorEvidence(snapshot, "gr-1", bow, new Set(["Rec", "Comp"]));
  for (const [index, [, key]] of classes.entries()) {
    assert.equal(result.bySeason.get(`2025:${index % 2 ? "Comp" : "Rec"}`).classifications[key], "2026-06-25");
  }
  assert.equal(result.bySeason.has("2026:Rec"), false);
});

test("unrelated scores, unverified classifications, wrong member and bow are not awarded", () => {
  const result = mapIndoorEvidence({
    achievements: [
      { memberId: "gr-1", bowClass: "Recurve", achievement: "Portsmouth 500", round: "Vegas 300", achieved: "2026-10-01" },
      { memberId: "gr-1", bowClass: "Recurve", achievement: "Portsmouth 500", round: "Portsmouth", achieved: "" },
      { memberId: "other", bowClass: "Recurve", achievement: "Portsmouth 500", round: "Portsmouth", achieved: "2026-10-01" },
      { memberId: "gr-1", bowClass: "Barebow", achievement: "Portsmouth 500", round: "Portsmouth", achieved: "2026-10-01" },
    ],
    indoorClassifications: [{ memberId: "gr-1", bowClass: "Recurve", type: "Indoor", classification: "Indoor GMB", achieved: "2026-10-01" }],
  }, "gr-1", bow, new Set(["Rec"]));
  assert.equal(result.bySeason.size, 0);
  assert.ok(result.unmapped.some((row) => row.label === "Indoor GMB"));
});
