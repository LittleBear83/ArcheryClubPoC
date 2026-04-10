export type ApiEnvelope = {
  success: boolean;
  message?: string;
};

export async function fetchApi<T extends ApiEnvelope>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error("The API returned an unexpected response.");
  }

  const result = (await response.json()) as T;

  if (!response.ok || !result.success) {
    throw new Error(result.message ?? "The request failed.");
  }

  return result;
}
