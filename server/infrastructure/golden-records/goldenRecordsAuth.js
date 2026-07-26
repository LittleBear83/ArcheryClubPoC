function toBase64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

export function buildGoldenRecordsAuthorizationHeader({
  apiKey = "",
  authMode = "api-key",
  password = "",
  username = "",
}) {
  const normalizedMode = String(authMode ?? "").trim().toLowerCase();

  if (normalizedMode === "member-credentials") {
    const trimmedUsername = String(username ?? "").trim();
    const rawPassword = String(password ?? "");

    if (!trimmedUsername || !rawPassword) {
      throw new Error(
        "Golden Records member credential auth requires both username and password.",
      );
    }

    return `Basic ${toBase64(`${trimmedUsername}:${rawPassword}`)}`;
  }

  const trimmedApiKey = String(apiKey ?? "").trim();

  if (!trimmedApiKey) {
    throw new Error("Golden Records API key auth requires a non-empty API key.");
  }

  return `Basic ${trimmedApiKey}`;
}
