import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { test } from "node:test";
import pg from "pg";
import { buildInitialSchemaSql } from "./runPostgresMigrations.js";
import { migration } from "./postgresMigrations/024_remembered_devices.js";
import { createRememberedDeviceGateway } from "./rememberedDeviceGateway.js";
import { createRememberedDeviceService } from "../../domain/services/rememberedDeviceService.js";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName,
  TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";

test("PostgreSQL remembered devices revoke on password reset and deactivation", {
  skip: process.env.ARCHERY_POSTGRES_INTEGRATION_TESTS !== "1",
}, async () => {
  assertSafeIntegrationEnvironment(process.env);
  const databaseName = `${TEST_DATABASE_PREFIX}remembered_${randomUUID().replaceAll("-", "")}`;
  assertSafeTemporaryDatabaseName(databaseName);
  const options = { host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD || undefined };
  const admin = new pg.Pool({ ...options, database: "postgres" });
  let pool;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new pg.Pool({ ...options, database: databaseName });
    await pool.query(buildInitialSchemaSql());
    for (const statement of migration.statements) await pool.query(statement);
    const result = await pool.query(`INSERT INTO users
      (username, first_name, surname, password, active_member)
      VALUES ('archer', 'A', 'Archer', 'first-hash', 1) RETURNING id`);
    const userId = result.rows[0].id;
    const gateway = createRememberedDeviceGateway({ databaseEngine: "postgres", pool });
    const service = createRememberedDeviceService({ gateway, secret: "test-secret" });
    const user = async () => (await pool.query("SELECT * FROM users WHERE id = $1", [userId])).rows[0];

    await service.issue(await user());
    await service.issue(await user());
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM remembered_devices")).rows[0].count, 2);
    await pool.query("UPDATE users SET password = 'reset-hash' WHERE id = $1", [userId]);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM remembered_devices")).rows[0].count, 0);

    const token = (await service.issue(await user())).token;
    await pool.query("UPDATE users SET active_member = 0 WHERE id = $1", [userId]);
    await pool.query("UPDATE users SET active_member = 1 WHERE id = $1", [userId]);
    assert.equal(await service.authenticate(token, async () => user()), null);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
});
