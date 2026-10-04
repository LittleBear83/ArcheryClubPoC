import assert from "node:assert/strict";
import test from "node:test";
import { startRfidBridgeConsumer } from "./rfidBridgeConsumer.js";

const scan = JSON.stringify({ uid: "9E23215E", sequence: 1, instanceId: "start-1",
  reader: "ACS ACR122U 00 00", scannedAt: "2026-10-04T12:00:00Z" });

async function eventually(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Condition was not reached");
}

test("consumer reconnects after startup failure and stream disconnect, rejects malformed events", async () => {
  const received = [];
  const logs = [];
  let attempts = 0;
  const fetchImpl = async (_url, { signal }) => {
    attempts += 1;
    if (attempts === 1) throw new Error("bridge down");
    const payload = attempts === 2
      ? `event: scan\ndata: not-json\n\nevent: scan\ndata: ${scan}\n\n`
      : `event: scan\ndata: ${scan}\n\n`;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    signal.addEventListener("abort", () => undefined);
    return { ok: true, body };
  };
  const stop = startRfidBridgeConsumer({
    fetchImpl, retryMs: 5,
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message),
      error: (message) => logs.push(message) },
    processRfidCheckIn: async (value) => {
      received.push(value);
      return { status: 200, created: true, user: { username: "archer" } };
    },
  });
  try {
    await eventually(() => attempts >= 3 && received.length >= 2);
    assert.equal(received[0].rfidTag, "9E23215E");
    assert.equal(received[0].scan.instanceId, "start-1");
    assert.ok(logs.includes("RFID scan rejected: malformed bridge event"));
    assert.ok(logs.includes("Local RFID bridge consumer connected"));
    assert.ok(logs.some((message) => message.includes("disconnected/retrying")));
    assert.doesNotMatch(JSON.stringify(logs), /9E23215E/);
  } finally {
    stop();
  }
});
