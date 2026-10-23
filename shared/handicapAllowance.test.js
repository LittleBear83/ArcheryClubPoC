import assert from "node:assert/strict";
import test from "node:test";
import { applyHandicapAllowancePercent, DEFAULT_HANDICAP_ALLOWANCE_PERCENT } from "./handicapAllowance.js";

test("handicap allowance percentage preserves full allowance and rounds adjusted points", () => {
  assert.equal(DEFAULT_HANDICAP_ALLOWANCE_PERCENT, 100);
  assert.equal(applyHandicapAllowancePercent(200, 0), 0);
  assert.equal(applyHandicapAllowancePercent(200, 95), 190);
  assert.equal(applyHandicapAllowancePercent(200, 100), 200);
  assert.equal(applyHandicapAllowancePercent(201, 95.5), 192);
  assert.equal(applyHandicapAllowancePercent(5, 50), 3);
});

test("handicap allowance percentage rejects values outside scoring rules", () => {
  for (const percent of [-0.1, 100.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(applyHandicapAllowancePercent(200, percent), null);
  }
  assert.equal(applyHandicapAllowancePercent(-1, 95), null);
  assert.equal(applyHandicapAllowancePercent(1.5, 95), null);
});
