import { buildGoldenRecordsAuthorizationHeader } from "./goldenRecordsAuth.js";

const DEFAULT_BASE_URL = "https://api2.archery-records.net";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_USER_AGENT = "ArcheryClubPoC/1.0";

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
    async getJson(path, searchParams = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(buildUrl(baseUrl, path, searchParams), {
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            "User-Agent": userAgent,
          },
          signal: controller.signal,
        });
        const text = await response.text();
        let parsedBody = null;

        try {
          parsedBody = text ? JSON.parse(text) : null;
        } catch {
          parsedBody = text;
        }

        return {
          body: parsedBody,
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
