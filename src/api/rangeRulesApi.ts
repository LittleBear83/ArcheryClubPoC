import { buildActorHeaders, fetchApi } from "./client";

export type RangeRulesLaneRule = {
  lanes: string;
  distance: string;
};

export type RangeRulesRecord = {
  indoorRules: string[];
  outdoorRules: string[];
  outdoorLaneRules: RangeRulesLaneRule[];
  updatedAtDate?: string;
  updatedAtTime?: string;
  updatedByUsername?: string;
};

export function getRangeRules(actor: unknown) {
  return fetchApi<{ success: true; rangeRules: RangeRulesRecord }>(
    "/api/range-rules",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function updateRangeRules(actor: unknown, payload: RangeRulesRecord) {
  return fetchApi<{ success: true; rangeRules: RangeRulesRecord }>(
    "/api/range-rules",
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}
