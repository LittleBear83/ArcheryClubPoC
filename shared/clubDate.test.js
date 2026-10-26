import assert from "node:assert/strict";
import test from "node:test";
import { getClubTodayDate } from "./clubDate.js";

test("club date follows London clock across GMT and BST", () => {
  assert.equal(getClubTodayDate(new Date("2026-10-26T00:30:00Z")), "2026-10-26");
  assert.equal(getClubTodayDate(new Date("2026-07-01T23:30:00Z")), "2026-07-02");
});
