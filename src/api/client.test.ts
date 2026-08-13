import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchApi } from "./client.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

test("fetchApi returns successful JSON envelopes", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: true, value: 42 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });

  const result = await fetchApi<{ success: true; value: number }>("/api/example");

  assert.deepEqual(result, { success: true, value: 42 });
});

test("fetchApi surfaces API message failures", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, message: "Nope" }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });

  await assert.rejects(
    () => fetchApi("/api/example"),
    /Nope/,
  );
});

test("fetchApi explains non-JSON responses", async () => {
  globalThis.fetch = async () =>
    new Response("<!doctype html><title>Missing</title>", {
      headers: { "content-type": "text/html" },
      status: 404,
      statusText: "Not Found",
    });

  await assert.rejects(
    () => fetchApi("/api/example"),
    /unexpected response \(404 Not Found\)/,
  );
});

test("fetchApi turns gateway failures into a service-unavailable message", async () => {
  globalThis.window = {
    location: {
      port: "5173",
    },
  } as Window & typeof globalThis;

  globalThis.fetch = async () =>
    new Response("Bad Gateway", {
      headers: { "content-type": "text/html" },
      status: 502,
      statusText: "Bad Gateway",
    });

  await assert.rejects(
    () => fetchApi("/api/example"),
    /API service is unavailable/,
  );
});

test("fetchApi explains how to recover from local API network failures", async () => {
  globalThis.window = {
    location: {
      port: "5173",
    },
  } as Window & typeof globalThis;

  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(
    () => fetchApi("/api/example"),
    /npm run dev:full/,
  );
});
