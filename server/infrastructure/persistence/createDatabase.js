import Database from "better-sqlite3";
import pg from "pg";
import { mkdirSync } from "node:fs";

const { Pool } = pg;

function createSqliteDatabase({
  dataDirectory,
  databasePath,
  exportsDirectory,
}) {
  // Ensure operational directories exist before SQLite opens the database file
  // or export endpoints try to write generated reports.
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(exportsDirectory, { recursive: true });

  return new Database(databasePath);
}

function createPostgresPool(runtime) {
  const { databaseUrl, postgres } = runtime;

  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
    });
  }

  if (!postgres.databaseName || !postgres.user) {
    throw new Error(
      "PostgreSQL mode requires DATABASE_URL or both DB_NAME and DB_USER.",
    );
  }

  const baseConfig = {
    database: postgres.databaseName,
    password: postgres.password || undefined,
    port: postgres.port,
    user: postgres.user,
  };

  if (postgres.socketDirectory) {
    return new Pool({
      ...baseConfig,
      host: postgres.socketDirectory,
    });
  }

  if (!postgres.host) {
    throw new Error(
      "PostgreSQL mode requires DB_HOST or INSTANCE_CONNECTION_NAME when DATABASE_URL is not set.",
    );
  }

  return new Pool({
    ...baseConfig,
    host: postgres.host,
  });
}

function createPostgresDatabase(runtime) {
  const pool = createPostgresPool(runtime);

  return {
    close: async () => {
      await pool.end();
    },
    engine: "postgres",
    pool,
  };
}

export function createDatabase(runtime) {
  if (runtime.databaseEngine === "postgres") {
    return createPostgresDatabase(runtime);
  }

  return createSqliteDatabase(runtime);
}
