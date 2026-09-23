import assert from "node:assert/strict";
import test from "node:test";
import { deriveGoldenRecordsAchievements } from "./goldenRecordsAchievements.js";

for (const [source, count] of [["252@20YDS/3", 3], ["252@30YDS/2", 2], ["252@70M/4", 4]]) {
  test(`${source} implies each lower level with provenance and no duplicates`, () => {
    const row = { achievement: source, achievementId: "source", memberId: "1", bowClass: "Recurve" };
    const statuses = deriveGoldenRecordsAchievements([row, row]);
    assert.equal(statuses.length, count);
    assert.equal(statuses[0].derived, false);
    assert.ok(statuses.slice(1).every((entry) => entry.derived && entry.derived_from === "source"));
    assert.deepEqual(new Set(statuses.map((entry) => entry.achievement)), new Set(Array.from({length: count}, (_, index) => source.replace(/\d+$/, String(index + 1)))));
  });
}

test("explicit lower levels retain their own dates and provenance", () => {
  const rows = [
    { achievement: "252@20YDS/3", achievementId: "third" },
    { achievement: "252@20YDS/1", achievementId: "first", achieved: "2026-01-01" },
  ];
  const statuses = deriveGoldenRecordsAchievements(rows);
  assert.equal(statuses.length, 3);
  assert.equal(statuses.find((row) => row.achievement.endsWith("/1")).derived, false);
  assert.equal(statuses.find((row) => row.achievement.endsWith("/1")).achieved, "2026-01-01");
  assert.deepEqual(deriveGoldenRecordsAchievements(rows), statuses);
});
