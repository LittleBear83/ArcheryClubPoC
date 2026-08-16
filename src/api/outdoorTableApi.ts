import { buildActorHeaders, fetchApi } from "./client";
import type { OutdoorTableEntry } from "../types/app";

export type OutdoorTableMemberOption = {
  username: string;
  firstName?: string;
  surname?: string;
  fullName: string;
};

export type OutdoorTableEntryPayload = {
  seasonYear: number;
  archerUsername: string;
  bowType: string;
  handicap: number | null;
  archer3rd: boolean;
  archer2nd: boolean;
  archer1st: boolean;
  bowman3rd: boolean;
  bowman2nd: boolean;
  bowman1st: boolean;
  masterBowman: boolean;
  grandMasterBowman: boolean;
  eliteMasterBowman: boolean;
  archer3rdDate: string;
  archer2ndDate: string;
  archer1stDate: string;
  bowman3rdDate: string;
  bowman2ndDate: string;
  bowman1stDate: string;
  masterBowmanDate: string;
  grandMasterBowmanDate: string;
  eliteMasterBowmanDate: string;
  award25220: boolean;
  award25230: boolean;
  award25240: boolean;
  award25250: boolean;
  award25260: boolean;
  award25280: boolean;
  award252100: boolean;
  award25220SignOffDates: string[];
  award25230SignOffDates: string[];
  award25240SignOffDates: string[];
  award25250SignOffDates: string[];
  award25260SignOffDates: string[];
  award25280SignOffDates: string[];
  award252100SignOffDates: string[];
  cloutWhite20: boolean;
  cloutWhite30: boolean;
  cloutWhite40: boolean;
  cloutWhite50: boolean;
  cloutWhite60: boolean;
  cloutWhite7080: boolean;
  cloutWhite90100: boolean;
};

export function listOutdoorTableDashboard(actor: unknown, seasonYear: number) {
  return fetchApi<{
    success: true;
    seasonYear: number;
    availableYears?: number[];
    goldenRecordsFetchedAt?: string;
    rows?: OutdoorTableEntry[];
  }>(`/api/outdoor-table?year=${seasonYear}`, {
    headers: buildActorHeaders(actor),
    cache: "no-store",
  });
}

export function listOutdoorTableMembers(actor: unknown) {
  return fetchApi<{ success: true; members?: OutdoorTableMemberOption[] }>(
    "/api/guest-inviter-members",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function createOutdoorTableEntry(
  actor: unknown,
  payload: OutdoorTableEntryPayload,
) {
  return fetchApi<{ success: true; entry: OutdoorTableEntry }>("/api/outdoor-table", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify(payload),
  });
}

export function updateOutdoorTableEntry(
  actor: unknown,
  entryId: number,
  payload: OutdoorTableEntryPayload,
) {
  return fetchApi<{ success: true; entry: OutdoorTableEntry }>(
    `/api/outdoor-table/${entryId}`,
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function deleteOutdoorTableEntry(actor: unknown, entryId: number) {
  return fetchApi<{ success: true }>(`/api/outdoor-table/${entryId}`, {
    method: "DELETE",
    headers: buildActorHeaders(actor, true),
  });
}

export function triggerGoldenRecordsOutdoorTableSync(actor: unknown) {
  return fetchApi<{
    success: true;
    attemptedCount: number;
    syncedCount: number;
    errorCount: number;
    errors?: Array<{ username: string; message: string }>;
    message: string;
  }>("/api/golden-records/sync-outdoor-table", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
  });
}
