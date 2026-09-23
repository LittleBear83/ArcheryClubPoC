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
