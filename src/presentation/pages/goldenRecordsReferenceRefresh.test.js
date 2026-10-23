import assert from "node:assert/strict";
import test from "node:test";
import { refreshGoldenRecordsReferenceData } from "./goldenRecordsReferenceRefresh.js";

test("reference refresh checks the connection before updating lookup data", async () => {
  const calls = [];
  const result = await refreshGoldenRecordsReferenceData(
    async () => { calls.push("check"); return { health: { ok: true } }; },
    async () => { calls.push("refresh"); return { message: "Updated" }; },
  );
  assert.deepEqual(calls, ["check", "refresh"]);
  assert.equal(result.message, "Updated");
});

test("reference refresh leaves lookup data untouched when the connection check fails", async () => {
  let refreshed = false;
  await assert.rejects(() => refreshGoldenRecordsReferenceData(
    async () => ({ health: { ok: false }, message: "Connection failed" }),
    async () => { refreshed = true; },
  ), /Connection failed/);
  assert.equal(refreshed, false);
});
