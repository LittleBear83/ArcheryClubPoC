import { buildActorHeaders, fetchApi } from "./client";
import type { LostArrowRecord } from "../types/app";

export type LostArrowMemberOption = {
  username: string;
  firstName?: string;
  surname?: string;
  fullName: string;
  userType?: string;
};

export function listLostArrowMembers(actor: unknown) {
  return fetchApi<{ success: true; members?: LostArrowMemberOption[] }>(
    "/api/guest-inviter-members",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function listOpenLostArrows(actor: unknown) {
  return fetchApi<{ success: true; lostArrows?: LostArrowRecord[] }>(
    "/api/lost-arrows",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function createLostArrow(
  actor: unknown,
  payload: {
    archerUsername: string;
    dateLost: string;
    arrowMaterial: "aluminium" | "carbon" | "wood" | "";
    arrowColour: string;
    arrowIdentifier: string;
    fletchingColour1: string;
    fletchingColour2: string;
    fletchingColour3: string;
    nockColour: string;
    targetDistance: string;
    laneNumber: string;
    otherDetails: string;
  },
) {
  return fetchApi<{ success: true; lostArrow: LostArrowRecord }>("/api/lost-arrows", {
    method: "POST",
    headers: buildActorHeaders(actor, true),
    body: JSON.stringify(payload),
  });
}

export function markLostArrowFound(
  actor: unknown,
  lostArrowId: number,
  payload: {
    dateFound: string;
    foundByUsername: string;
    foundCollectionLocation?: string;
  },
) {
  return fetchApi<{ success: true; lostArrow: LostArrowRecord }>(
    `/api/lost-arrows/${lostArrowId}/found`,
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function listMyLostArrowNotices(actor: unknown) {
  return fetchApi<{ success: true; notices?: LostArrowRecord[] }>(
    "/api/my-lost-arrow-notices",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}
