import assert from "node:assert/strict";
import test from "node:test";
import { derive252SignOffDates } from "../../../shared/award252Progression.js";
import {
  applyGoldenRecordsAchievementsToEntry,
  getGoldenRecords252AwardKey,
  mapGoldenRecordsBowClassToOutdoorBowType,
} from "./goldenRecordsOutdoorMapping.js";

test("shared outdoor mapping recognises canonical and legacy award names", () => {
  assert.equal(mapGoldenRecordsBowClassToOutdoorBowType("Recurve"), "Rec");
  assert.equal(mapGoldenRecordsBowClassToOutdoorBowType("Barebow"), "B/bow");
  assert.equal(getGoldenRecords252AwardKey({ achievementName: "252 White", roundName: "" }), "award25220");
  assert.equal(getGoldenRecords252AwardKey({ achievementName: "252@ 30 yds/2", roundName: "" }), "award25230");
  assert.equal(getGoldenRecords252AwardKey({ achievementName: "", roundName: "252 - 40 yds" }), "award25240");
});

test("shared mapping preserves the legacy 252 progression rule when requested", () => {
  const achievements = [{
    achievement: "252@ 20 yds/3",
    achieved: "2026-06-01T12:00:00Z",
    round: "",
  }];
  const defaultResult = applyGoldenRecordsAchievementsToEntry({}, achievements);
  const legacyResult = applyGoldenRecordsAchievementsToEntry(
    {},
    achievements,
    (dates) => derive252SignOffDates(dates).filter(Boolean).length >= 3,
  );
  assert.equal(defaultResult.entry.award25220, false);
  assert.equal(legacyResult.entry.award25220, true);
  assert.deepEqual(legacyResult.entry.award25220SignOffDates, ["", "", "2026-06-01"]);
});
