export type ApiEnvelope = {
  success: boolean;
  message?: string;
  csrfToken?: string;
};

export class ApiError<T extends ApiEnvelope = ApiEnvelope> extends Error {
  status: number;
  payload: T;

  constructor(message: string, status: number, payload: T) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

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
  "/api/auth/guest-login",
]);
const SERVICE_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

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

function buildServiceUnavailableMessage(input: RequestInfo | URL) {
  const path = getRequestPath(input);

  if (!path.startsWith("/api/")) {
    return "The API service is unavailable. Make sure the local server is running.";
  }

  if (typeof window === "undefined") {
    return "The API service is unavailable. Make sure the local server is running.";
  }

  const currentPort = window.location.port;

  if (currentPort === "5173") {
    return "The API service is unavailable. Start it with `npm run dev:full`, or run `npm run dev:server` alongside the Vite app.";
  }

  if (currentPort === "8080") {
    return "The API service is unavailable. `npm run preview` serves only the frontend. Run `npm run start` for the built app, or start the backend separately on port 3001.";
  }

  return "The API service is unavailable. Make sure the local server is running.";
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
  let response: Response;

  try {
    response = await fetch(input, {
      credentials: "same-origin",
      ...requestInit,
    });
  } catch (error) {
    if (pathStartsWithApi(input)) {
      throw new Error(buildServiceUnavailableMessage(input));
    }

    throw error;
  }
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const responseText = await response.text();
    const summary = responseText.trim().slice(0, 160);
    const statusLabel = `${response.status} ${response.statusText}`.trim();

    if (SERVICE_UNAVAILABLE_STATUSES.has(response.status)) {
      throw new Error(buildServiceUnavailableMessage(input));
    }

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

    throw new ApiError(result.message ?? "The request failed.", response.status, result);
  }

  return result;
}

function pathStartsWithApi(input: RequestInfo | URL) {
  return getRequestPath(input).startsWith("/api/");
}
