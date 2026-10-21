import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsIntegrationService } from "./goldenRecordsIntegrationService.js";

test("connection test explains missing local Golden Records configuration", async () => {
  const service = createGoldenRecordsIntegrationService({
    authMode: "api-key",
    baseUrl: "https://api2.archery-records.net",
    apiKey: "",
  });
  const result = await service.testConnection();
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.configured, false);
  assert.match(result.summary, /GOLDEN_RECORDS_API_KEY/);
});

test("connection test reports the remote status without exposing the token", async () => {
  const originalFetch = globalThis.fetch;
  const statuses = [];
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, "Basic test-token");
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Unauthorized",
      };
    };
    const service = createGoldenRecordsIntegrationService({
      apiKey: "test-token",
      authMode: "api-key",
      baseUrl: "https://api2.archery-records.net",
    }, {
      upsertStatus: async (_key, value) => statuses.push(value),
    });
    const result = await service.testConnection();
    assert.match(result.summary, /401 Unauthorized/);
    assert.equal(result.summary.includes("test-token"), false);
    assert.equal(statuses[0].summary, result.summary);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("lookup sync combines a full page with its final page and preserves the page size", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const replacements = [];
  const statuses = [];
  try {
    globalThis.fetch = async (url) => {
      const requestUrl = new URL(url);
      requests.push(requestUrl);
      const page = Number(requestUrl.searchParams.get("pageNumber"));
      const rows = requestUrl.pathname === "/api/rounds"
        ? (page === 1
          ? Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 }))
          : [{ id: 1001 }])
        : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    };
    const service = createGoldenRecordsIntegrationService({
      apiKey: "test-token",
      authMode: "api-key",
      baseUrl: "https://example.test",
    }, {
      replaceLookup: async (value) => replacements.push(value),
      upsertStatus: async (_key, value) => statuses.push(value),
    });
    const result = await service.syncLookups({
      getUtcTimestampParts: () => ["2026-10-21", "12:00:00"],
      updatedByUsername: "records-officer",
    });
    assert.equal(result.status, "success");
    assert.equal(replacements.find((entry) => entry.lookupType === "rounds").payload.length, 1001);
    assert.deepEqual(requests.filter((url) => url.pathname === "/api/rounds").map((url) => url.searchParams.get("pageNumber")), ["1", "2"]);
    assert.ok(requests.every((url) => url.pathname === "/api/settings" || url.searchParams.get("pageSize") === "1000"));
    assert.equal(statuses.at(-1).status, "success");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed lookup page records a failure without replacing a partial collection", async () => {
  const originalFetch = globalThis.fetch;
  const replacements = [];
  const statuses = [];
  try {
    globalThis.fetch = async () => new Response("bad request", { status: 400 });
    const service = createGoldenRecordsIntegrationService({
      apiKey: "test-token",
      authMode: "api-key",
      baseUrl: "https://example.test",
    }, {
      replaceLookup: async (value) => replacements.push(value),
      upsertStatus: async (_key, value) => statuses.push(value),
    });
    await assert.rejects(service.syncLookups({
      getUtcTimestampParts: () => ["2026-10-21", "12:00:00"],
      updatedByUsername: "records-officer",
    }), /400 for \/api\/rounds/);
    assert.deepEqual(replacements, []);
    assert.equal(statuses.at(-1).status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
