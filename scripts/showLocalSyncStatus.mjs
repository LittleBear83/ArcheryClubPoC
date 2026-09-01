import process from "node:process";
import pg from "pg";
import { serverRuntime } from "../server/config/runtime.js";
import { readSyncStatus } from "../server/domain/services/localDatabaseSyncService.js";
import { createSyncGateway } from "../server/infrastructure/persistence/syncGateway.js";

const { Pool } = pg;

function createLocalPool() {
  const { localPostgres } = serverRuntime.sync;

  if (localPostgres.url) {
    return new Pool({
      connectionString: localPostgres.url,
    });
  }

  return new Pool({
    database: localPostgres.databaseName,
    host: localPostgres.host,
    password: localPostgres.password || undefined,
    port: localPostgres.port,
    user: localPostgres.user,
  });
}

const pool = createLocalPool();

try {
  const syncGateway = createSyncGateway({ pool });
  const status = await readSyncStatus({ syncGateway });
  console.log(JSON.stringify(status, null, 2));
} finally {
  await pool.end();
}

process.exitCode = 0;
