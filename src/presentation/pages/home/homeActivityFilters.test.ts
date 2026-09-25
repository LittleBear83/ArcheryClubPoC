import assert from "node:assert/strict";
import test from "node:test";
import {
  filterHomeActivityCurrentOrUpcoming,
  isHomeActivityCurrentOrUpcoming,
} from "./homeActivityFilters";

test("past dated home activity items are hidden", () => {
  const now = new Date("2026-07-28T12:00:00");

  assert.equal(
    isHomeActivityCurrentOrUpcoming(
      {
        date: "2026-07-27",
      },
      now,
    ),
    false,
  );
});

test("same-day events remain visible until their end time", () => {
  const now = new Date("2026-07-28T12:00:00");

  assert.equal(
    isHomeActivityCurrentOrUpcoming(
      {
        date: "2026-07-28",
        startTime: "10:00",
        endTime: "12:30",
      },
      now,
    ),
    true,
  );

  assert.equal(
    isHomeActivityCurrentOrUpcoming(
      {
        date: "2026-07-28",
        startTime: "10:00",
        endTime: "11:30",
      },
      now,
    ),
    false,
  );
});

test("same-day reminders without a time remain visible for the whole day", () => {
  const now = new Date("2026-07-28T22:00:00");

  assert.equal(
    isHomeActivityCurrentOrUpcoming(
      {
        date: "2026-07-28",
      },
      now,
    ),
    true,
  );
});

test("home activity filtering keeps only current and future items", () => {
  const now = new Date("2026-07-28T12:00:00");

  const filtered = filterHomeActivityCurrentOrUpcoming(
    [
      { date: "2026-07-27", id: "past" },
      { date: "2026-07-28", endTime: "12:30", id: "current" },
      { date: "2026-07-29", id: "future" },
    ],
    now,
  );

  assert.deepEqual(filtered, [
    { date: "2026-07-28", endTime: "12:30", id: "current" },
    { date: "2026-07-29", id: "future" },
  ]);
});

test("local end-time boundaries, day rollover and cancellations", () => {
  const event = { date: "2026-07-28", startTime: "14:00", endTime: "16:00" };
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 28, 15, 0)), true);
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 28, 16, 0)), true);
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 28, 16, 0, 1)), false);
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 28, 16, 1)), false);
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 29, 0, 0)), false);
  assert.equal(isHomeActivityCurrentOrUpcoming(event, new Date(2026, 6, 27, 23, 59)), true);
  assert.equal(isHomeActivityCurrentOrUpcoming({ ...event, isCancelled: true }, new Date(2026, 6, 27)), false);
});
