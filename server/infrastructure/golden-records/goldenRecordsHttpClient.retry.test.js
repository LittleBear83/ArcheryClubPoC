import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";

test("Golden Records client retries rate limits and transient errors, then returns the response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return { status: 429, headers: { get: () => "0" }, body: { cancel: async () => {} } };
    if (calls === 2) throw new TypeError("temporary network failure");
    return { ok: true, status: 200, statusText: "OK", text: async () => '{"items":[]}' };
  };
  try {
    const result = await createGoldenRecordsHttpClient({ apiKey: "test", retryDelayMs: 0 }).getJson("/test");
    assert.equal(calls, 3);
    assert.deepEqual(result.body, { items: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Golden Records client stops after bounded retries and does not retry authentication errors", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 503, statusText: "Unavailable", text: async () => "unavailable" }; };
  try {
    const result = await createGoldenRecordsHttpClient({ apiKey: "test", retryDelayMs: 0 }).getJson("/test");
    assert.equal(result.status, 503);
    assert.equal(calls, 3);
    calls = 0;
    globalThis.fetch = async () => { calls++; return { ok: false, status: 401, statusText: "Unauthorized", text: async () => "denied" }; };
    assert.equal((await createGoldenRecordsHttpClient({ apiKey: "test", retryDelayMs: 0 }).getJson("/test")).status, 401);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Golden Records client retries a timed-out request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, { signal }) => {
    calls++;
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("timed out", "AbortError")), { once: true });
      });
    }
    return { ok: true, status: 200, statusText: "OK", text: async () => "{}" };
  };
  try {
    const result = await createGoldenRecordsHttpClient({ apiKey: "test", timeoutMs: 1, retryDelayMs: 0 }).getJson("/test");
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
