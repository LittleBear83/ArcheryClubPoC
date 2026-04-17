import { buildActorHeaders, fetchApi } from "./client";

export async function getRangeUsageDashboard(
  actorUsername: string,
  params: {
    startDate: string;
    endDate: string;
  },
) {
  const searchParams = new URLSearchParams({
    start: params.startDate,
    end: params.endDate,
  });

  return fetchApi<{
    success: true;
    currentMonth?: unknown;
    currentWeek?: unknown;
    filteredRange?: unknown;
    myCurrentMonth?: unknown;
    myCurrentWeek?: unknown;
    myFilteredRange?: unknown;
  }>(`/api/range-usage-dashboard?${searchParams.toString()}`, {
    headers: buildActorHeaders(actorUsername),
    cache: "no-store",
  });
}
