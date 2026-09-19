import assert from "node:assert/strict";
import test from "node:test";

import {
  getLocalRfidStatusMessage,
  subscribeToLocalRfidBridgeScans,
} from "./localRfidBridge.js";

test("local RFID status messages distinguish each user-facing state", () => {
  assert.equal(
    getLocalRfidStatusMessage({ connectionState: "connected" }),
    "RFID reader connected",
  );
  assert.equal(
    getLocalRfidStatusMessage({ connectionState: "reader-not-connected" }),
    "RFID reader not connected",
  );
  assert.equal(
    getLocalRfidStatusMessage({ connectionState: "agent-unavailable" }),
    "RFID agent unavailable",
  );
  assert.equal(
    getLocalRfidStatusMessage({ connectionState: "local-access-blocked" }),
    "Browser access to the local RFID agent is blocked",
  );
});

test("local RFID scan events deliver a normalized card UID to the portal", async () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  let eventSource;

  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.listeners = new Map();
      eventSource = this;
    }

    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }

    close() {}

    emit(name, data) {
      this.listeners.get(name)?.({ data: JSON.stringify(data) });
    }
  }

  globalThis.window = {
    clearTimeout,
    setTimeout,
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      pcscAvailable: true,
      readerCount: 1,
      readers: ["ACS ACR122 0"],
    }),
  });
  globalThis.EventSource = FakeEventSource;

  try {
    const received = new Promise((resolve) => {
      const unsubscribe = subscribeToLocalRfidBridgeScans((scan) => {
        unsubscribe();
        resolve(scan);
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(eventSource.url, "http://127.0.0.1:8765/events");
    eventSource.emit("scan", {
      sequence: 4,
      uid: "a1b2c3d4",
      reader: "ACS ACR122 0",
    });

    const scan = await received;
    assert.equal(typeof scan.scannedAt, "string");
    assert.deepEqual({ ...scan, scannedAt: "timestamp" }, {
      sequence: 4,
      rfidTag: "A1B2C3D4",
      scannedAt: "timestamp",
      source: "local-reader-bridge",
      reader: "ACS ACR122 0",
      atr: null,
      scanType: "rfid",
    });
  } finally {
    globalThis.window = originalWindow;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
  }
});

test("denied browser local access is reported separately from an unavailable agent", async () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;

  globalThis.window = {
    clearTimeout,
    setTimeout,
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      permissions: {
        query: async ({ name }) => ({
          state: name === "local-network-access" ? "denied" : "prompt",
        }),
      },
    },
  });
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  globalThis.EventSource = class {};

  try {
    const status = await new Promise((resolve) => {
      const unsubscribe = subscribeToLocalRfidBridgeScans(() => {}, {
        onStatus: (nextStatus) => {
          unsubscribe();
          resolve(nextStatus);
        },
      });
    });

    assert.equal(status.connectionState, "local-access-blocked");
    assert.equal(status.localAccessBlocked, true);
  } finally {
    globalThis.window = originalWindow;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
  }
});
