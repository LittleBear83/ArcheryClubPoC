import { fetchApi } from "./client";
import type { UserProfile } from "../types/app";

type CredentialLoginDeviceType = "desktop" | "mobile";

export type RfidReaderStatus = {
  success: true;
  checked: boolean;
  detected: boolean;
};

export async function loginWithCredentials(
  username: string,
  password: string,
  deviceType: CredentialLoginDeviceType = "desktop",
) {
  return fetchApi<{ success: true; userProfile: UserProfile }>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password, deviceType }),
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

export async function getRfidReaderStatus() {
  return fetchApi<RfidReaderStatus>("/api/auth/rfid/status", {
    cache: "no-store",
  });
}

export async function loginAsGuest(guestDetails: {
  firstName: string;
  surname: string;
  archeryGbMembershipNumber: string;
  invitedByUsername: string;
  paymentMethod: "paypal" | "cash";
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

export async function listGuestInviterMembers() {
  return fetchApi<{ success: true; members?: unknown[] }>("/api/guest-inviter-members", {
    cache: "no-store",
  });
}
