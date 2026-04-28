import Database from "better-sqlite3";
import pg from "pg";
import { createDatabase } from "../server/infrastructure/persistence/createDatabase.js";
import { serverRuntime } from "../server/config/runtime.js";
import {
  buildPostgresInsertSql,
  buildResetSequenceStatements,
  buildSqliteSelectSql,
  buildTruncateSql,
  getOrderedTableCopies,
} from "../server/infrastructure/persistence/sqliteToPostgresMigration.js";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    keepTargetData: argv.includes("--keep-target-data"),
    sqlitePath:
      process.env.SQLITE_PATH ??
      process.env.DATABASE_PATH ??
      serverRuntime.databasePath,
  };
}

async function withPostgresClient(runtime, callback) {
  if (runtime.databaseEngine !== "postgres") {
    throw new Error("Set DATABASE_ENGINE=postgres before running the migration script.");
  }

  const db = createDatabase(runtime);
  const client = await db.pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
    await db.close();
  }
}

function mapSqliteRowToValues(columns, row) {
  return columns.map((column) => row[column] ?? null);
}

async function migrateTable({
  client,
  dryRun,
  insertSql,
  sqliteDb,
  sqliteSelectSql,
  tableName,
  columns,
}) {
  const rows = sqliteDb.prepare(sqliteSelectSql).all();

  if (dryRun) {
    return {
      insertedRowCount: rows.length,
      tableName,
    };
  }

  for (const row of rows) {
    await client.query(insertSql, mapSqliteRowToValues(columns, row));
  }

  return {
    insertedRowCount: rows.length,
    tableName,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sqliteDb = new Database(options.sqlitePath, { readonly: true });
  const summaries = [];

  try {
    await withPostgresClient(serverRuntime, async (client) => {
      await client.query("BEGIN");

      try {
        if (!options.keepTargetData && !options.dryRun) {
          await client.query(buildTruncateSql());
        }

        for (const tableCopy of getOrderedTableCopies()) {
          const summary = await migrateTable({
            client,
            columns: tableCopy.columns,
            dryRun: options.dryRun,
            insertSql: buildPostgresInsertSql(tableCopy),
            sqliteDb,
            sqliteSelectSql: buildSqliteSelectSql(tableCopy),
            tableName: tableCopy.tableName,
          });

          summaries.push(summary);
        }

        if (!options.dryRun) {
          for (const statement of buildResetSequenceStatements()) {
            await client.query(statement.sql, statement.values);
          }
        }

        await client.query(options.dryRun ? "ROLLBACK" : "COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  } finally {
    sqliteDb.close();
  }

  for (const summary of summaries) {
    console.log(`${summary.tableName}: ${summary.insertedRowCount} rows`);
  }

  console.log(
    options.dryRun
      ? "Dry run complete. PostgreSQL transaction was rolled back."
      : "SQLite to PostgreSQL migration complete.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
