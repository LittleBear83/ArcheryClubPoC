import process from "node:process";
import { createGoldenRecordsHttpClient } from "../server/infrastructure/golden-records/goldenRecordsHttpClient.js";

const baseUrl =
  process.env.GOLDEN_RECORDS_BASE_URL?.trim() || "https://api2.archery-records.net";
const authMode = process.env.GOLDEN_RECORDS_AUTH_MODE?.trim() || "api-key";
const apiKey = process.env.GOLDEN_RECORDS_API_KEY ?? "";
const username = process.env.GOLDEN_RECORDS_USERNAME ?? "";
const password = process.env.GOLDEN_RECORDS_PASSWORD ?? "";

if (authMode === "api-key" && !apiKey.trim()) {
  console.error("Missing GOLDEN_RECORDS_API_KEY for api-key auth mode.");
  process.exit(1);
}

if (authMode === "member-credentials" && (!username.trim() || !password)) {
  console.error(
    "Missing GOLDEN_RECORDS_USERNAME or GOLDEN_RECORDS_PASSWORD for member-credentials auth mode.",
  );
  process.exit(1);
}

const client = createGoldenRecordsHttpClient({
  apiKey,
  authMode,
  baseUrl,
  password,
  username,
});

const result = await client.getJson("/api/members", {
  pageNumber: 1,
  pageSize: 1,
});

console.log(`Status: ${result.status} ${result.statusText}`);

if (!result.ok) {
  if (typeof result.body === "string") {
    console.log(result.body.slice(0, 1000));
  } else {
    console.log(JSON.stringify(result.body, null, 2).slice(0, 2000));
  }
  process.exit(1);
}

if (Array.isArray(result.body)) {
  console.log(`Success: received array response with ${result.body.length} item(s).`);
} else if (result.body && typeof result.body === "object") {
  const keys = Object.keys(result.body);
  console.log(`Success: received JSON object with keys: ${keys.join(", ")}`);
} else {
  console.log("Success: received authenticated response.");
}
