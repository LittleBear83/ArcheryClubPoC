import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPostgresInsertSql,
  buildResetSequenceStatements,
  buildSqliteSelectSql,
  buildTruncateSql,
  getOrderedTableCopies,
} from "./sqliteToPostgresMigration.js";

test("migration copy plan includes users and equipment in dependency order", () => {
  const tables = getOrderedTableCopies().map((entry) => entry.tableName);

  assert.ok(tables.indexOf("users") < tables.indexOf("equipment_items"));
  assert.ok(tables.indexOf("equipment_items") < tables.indexOf("equipment_loans"));
  assert.ok(tables.includes("beginners_course_participants"));
});

test("buildSqliteSelectSql uses explicit columns and ordering", () => {
  assert.equal(
    buildSqliteSelectSql({
      columns: ["id", "username"],
      sqliteOrderBy: "id ASC",
      tableName: "users",
    }),
    'SELECT "id", "username" FROM "users" ORDER BY id ASC',
  );
});

test("buildPostgresInsertSql quotes identifiers and placeholders", () => {
  assert.equal(
    buildPostgresInsertSql({
      columns: ["id", "username"],
      tableName: "users",
    }),
    'INSERT INTO "users" ("id", "username") VALUES ($1, $2)',
  );
});

test("buildTruncateSql resets the target tables in reverse dependency order", () => {
  const truncateSql = buildTruncateSql();

  assert.ok(truncateSql.startsWith("TRUNCATE "));
  assert.ok(truncateSql.includes('"users"'));
  assert.ok(truncateSql.endsWith(" RESTART IDENTITY CASCADE"));
});

test("buildResetSequenceStatements resets every serial table", () => {
  const statements = buildResetSequenceStatements();

  assert.ok(statements.some((entry) => entry.values[0] === "users"));
  assert.ok(statements.some((entry) => entry.values[0] === "equipment_items"));
  assert.ok(
    statements.every((entry) => entry.sql.includes("pg_get_serial_sequence")),
  );
});

