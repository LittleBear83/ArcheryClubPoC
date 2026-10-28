import assert from "node:assert/strict";
import test from "node:test";
import { canQuickCreateEvent, resolveEventCreationDate } from "./eventCreationDate.ts";

test("selected and double-clicked dates stay on the chosen UK calendar day", () => {
  const now = new Date("2026-07-01T23:30:00Z"); // 2 July in London
  assert.equal(resolveEventCreationDate("2026-11-15", now), "2026-11-15");
  assert.equal(resolveEventCreationDate("2026-12-01", now), "2026-12-01");
  assert.equal(resolveEventCreationDate("2026-03-29", now), "2026-03-29");
  assert.equal(resolveEventCreationDate("2026-10-25", now), "2026-10-25");
  assert.equal(resolveEventCreationDate(null, now), "2026-07-02");
});

test("invalid or absent selected dates fall back to London today", () => {
  const now = new Date("2026-10-31T23:30:00Z"); // 31 October in London
  for (const invalid of [undefined, "", "2026-02-30", "2026-13-01", "2026-11-00", "not-a-date"]) {
    assert.equal(resolveEventCreationDate(invalid, now), "2026-10-31");
  }
});

test("quick creation requires existing add_events permission and a valid day", () => {
  assert.equal(canQuickCreateEvent(true, "2026-11-15"), true);
  assert.equal(canQuickCreateEvent(false, "2026-11-15"), false);
  assert.equal(canQuickCreateEvent(true, null), false);
  assert.equal(canQuickCreateEvent(true, "2026-02-30"), false);
});
