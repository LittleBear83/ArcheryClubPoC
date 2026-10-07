import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import pg from "pg";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName, TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";
import { runPostgresMigrations } from "./runPostgresMigrations.js";
import { createSyncGateway } from "./syncGateway.js";
import { createLoginMethodReportingGateway } from "./loginMethodReportingGateway.js";
import { buildLoginMethodReport, resolveDashboardPeriod } from "../../domain/services/loginMethodReport.js";
import { applyAuthChanges } from "../../domain/services/localDatabaseSyncService.js";

let admin, cloud, pi;
const databases = [], pools = [];
before(async () => {
  assertSafeIntegrationEnvironment(process.env);
  admin = new pg.Pool({ database: "postgres" });
  for (const label of ["login_report_cloud", "login_report_pi"]) {
    const name = `${TEST_DATABASE_PREFIX}${label}_${randomUUID().replaceAll("-", "")}`;
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`CREATE DATABASE "${name}"`);
    databases.push(name);
    const pool = new pg.Pool({ database: name });
    pools.push(pool);
    await runPostgresMigrations({ pool, committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test", permissionDefinitions: [], seedUsers: [], systemRoleDefinitions: [] });
    await pool.query("INSERT INTO users (username, first_name, surname) VALUES ('robin', 'Robin', 'Archer')");
  }
  [cloud, pi] = pools;
});
after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
  for (const name of databases) {
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await admin?.end();
});

test("PostgreSQL login-method report counts synced success once, filters dates and agrees with replicated Pi data", async () => {
  const sync = createSyncGateway({ pool: cloud });
  for (const [eventId, loginMethod, loggedInDate] of [
    ["scan", "rfid", "2026-09-29"], ["scan", "rfid", "2026-09-29"],
    ["mobile", "mobile-app", "2026-10-05"], ["web", "password", "2026-10-05"],
    ["phone-web", "password-mobile", "2026-10-05"], ["legacy", "legacy", "2026-10-05"],
    ["before", "password", "2026-09-28"], ["future", "password", "2026-10-06"],
  ]) {
    await sync.upsertLoginEventFromSync({ eventId, loginMethod, loggedInDate, loggedInTime: "12:00:00.000Z", username: "robin", machineId: "test-pi" });
  }
  await cloud.query("INSERT INTO audit_events (action, target, status_code, created_at_date, created_at_time) VALUES ('login_failed', '/api/auth/login', 401, '2026-10-05', '12:00:00')");
  const period = resolveDashboardPeriod("7d", new Date("2026-10-05T15:00:00Z"));
  const gateway = createLoginMethodReportingGateway({ databaseEngine: "postgres", pool: cloud });
  const report = buildLoginMethodReport(await gateway.countByMethod(period), period);
  assert.equal(report.total, 4);
  assert.equal(report.excludedOtherCount, 1);
  assert.deepEqual(report.methods.map((entry) => [entry.count, entry.percentage]), [[1, 25], [1, 25], [2, 50]]);
  const all = resolveDashboardPeriod("all", new Date("2026-10-05T15:00:00Z"));
  assert.equal(buildLoginMethodReport(await gateway.countByMethod(all), all).total, 5);
  const empty = resolveDashboardPeriod("7d", new Date("2025-01-01T00:00:00Z"));
  assert.equal(buildLoginMethodReport(await gateway.countByMethod(empty), empty).total, 0);
  const changes = (await sync.listChangesAfterCheckpoint({ checkpoint: 0, limit: 100 })).filter((row) => row.domain === "login_events");
  const client = await pi.connect();
  try {
    for (let retry = 0; retry < 2; retry++) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('archery.sync.apply_mode', 'pull', true)");
      await applyAuthChanges({ client, changes, deactivatedRfidSuffix: "-deactivated" });
      await client.query("COMMIT");
    }
  } finally { client.release(); }
  const piGateway = createLoginMethodReportingGateway({ databaseEngine: "postgres", pool: pi });
  assert.deepEqual(buildLoginMethodReport(await piGateway.countByMethod(period), period), report);
});
