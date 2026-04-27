import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRootDirectory = path.resolve(__dirname, "..");
const dataDirectory = path.join(serverRootDirectory, "data");
const exportsDirectory = path.join(dataDirectory, "exports");
const appMode = process.env.ARCHERY_APP_MODE ?? process.env.APP_ENV ?? "development";
const isLive = ["live", "production"].includes(appMode.toLowerCase());
const defaultSqliteDatabasePath = path.join(
  dataDirectory,
  isLive ? "auth.live.sqlite" : "auth.sqlite",
);
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const configuredDatabaseEngine = process.env.DATABASE_ENGINE?.trim().toLowerCase() || "";
const inferredDatabaseEngine = databaseUrl.startsWith("postgres://") ||
  databaseUrl.startsWith("postgresql://")
  ? "postgres"
  : "sqlite";
const databaseEngine = configuredDatabaseEngine || inferredDatabaseEngine;
const databasePath = process.env.DATABASE_PATH ?? defaultSqliteDatabasePath;
const distDirectory = path.join(serverRootDirectory, "..", "dist");
const port = Number(process.env.PORT ?? 3001);
const trustProxyValue = process.env.TRUST_PROXY ?? process.env.ARCHERY_TRUST_PROXY ?? "";
const headersTimeoutMs = Number(process.env.HEADERS_TIMEOUT_MS ?? 65000);
const keepAliveTimeoutMs = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 5000);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 30000);
const rfidReaderNames = [
  process.env.RFID_READER_NAME,
  "ACS ACR122U PICC Interface 0",
  "ACS ACR122 0",
  "ACR122 Smart Card Reader",
].filter(Boolean);
const cloudSqlInstanceConnectionName =
  process.env.INSTANCE_CONNECTION_NAME?.trim() || "";
const databaseHost = process.env.DB_HOST?.trim() || "";
const databaseName = process.env.DB_NAME?.trim() || "";
const databaseUser = process.env.DB_USER?.trim() || "";
const databasePassword = process.env.DB_PASSWORD ?? "";
const databasePort = Number(process.env.DB_PORT ?? 5432);

function buildPostgresSocketDirectory(instanceConnectionName) {
  if (!instanceConnectionName) {
    return "";
  }

  return path.posix.join("/cloudsql", instanceConnectionName);
}

function parseTrustProxy(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (!normalizedValue || normalizedValue === "false" || normalizedValue === "0") {
    return false;
  }

  if (normalizedValue === "true") {
    return true;
  }

  const numericValue = Number.parseInt(normalizedValue, 10);

  if (String(numericValue) === normalizedValue) {
    return numericValue;
  }

  return value;
}

// Collect runtime settings in one export so server startup, database setup, and
// hardware integrations read the same environment-derived configuration.
export const serverRuntime = {
  dataDirectory,
  databaseEngine,
  databasePath,
  databaseUrl,
  distDirectory,
  exportsDirectory,
  appMode,
  isLive,
  port,
  headersTimeoutMs,
  keepAliveTimeoutMs,
  requestTimeoutMs,
  rfidReaderNames,
  trustProxy: parseTrustProxy(trustProxyValue),
  postgres: {
    databaseName,
    host: databaseHost,
    password: databasePassword,
    port: databasePort,
    socketDirectory: buildPostgresSocketDirectory(cloudSqlInstanceConnectionName),
    user: databaseUser,
  },
};
