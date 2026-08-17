import { createGoldenRecordsHttpClient } from "./goldenRecordsHttpClient.js";

const LOOKUP_DEFINITIONS = [
  { key: "rounds", path: "/api/rounds", paginated: true },
  { key: "classes", path: "/api/classes", paginated: true },
  { key: "age-groups", path: "/api/age-groups", paginated: true },
  { key: "types", path: "/api/types", paginated: true },
  { key: "settings", path: "/api/settings", paginated: false },
];
const STATUS_KEYS = {
  connection: "connection-test",
  lookupSync: "lookup-sync",
};
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 100;
const MIN_REQUEST_GAP_MS = 1_100;

function isRuntimeEnabled({
  apiKey,
  authMode,
  baseUrl,
  password,
  username,
} = {}) {
  const trimmedBaseUrl = String(baseUrl ?? "").trim();
  const normalizedMode = String(authMode ?? "").trim().toLowerCase();
  const hasApiKey = Boolean(String(apiKey ?? "").trim());
  const hasMemberCredentials =
    Boolean(String(username ?? "").trim()) && Boolean(String(password ?? ""));

  return (
    Boolean(trimmedBaseUrl) &&
    ((normalizedMode === "member-credentials" && hasMemberCredentials) ||
      (normalizedMode !== "member-credentials" && hasApiKey))
  );
}

