import { buildActorHeaders, fetchApi } from "./client";

export type AnnouncementSeverity =
  | "information"
  | "urgent"
  | "urgent_important";

export type AnnouncementRecord = {
  id: number;
  activeFromDate: string;
  activeTillDate: string;
  severity: AnnouncementSeverity;
  message: string;
  escalateSeverity: boolean;
  createdByUsername: string;
  createdByName?: string;
  createdAtDate: string;
  createdAtTime: string;
  amendedByUsername?: string;
  amendedByName?: string;
  amendedAtDate?: string;
  amendedAtTime?: string;
  deletedByUsername?: string;
  deletedByName?: string;
  deletedAtDate?: string;
  deletedAtTime?: string;
  isDeleted?: boolean;
  seenCount?: number;
};

export type AnnouncementSeenMember = {
  username: string;
  fullName: string;
  seenAtDate: string;
  seenAtTime: string;
};

export function listAnnouncements(actor: unknown) {
  return fetchApi<{ success: true; announcements?: AnnouncementRecord[] }>(
    "/api/announcements",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function listActiveAnnouncements(actor: unknown) {
  return fetchApi<{ success: true; announcements?: AnnouncementRecord[] }>(
    "/api/announcements/active",
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function createAnnouncement(
  actor: unknown,
  payload: {
    activeFromDate: string;
    activeTillDate: string;
    severity: AnnouncementSeverity;
    message: string;
    escalateSeverity: boolean;
  },
) {
  return fetchApi<{ success: true; announcement: AnnouncementRecord }>(
    "/api/announcements",
    {
      method: "POST",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function updateAnnouncement(
  actor: unknown,
  announcementId: number,
  payload: {
    activeFromDate: string;
    activeTillDate: string;
    severity: AnnouncementSeverity;
    message: string;
    escalateSeverity: boolean;
  },
) {
  return fetchApi<{ success: true; announcement: AnnouncementRecord }>(
    `/api/announcements/${announcementId}`,
    {
      method: "PUT",
      headers: buildActorHeaders(actor, true),
      body: JSON.stringify(payload),
    },
  );
}

export function listAnnouncementSeenMembers(actor: unknown, announcementId: number) {
  return fetchApi<{ success: true; members?: AnnouncementSeenMember[] }>(
    `/api/announcements/${announcementId}/seen-members`,
    {
      headers: buildActorHeaders(actor),
      cache: "no-store",
    },
  );
}

export function deleteAnnouncement(actor: unknown, announcementId: number) {
  return fetchApi<{ success: true; announcement: AnnouncementRecord }>(
    `/api/announcements/${announcementId}`,
    {
      method: "DELETE",
      headers: buildActorHeaders(actor),
    },
  );
}
