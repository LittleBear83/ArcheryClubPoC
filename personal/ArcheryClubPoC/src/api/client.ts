export type ApiEnvelope = {
  success: boolean;
  message?: string;
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
  void getActorUsername(actor);
  const headers: Record<string, string> = {};

  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export async function fetchApi<T extends ApiEnvelope = ApiEnvelope & Record<string, any>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
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

  if (!response.ok || !result.success) {
    throw new Error(result.message ?? "The request failed.");
  }

  return result;
}
