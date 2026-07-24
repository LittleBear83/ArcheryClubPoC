import { buildActorHeaders, fetchApi } from "./client";

export type GeneralInfoRecord = {
  introParagraphs: string[];
  quickFacts: string[];
  facilities: string[];
  beginners: string[];
  clubLife: string[];
  updatedAtDate?: string;
  updatedAtTime?: string;
  updatedByUsername?: string;
};

export async function getGeneralInfo(actor: unknown) {
  return fetchApi<{ success: true; generalInfo: GeneralInfoRecord }>("/api/general-info", {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export async function updateGeneralInfo(actor: unknown, generalInfo: GeneralInfoRecord) {
  return fetchApi<{ success: true; generalInfo: GeneralInfoRecord }>("/api/general-info", {
    method: "PUT",
    headers: buildActorHeaders(actor, true),
    cache: "no-store",
    body: JSON.stringify(generalInfo),
  });
}
