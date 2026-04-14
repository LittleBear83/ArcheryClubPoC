import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";

export function createDatabase({
  dataDirectory,
  databasePath,
  exportsDirectory,
}) {
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(exportsDirectory, { recursive: true });

  return new Database(databasePath);
}
