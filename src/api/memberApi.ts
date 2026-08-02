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

export async function extendRangePresence(hours: number) {
  return fetchApi<{
    success: true;
    activeRangePresenceEndsAt?: string;
    message?: string;
  }>("/api/range-members/presence-extension", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hours }),
  });
}
