import assert from "node:assert/strict";
import test from "node:test";
import { derive252SignOffDates, find252CompletionSignOffDistance } from "./award252Progression.js";

test("a second or third 252 round implies missing earlier rounds", () => {
  assert.deepEqual(derive252SignOffDates(["", "2026-05-02", ""]), ["2026-05-02", "2026-05-02", ""]);
  assert.deepEqual(derive252SignOffDates(["", "", "2026-05-03"]), ["2026-05-03", "2026-05-03", "2026-05-03"]);
});

test("explicit earlier 252 dates remain intact and source dates are not changed", () => {
  const dates = ["2026-05-01", "", "2026-05-03"];
  assert.deepEqual(derive252SignOffDates(dates), ["2026-05-01", "2026-05-03", "2026-05-03"]);
  assert.deepEqual(dates, ["2026-05-01", "", "2026-05-03"]);
});

test("a 40 yard signoff establishes completed 252 rounds at 20 and 30 yards only", () => {
  const recurveSignOffs = [20, 30, 40];
  assert.equal(find252CompletionSignOffDistance(20, recurveSignOffs), 30);
  assert.equal(find252CompletionSignOffDistance(30, recurveSignOffs), 40);
  assert.equal(find252CompletionSignOffDistance(40, recurveSignOffs), null);
  assert.equal(find252CompletionSignOffDistance(50, recurveSignOffs), null);
});

