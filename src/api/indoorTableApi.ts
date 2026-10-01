import { buildActorHeaders, fetchApi } from "./client";

export type IndoorTableEntry = {
  id: number;
  seasonYear: number;
  archerUsername: string;
  archerName: string;
  archerFirstName: string;
  archerSurname: string;
  bowType: string;
  handicap: number | null;
  classifications: Record<string, string>;
  scores: Record<string, string>;
  updatedByUsername?: string;
};
export type IndoorTablePayload = Pick<IndoorTableEntry,
  "seasonYear" | "archerUsername" | "bowType" | "handicap" | "classifications" | "scores">;

export function listIndoorTable(actor: unknown, year: number) {
  return fetchApi<{ success: true; rows: IndoorTableEntry[]; seasonYear: number; availableYears: number[] }>(
    `/api/indoor-table?year=${year}`, { headers: buildActorHeaders(actor), cache: "no-store" });
}
export function createIndoorTableEntry(actor: unknown, payload: IndoorTablePayload) {
  return fetchApi<{ success: true; entry: IndoorTableEntry }>("/api/indoor-table", {
    method: "POST", headers: buildActorHeaders(actor, true), body: JSON.stringify(payload),
  });
}
export function updateIndoorTableEntry(actor: unknown, id: number, payload: IndoorTablePayload) {
  return fetchApi<{ success: true; entry: IndoorTableEntry }>(`/api/indoor-table/${id}`, {
    method: "PUT", headers: buildActorHeaders(actor, true), body: JSON.stringify(payload),
  });
}
export const INDOOR_CLASSIFICATION_COLUMNS = [
  { key: "archer3rd", label: "Archer 3rd" },
  { key: "archer2nd", label: "Archer 2nd" },
  { key: "archer1st", label: "Archer 1st" },
  { key: "bowman3rd", label: "Bowman 3rd" },
  { key: "bowman2nd", label: "Bowman 2nd" },
  { key: "bowman1st", label: "Bowman 1st" },
  { key: "indoorMasterBowman", label: "Indoor Master Bowman" },
  { key: "indoorGrandMasterBowman", label: "Indoor Grand Master Bowman" },
] as const;
export const INDOOR_SCORE_COLUMNS = [300, 325, 350, 375, 400, 425, 450, 475, 500, 525, 550, 575, 580, 585, 590, 595, 600] as const;
