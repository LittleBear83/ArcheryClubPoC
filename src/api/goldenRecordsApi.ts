import { buildActorHeaders, fetchApi } from "./client";

export type GoldenRecordsLookupSummary = {
  fetchedAt: string;
  itemCount: number;
  lookupType: string;
  syncedAtDate: string;
  syncedAtTime: string;
  updatedByUsername: string;
};

export type GoldenRecordsHealthSummary = {
  authMode: string;
  diagnostics: {
    configured?: boolean;
    maskedBaseUrl?: string;
    responsePreview?: string;
    responseShape?: string;
    status?: number;
    statusText?: string;
  };
  enabled: boolean;
  ok: boolean;
  testedAt: string;
};

export type GoldenRecordsAdminSummary = {
  authMode: string;
  enabled: boolean;
  lastConnectionTest: (GoldenRecordsHealthSummary & { summary?: string }) | null;
  lastFailureSummary: string;
  lastSyncStatus: {
    fetchedAt?: string;
    lookupCounts?: Array<{ itemCount: number; lookupType: string }>;
    status?: string;
    summary?: string;
    syncedAtDate?: string;
    syncedAtTime?: string;
    updatedByUsername?: string;
  } | null;
  lookupCounts: GoldenRecordsLookupSummary[];
  maskedBaseUrl: string;
};

export async function getGoldenRecordsAdminSummary(actor: unknown) {
  return fetchApi<{ success: true; summary: GoldenRecordsAdminSummary }>(
    "/api/golden-records/admin-summary",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export async function testGoldenRecordsHealth(actor: unknown) {
  return fetchApi<{
    success: boolean;
    health: GoldenRecordsHealthSummary;
    message: string;
  }>("/api/golden-records/health", {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export async function syncGoldenRecordsLookups(actor: unknown) {
  return fetchApi<{
    success: true;
    message: string;
    summary: {
      fetchedAt: string;
      lookupCounts: Array<{ itemCount: number; lookupType: string }>;
      status: string;
      summary: string;
      syncedAtDate: string;
      syncedAtTime: string;
    };
  }>("/api/golden-records/lookups/sync", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify({}),
  });
}
