export type ApiEnvelope = {
  success: boolean;
  message?: string;
  csrfToken?: string;
};

export type ActorIdentity = {
  auth?: {
    username?: string | null;
  };
} | null | undefined;

export function getActorUsername(actor: ActorIdentity | string) {
  return typeof actor === "string" ? actor : actor?.auth?.username ?? "";
}

export function buildActorHeaders(
  actor: ActorIdentity | string,
  includeContentType = false,
) {
  // Authentication is cookie based now; this helper keeps older actor-aware API
  // call sites consistent while avoiding custom auth headers.
  void getActorUsername(actor);
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

const CSRF_HEADER_NAME = "X-CSRF-Token";
const MUTATING_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/rfid/latest-login",
  "/api/auth/guest-login",
]);

let csrfTokenCache = "";

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }

  return "GET";
}

function getRequestPath(input: RequestInfo | URL) {
  const rawUrl =
    typeof Request !== "undefined" && input instanceof Request
      ? input.url
      : String(input);
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";

  try {
    return new URL(rawUrl, baseUrl).pathname;
  } catch {
    return rawUrl;
  }
}

function shouldAttachCsrfToken(input: RequestInfo | URL, init?: RequestInit) {
  const method = getRequestMethod(input, init);
  const path = getRequestPath(input);

  return (
    MUTATING_API_METHODS.has(method) &&
    path.startsWith("/api/") &&
    !CSRF_EXCLUDED_PATHS.has(path)
  );
}

async function getCsrfToken() {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = (await response.json()) as ApiEnvelope;

  if (!response.ok || !result.success || !result.csrfToken) {
    throw new Error(result.message ?? "Unable to prepare a secure request.");
  }

  csrfTokenCache = result.csrfToken;
  return csrfTokenCache;
}

async function buildRequestInit(input: RequestInfo | URL, init?: RequestInit) {
  if (!shouldAttachCsrfToken(input, init)) {
    return init;
  }

  const headers = new Headers(init?.headers);
  headers.set(CSRF_HEADER_NAME, await getCsrfToken());

  return {
    ...init,
    headers,
  };
}

export async function fetchApi<T extends ApiEnvelope = ApiEnvelope & Record<string, any>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  // All app APIs are expected to return JSON envelopes. Turning unexpected HTML
  // or plain text into a useful error makes dev-server mistakes easier to spot.
  const requestInit = await buildRequestInit(input, init);
  const response = await fetch(input, {
    credentials: "same-origin",
    ...requestInit,
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();
    const summary = responseText.trim().slice(0, 160);
    const statusLabel = `${response.status} ${response.statusText}`.trim();

    throw new Error(
      summary
        ? `The API returned an unexpected response (${statusLabel}): ${summary}`
        : `The API returned an unexpected response (${statusLabel}).`,
    );
  }

  const result = (await response.json()) as T;

  if (result.csrfToken) {
    csrfTokenCache = result.csrfToken;
  }

  if (!response.ok || !result.success) {
    if (response.status === 403) {
      csrfTokenCache = "";
    }

    throw new Error(result.message ?? "The request failed.");
  }

  return result;
}
