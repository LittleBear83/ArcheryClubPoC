import assert from "node:assert/strict";
import test from "node:test";
import { groupHandicapRounds } from "./groupHandicapRounds.js";

const table = (title) => ({ tableKey: title, title, rows: [] });

test("indoor face variants appear once in the round list but retain both score tables", () => {
  const groups = groupHandicapRounds([
    table("Non-Compound Portsmouth Full size"),
    table("Non-Compound Portsmouth Triple"),
    table("All Bows Worcester Full size"),
    table("All Bows Worcester 5-spot"),
    table("Non-Compound Bray I Full size"),
    table("Non-Compound Bray II Full size"),
  ], "indoor-allowances");
  assert.deepEqual(groups.map((group) => group.label), [
    "Non-Compound Portsmouth", "All Bows Worcester", "Non-Compound Bray I", "Non-Compound Bray II",
  ]);
  assert.equal(groups[0].tables.length, 2);
  assert.equal(groups[1].tables.length, 2);
});

test("distinct outdoor and metric rounds remain separate", () => {
  const outdoor = groupHandicapRounds([table("Windsor"), table("Windsor 50"), table("Windsor 40")], "outdoor-allowances");
  const metric = groupHandicapRounds([table("Metric I"), table("Metric II"), table("WA 70m")], "metric-allowances");
  assert.equal(outdoor.length, 3);
  assert.equal(metric.length, 3);
});
