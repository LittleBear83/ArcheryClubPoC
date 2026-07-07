import { buildActorHeaders, fetchApi } from "./client";

export type AuditEventRecord = {
  id: number;
  actorUsername: string;
  action: string;
  target: string;
  statusCode: number;
  ipAddress: string;
  userAgent: string;
  metadata: unknown;
  createdAtDate: string;
  createdAtTime: string;
};

export type AuditEventQuery = {
  actorUsername?: string;
  action?: string;
  target?: string;
  statusCode?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDirection?: string;
  limit?: number;
};

export function getAuditEvents(actor: unknown, query: AuditEventQuery = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const path = searchParams.size > 0
    ? `/api/audit-events?${searchParams.toString()}`
    : "/api/audit-events";

  return fetchApi<{ success: true; auditEvents: AuditEventRecord[] }>(path, {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}
