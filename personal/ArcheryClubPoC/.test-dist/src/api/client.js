export function getActorUsername(actor) {
    return typeof actor === "string" ? actor : actor?.auth?.username ?? "";
}
export function buildActorHeaders(actor, includeContentType = false) {
    const headers = {
        "x-actor-username": getActorUsername(actor),
    };
    if (includeContentType) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}
export async function fetchApi(input, init) {
    const response = await fetch(input, init);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        const responseText = await response.text();
        const summary = responseText.trim().slice(0, 160);
        const statusLabel = `${response.status} ${response.statusText}`.trim();
        throw new Error(summary
            ? `The API returned an unexpected response (${statusLabel}): ${summary}`
            : `The API returned an unexpected response (${statusLabel}).`);
    }
    const result = (await response.json());
    if (!response.ok || !result.success) {
        throw new Error(result.message ?? "The request failed.");
    }
    return result;
}