function maskBaseUrl(baseUrl) {
  const trimmedBaseUrl = String(baseUrl ?? "").trim();

  if (!trimmedBaseUrl) {
    return "";
  }

  try {
    const url = new URL(trimmedBaseUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmedBaseUrl.replace(/\/+$/, "");
  }
}

function buildBodyPreview(body) {
  if (typeof body === "string") {
    return body.trim().slice(0, 180);
  }

  if (body && typeof body === "object") {
    return JSON.stringify(body).slice(0, 180);
  }

  return "";
}

function normalizeLookupRows(body) {
  if (Array.isArray(body)) {
    return body;
  }

  if (!body || typeof body !== "object") {
    return [];
  }

  if (Array.isArray(body.items)) {
    return body.items;
  }

  if (Array.isArray(body.results)) {
    return body.results;
  }

  if (Array.isArray(body.data)) {
    return body.data;
  }

  return [];
}

function createDisabledSummary(runtimeConfig) {
  return {
    authMode: String(runtimeConfig?.authMode ?? "").trim() || "api-key",
    enabled: false,
    lastConnectionTest: null,
    lastFailureSummary: "",
    lastSyncStatus: null,
    lookupCounts: [],
    maskedBaseUrl: maskBaseUrl(runtimeConfig?.baseUrl),
  };
}

export function createGoldenRecordsIntegrationService(runtimeConfig, integrationGateway) {
  const enabled = isRuntimeEnabled(runtimeConfig);

  if (!enabled) {
    return {
      isEnabled: false,
      async getAdminSummary() {
        return createDisabledSummary(runtimeConfig);
      },
      async syncLookups() {
        throw new Error("Golden Records integration is not enabled.");
      },
      async testConnection() {
        return {
          authMode: String(runtimeConfig?.authMode ?? "").trim() || "api-key",
          diagnostics: {
            configured: false,
            maskedBaseUrl: maskBaseUrl(runtimeConfig?.baseUrl),
          },
          enabled: false,
          ok: false,
          testedAt: new Date().toISOString(),
        };
      },
    };
  }

  const client = createGoldenRecordsHttpClient(runtimeConfig);
  let lastRequestAt = 0;

  async function waitForQuotaWindow() {
    const elapsedMs = Date.now() - lastRequestAt;

    if (elapsedMs < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsedMs));
    }

    lastRequestAt = Date.now();
  }

  async function getPagedLookup(path) {
    const rows = [];

    for (let pageNumber = 1; pageNumber <= DEFAULT_MAX_PAGES; pageNumber += 1) {
      await waitForQuotaWindow();
      const result = await client.getJson(path, {
        pageNumber,
        pageSize: DEFAULT_PAGE_SIZE,
      });

      if (!result.ok) {
        const message = `Golden Records returned ${result.status} for ${path}.`;
        throw new Error(
          buildBodyPreview(result.body) ? `${message} ${buildBodyPreview(result.body)}` : message,
        );
      }

      const pageRows = normalizeLookupRows(result.body);

      if (pageRows.length === 0) {
        if (pageNumber === 1 && Array.isArray(result.body)) {
          return result.body;
        }

        break;
      }

      rows.push(...pageRows);

      if (pageRows.length < DEFAULT_PAGE_SIZE) {
        break;
      }
    }

    return rows;
  }

  async function getLookupRows(definition) {
    if (definition.paginated === false) {
      await waitForQuotaWindow();
      const result = await client.getJson(definition.path);

      if (!result.ok) {
        const message = `Golden Records returned ${result.status} for ${definition.path}.`;
        throw new Error(
          buildBodyPreview(result.body) ? `${message} ${buildBodyPreview(result.body)}` : message,
        );
      }

      return normalizeLookupRows(result.body);
    }

    return getPagedLookup(definition.path);
  }

  async function testConnection() {
    const testedAt = new Date().toISOString();
    await waitForQuotaWindow();
    const result = await client.getJson("/api/members", {
      pageNumber: 1,
      pageSize: 1,
    });
    const payload = {
      authMode: String(runtimeConfig?.authMode ?? "").trim() || "api-key",
      diagnostics: {
        maskedBaseUrl: maskBaseUrl(runtimeConfig?.baseUrl),
        responsePreview: buildBodyPreview(result.body),
        responseShape: Array.isArray(result.body) ? "array" : typeof result.body,
        status: result.status,
        statusText: result.statusText,
      },
      enabled: true,
      ok: result.ok,
      testedAt,
    };

    await integrationGateway.upsertStatus(STATUS_KEYS.connection, {
      ...payload,
      summary: result.ok
        ? "Connection test succeeded."
        : `Connection test failed with ${result.status} ${result.statusText}.`,
    });

    return payload;
  }

  async function syncLookups({ getUtcTimestampParts, updatedByUsername }) {
    const fetchedAt = new Date().toISOString();
    const [syncedAtDate, syncedAtTime] = getUtcTimestampParts();
    const lookupCounts = [];

    try {
      for (const definition of LOOKUP_DEFINITIONS) {
        const rows = await getLookupRows(definition);
        await integrationGateway.replaceLookup({
          fetchedAt,
          itemCount: rows.length,
          lookupType: definition.key,
          payload: rows,
          syncedAtDate,
          syncedAtTime,
          updatedByUsername,
        });
        lookupCounts.push({
          itemCount: rows.length,
          lookupType: definition.key,
        });
      }

      await integrationGateway.upsertStatus(STATUS_KEYS.lookupSync, {
        fetchedAt,
        lookupCounts,
        status: "success",
        summary: `Synced ${lookupCounts.length} Golden Records lookup collections.`,
        syncedAtDate,
        syncedAtTime,
        updatedByUsername,
      });

      return {
        fetchedAt,
        lookupCounts,
        status: "success",
        summary: `Golden Records lookup sync completed successfully for ${lookupCounts.length} collections.`,
        syncedAtDate,
        syncedAtTime,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Golden Records lookup sync failed.";

      await integrationGateway.upsertStatus(STATUS_KEYS.lookupSync, {
        fetchedAt,
        lookupCounts,
        status: "failed",
        summary: message,
        syncedAtDate,
        syncedAtTime,
        updatedByUsername,
      });

      throw new Error(message);
    }
  }

  async function getAdminSummary() {
    const [connectionStatus, lookupStatus, lookupCounts] = await Promise.all([
      integrationGateway.findStatus(STATUS_KEYS.connection),
      integrationGateway.findStatus(STATUS_KEYS.lookupSync),
      integrationGateway.listLookupSummaries(),
    ]);
    const failureCandidates = [lookupStatus, connectionStatus]
      .filter((entry) => entry && entry.status === "failed")
      .sort((left, right) =>
        String(right?.testedAt ?? right?.fetchedAt ?? "").localeCompare(
          String(left?.testedAt ?? left?.fetchedAt ?? ""),
        ),
      );

    return {
      authMode: String(runtimeConfig?.authMode ?? "").trim() || "api-key",
      enabled: true,
      lastConnectionTest: connectionStatus,
      lastFailureSummary: String(failureCandidates[0]?.summary ?? "").trim(),
      lastSyncStatus: lookupStatus,
      lookupCounts,
      maskedBaseUrl: maskBaseUrl(runtimeConfig?.baseUrl),
    };
  }

  return {
    getAdminSummary,
    isEnabled: true,
    syncLookups,
    testConnection,
  };
}
