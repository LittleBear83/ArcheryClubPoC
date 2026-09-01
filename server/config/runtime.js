import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRootDirectory = path.resolve(__dirname, "..");
const projectRootDirectory = path.resolve(serverRootDirectory, "..");
const dataDirectory = path.join(serverRootDirectory, "data");
const exportsDirectory = path.join(dataDirectory, "exports");

function parseDotEnvLine(line) {
  const trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmedLine.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmedLine.slice(0, separatorIndex).trim();

  if (!key) {
    return null;
  }

  let value = trimmedLine.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadLocalEnvironmentFiles() {
  const candidatePaths = [
    path.join(projectRootDirectory, ".env.local"),
    path.join(projectRootDirectory, ".env"),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const fileContents = fs.readFileSync(candidatePath, "utf8");
    const lines = fileContents.split(/\r?\n/u);

    for (const line of lines) {
      const parsedEntry = parseDotEnvLine(line);

      if (!parsedEntry) {
        continue;
      }

      if (process.env[parsedEntry.key] === undefined) {
        process.env[parsedEntry.key] = parsedEntry.value;
      }
    }
  }
}

loadLocalEnvironmentFiles();

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
const goldenRecordsBaseUrl =
  process.env.GOLDEN_RECORDS_BASE_URL?.trim() || "https://api2.archery-records.net";
const goldenRecordsAuthMode = process.env.GOLDEN_RECORDS_AUTH_MODE?.trim() || "api-key";
const goldenRecordsApiKey = process.env.GOLDEN_RECORDS_API_KEY ?? "";
const goldenRecordsUsername = process.env.GOLDEN_RECORDS_USERNAME ?? "";
const goldenRecordsPassword = process.env.GOLDEN_RECORDS_PASSWORD ?? "";
const goldenRecordsUserAgent =
  process.env.GOLDEN_RECORDS_USER_AGENT?.trim() || "ArcheryClubPoC/1.0";
const syncApiBaseUrl = process.env.SYNC_API_BASE_URL?.trim() || "";
const syncMachineId = process.env.SYNC_MACHINE_ID?.trim() || "";
const syncMachineSecret = process.env.SYNC_MACHINE_SECRET ?? "";
const syncNodeMode = process.env.SYNC_NODE_MODE?.trim().toLowerCase() || "standalone";
const syncMachineCredentialsJson = process.env.SYNC_MACHINE_CREDENTIALS_JSON?.trim() || "[]";
const syncRequestTimeoutMs = Number(process.env.SYNC_REQUEST_TIMEOUT_MS ?? 15000);
const syncPushBatchSize = Number(process.env.SYNC_PUSH_BATCH_SIZE ?? 100);
const syncPullBatchSize = Number(process.env.SYNC_PULL_BATCH_SIZE ?? 200);
const syncLocalDatabaseUrl = process.env.SYNC_LOCAL_DATABASE_URL?.trim() || "";
const syncLocalDatabaseHost = process.env.SYNC_LOCAL_DB_HOST?.trim() || "";
const syncLocalDatabaseName = process.env.SYNC_LOCAL_DB_NAME?.trim() || "";
const syncLocalDatabaseUser = process.env.SYNC_LOCAL_DB_USER?.trim() || "";
const syncLocalDatabasePassword = process.env.SYNC_LOCAL_DB_PASSWORD ?? "";
const syncLocalDatabasePort = Number(process.env.SYNC_LOCAL_DB_PORT ?? 5432);

function parseJsonEnvArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBooleanEnv(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

if (isLive && databaseEngine !== "postgres") {
  throw new Error(
    "Live mode requires PostgreSQL. Set DATABASE_ENGINE=postgres and provide DATABASE_URL or DB_HOST/DB_NAME/DB_USER credentials.",
  );
}

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
  goldenRecords: {
    apiKey: goldenRecordsApiKey,
    authMode: goldenRecordsAuthMode,
    baseUrl: goldenRecordsBaseUrl,
    password: goldenRecordsPassword,
    userAgent: goldenRecordsUserAgent,
    username: goldenRecordsUsername,
  },
  sync: {
    apiBaseUrl: syncApiBaseUrl,
    localPostgres: {
      databaseName: syncLocalDatabaseName,
      host: syncLocalDatabaseHost,
      password: syncLocalDatabasePassword,
      port: syncLocalDatabasePort,
      url: syncLocalDatabaseUrl,
      user: syncLocalDatabaseUser,
    },
    machineCredentials: parseJsonEnvArray(syncMachineCredentialsJson)
      .map((entry) => ({
        disabled: Boolean(entry?.disabled),
        machineId: String(entry?.machineId ?? "").trim(),
        secretHash: String(entry?.secretHash ?? ""),
      }))
      .filter((entry) => entry.machineId && entry.secretHash),
    machineId: syncMachineId,
    machineSecret: syncMachineSecret,
    nodeMode: syncNodeMode,
    isCloudSyncServer: syncNodeMode === "cloud-server",
    isLocalPiNode: syncNodeMode === "local-pi",
    serverEnabled: parseBooleanEnv(process.env.SYNC_SERVER_ENABLED),
    pullBatchSize: syncPullBatchSize,
    pushBatchSize: syncPushBatchSize,
    requestTimeoutMs: syncRequestTimeoutMs,
  },
  postgres: {
    databaseName,
    host: databaseHost,
    password: databasePassword,
    port: databasePort,
    socketDirectory: buildPostgresSocketDirectory(cloudSqlInstanceConnectionName),
    user: databaseUser,
  },
};
