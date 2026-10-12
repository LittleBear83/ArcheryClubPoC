import { buildGoldenRecordsAuthorizationHeader } from "./goldenRecordsAuth.js";

const DEFAULT_BASE_URL = "https://api2.archery-records.net";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT = "ArcheryClubPoC/1.0";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function retryDelay(response, attempt, baseDelayMs) {
  const retryAfter = response?.headers?.get?.("retry-after");
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 10_000);
  }
  const retryAt = Date.parse(retryAfter ?? "");
  if (Number.isFinite(retryAt)) {
    return Math.min(Math.max(0, retryAt - Date.now()), 10_000);
  }
  return Math.min(baseDelayMs * 2 ** attempt, 5_000);
}

function buildUrl(baseUrl, path, searchParams = {}) {
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

export function createGoldenRecordsHttpClient({
  apiKey = "",
  authMode = "api-key",
  baseUrl = DEFAULT_BASE_URL,
  password = "",
  maxRetries = 2,
  retryDelayMs = 500,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userAgent = DEFAULT_USER_AGENT,
  username = "",
} = {}) {
  const authorization = buildGoldenRecordsAuthorizationHeader({
    apiKey,
    authMode,
    password,
    username,
  });

  return {
    async getJson(path, searchParams = {}, { signal } = {}) {
      for (let attempt = 0; ; attempt += 1) {
        signal?.throwIfAborted();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
        let response;
        try {
          response = await fetch(buildUrl(baseUrl, path, searchParams), {
            headers: {
              Accept: "application/json",
              Authorization: authorization,
              "User-Agent": userAgent,
            },
            signal: requestSignal,
          });
          if (RETRYABLE_STATUSES.has(response.status) && attempt < maxRetries) {
            clearTimeout(timeoutId);
            await response.body?.cancel?.();
            await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt, retryDelayMs)));
            continue;
          }
          const text = await response.text();
          let parsedBody = null;
          try {
            parsedBody = text ? JSON.parse(text) : null;
          } catch {
            parsedBody = text;
          }
          return {
            body: parsedBody,
            bodyWasEmpty: text.length === 0,
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
          };
        } catch (error) {
          if (signal?.aborted || attempt >= maxRetries || (!controller.signal.aborted && !(error instanceof TypeError))) throw error;
          clearTimeout(timeoutId);
          await new Promise((resolve) => setTimeout(resolve, retryDelay(null, attempt, retryDelayMs)));
        } finally {
          clearTimeout(timeoutId);
        }
      }
    },
  };
}
