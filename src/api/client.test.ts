import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchApi } from "./client.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
