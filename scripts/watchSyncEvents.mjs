import process from "node:process";
import pg from "pg";
import { serverRuntime } from "../server/config/runtime.js";
import { readSyncStatus } from "../server/domain/services/localDatabaseSyncService.js";
import { createSyncGateway } from "../server/infrastructure/persistence/syncGateway.js";
import { runLiveSyncWatcher, runLocalSyncChild, validateWatcherConfig } from "./lib/liveSyncWatcher.mjs";

async function main() {
  const { sync } = serverRuntime;
  validateWatcherConfig(sync);
  const local = sync.localPostgres;
  if (!local.url && (!local.databaseName || !local.user || !local.host)) {
    throw new Error("Local PostgreSQL configuration is required.");
  }
  const pool = new pg.Pool({
    ...(local.url ? { connectionString: local.url } : {
      database: local.databaseName,
      host: local.host,
      password: local.password || undefined,
      port: local.port,
      user: local.user,
    }),
    max: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 10000,
    statement_timeout: 10000,
  });
  const log = (message) => console.log(message);
  pool.on("error", () => log("Local sync database connection failed."));
  const syncGateway = createSyncGateway({ pool });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  try {
    await runLiveSyncWatcher({
      sync,
      signal: controller.signal,
      readCheckpoint: async () => (await readSyncStatus({ syncGateway })).currentCheckpoint,
      runSync: runLocalSyncChild,
      log,
    });
  } finally {
    await pool.end();
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}

try {
  await main();
} catch {
  console.error("Sync watcher stopped: check local-pi mode, sync configuration, and database availability.");
  process.exitCode = 1;
}
