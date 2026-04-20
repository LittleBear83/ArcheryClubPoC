import { fetchApi } from "./client";
import type { UserProfile } from "../types/app";

export type RfidScan = {
  sequence: number;
  rfidTag?: string;
  scanType?: string;
  cardBrand?: string;
};

export async function loginWithCredentials(username: string, password: string) {
  return fetchApi<{ success: true; userProfile: UserProfile }>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

export async function loginWithRfid(rfidTag: string) {
  return fetchApi<{ success: true; userProfile: UserProfile }>("/api/auth/rfid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rfidTag }),
  });
}

export async function loginAsGuest(guestDetails: {
  firstName: string;
  surname: string;
  archeryGbMembershipNumber: string;
  invitedByUsername: string;
}) {
  return fetchApi<{ success: true; userProfile: unknown }>("/api/auth/guest-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(guestDetails),
  });
}

export async function logoutSession() {
  return fetchApi<{ success: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentSession() {
  return fetchApi<{ success: true; userProfile: UserProfile }>("/api/auth/session", {
    cache: "no-store",
  });
}

export async function getLatestRfidScan() {
  return fetchApi<{ success: true; scan?: RfidScan }>("/api/auth/rfid/latest-scan", {
    cache: "no-store",
  });
}

export async function listGuestInviterMembers() {
  return fetchApi<{ success: true; members?: unknown[] }>("/api/guest-inviter-members", {
    cache: "no-store",
  });
}
