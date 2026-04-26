import { fetchApi } from "./client";
import type { HomeMember } from "../types/app";

export async function listRangeMembers() {
  return fetchApi<{ success: true; members?: HomeMember[] }>("/api/range-members", {
    cache: "no-store",
  });
}
