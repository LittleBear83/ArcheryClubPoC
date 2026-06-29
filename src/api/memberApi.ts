import { fetchApi } from "./client";
import type { HomeMember } from "../types/app";

export async function listRangeMembers() {
  return fetchApi<{ success: true; members?: HomeMember[] }>("/api/range-members", {
    cache: "no-store",
  });
}

export async function bookOnSiteWithMobileApp() {
  return fetchApi<{ success: true; message?: string }>(
    "/api/range-members/mobile-check-in",
    {
      method: "POST",
    },
  );
}
