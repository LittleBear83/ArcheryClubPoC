import assert from "node:assert/strict";
import test from "node:test";
import { getRfidScanEventId } from "./rfidScanIdentity.js";

test("bridge scan identity is stable across consumers and distinct after a bridge restart", () => {
  const input = { machineId: "pi-1", rfidTag: "9e23215e", scan: {
    instanceId: "bridge-1", sequence: 1, scannedAt: "2026-10-04T12:00:00Z",
    reader: "ACS ACR122U 00 00",
  } };
  const first = getRfidScanEventId(input);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(first, getRfidScanEventId({ ...input, rfidTag: "9E23215E" }));
  assert.equal(first, getRfidScanEventId({ ...input, machineId: null }));
  assert.notEqual(first, getRfidScanEventId({ ...input, scan: { ...input.scan, sequence: 2 } }));
  assert.notEqual(first, getRfidScanEventId({ ...input, scan: { ...input.scan, instanceId: "bridge-2" } }));
});
