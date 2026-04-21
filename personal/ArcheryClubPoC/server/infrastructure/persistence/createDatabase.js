import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

export function createDatabase({
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
