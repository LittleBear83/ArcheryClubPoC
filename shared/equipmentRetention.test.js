import assert from "node:assert/strict";
import test from "node:test";
import {
  isEquipmentWithinFrontendRetention,
  partitionEquipmentRegisterItems,
} from "./equipmentRetention.js";

test("decommissioned equipment leaves frontend tables on its 18-month anniversary", () => {
  const retired = { status: "decommissioned", decommissionedAt: "2025-01-31 12:00:00" };
  assert.equal(isEquipmentWithinFrontendRetention(retired, "2026-07-30"), true);
  assert.equal(isEquipmentWithinFrontendRetention(retired, "2026-07-31"), false);
  assert.equal(isEquipmentWithinFrontendRetention({ ...retired, status: "active" }, "2026-07-31"), true);
});

test("month-end dates clamp to the final day and undated legacy records stay visible", () => {
  const retired = { status: "decommissioned", decommissioned_at_date: "2024-08-31" };
  assert.equal(isEquipmentWithinFrontendRetention(retired, "2026-02-27"), true);
  assert.equal(isEquipmentWithinFrontendRetention(retired, "2026-02-28"), false);
  assert.equal(isEquipmentWithinFrontendRetention({ status: "decommissioned" }, "2030-01-01"), true);
});

test("the register separates current and retained retired items and sorts retirement newest first", () => {
  const items = [
    { id: 1, status: "active" },
    { id: 2, status: "decommissioned", decommissionedAt: "2025-01-31" },
    { id: 3, status: "decommissioned", decommissionedAt: "2026-06-01" },
    { id: 4, status: "decommissioned", decommissionedAt: "2026-05-01" },
  ];
  const result = partitionEquipmentRegisterItems(items, "2026-07-31");
  assert.deepEqual(result.current.map((item) => item.id), [1]);
  assert.deepEqual(result.decommissioned.map((item) => item.id), [3, 4]);
  assert.equal(items.length, 4);
});
