import { buildActorHeaders, fetchApi } from "./client";

export type DashboardPeriod = "7d" | "30d" | "90d" | "year" | "all";
export type LoginMethodReport = {
  period: { key: DashboardPeriod; startDate: string | null; endDate: string; endDateExclusive: string };
  total: number;
  excludedOtherCount: number;
  methods: Array<{ method: "rfid" | "mobile" | "website"; label: string; count: number; percentage: number }>;
};

export async function getLoginMethodReport(actorUsername: string, period: DashboardPeriod, signal?: AbortSignal) {
  return fetchApi<{ success: true; report: LoginMethodReport }>(`/api/reporting/login-methods?${new URLSearchParams({ period })}`, {
    headers: buildActorHeaders(actorUsername), cache: "no-store", signal,
  });
}

export function loginMethodQueryOptions(actorUsername: string, period: DashboardPeriod) {
  return {
    queryKey: ["reporting-dashboard", "login-methods", actorUsername, period],
    queryFn: async ({ signal }: { signal: AbortSignal }) => (await getLoginMethodReport(actorUsername, period, signal)).report,
    enabled: Boolean(actorUsername),
  };
}
