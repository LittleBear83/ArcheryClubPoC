import { buildActorHeaders, fetchApi } from "./client";

export type SuggestionStatus = "new" | "reviewing" | "implemented" | "declined";

export type SuggestionRecord = {
  id: number;
  submittedByName: string;
  submittedByUsername?: string;
  isAnonymous: boolean;
  suggestionTitle: string;
  improvementText: string;
  suggestionDetails: string;
  resolutionNote: string;
  status: SuggestionStatus;
  createdAtDate: string;
  createdAtTime: string;
  updatedAtDate?: string;
  updatedAtTime?: string;
  updatedByUsername?: string;
  updatedByName?: string;
};

export function createSuggestion(
  actor: unknown,
  payload: {
    submittedBy: string;
    suggestionTitle: string;
    improvementText: string;
    suggestionDetails: string;
  },
) {
  return fetchApi<{ success: true; message?: string; suggestion: SuggestionRecord }>(
    "/api/suggestions",
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function listSuggestions(actor: unknown) {
  return fetchApi<{ success: true; suggestions?: SuggestionRecord[] }>("/api/suggestions", {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export function listMySuggestions(actor: unknown) {
  return fetchApi<{ success: true; suggestions?: SuggestionRecord[] }>(
    "/api/suggestions/mine",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function updateSuggestionStatus(
  actor: unknown,
  suggestionId: number,
  status: SuggestionStatus,
  resolutionNote = "",
) {
  return fetchApi<{ success: true; message?: string; suggestion: SuggestionRecord }>(
    `/api/suggestions/${suggestionId}/status`,
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify({ status, resolutionNote }),
    },
  );
}
