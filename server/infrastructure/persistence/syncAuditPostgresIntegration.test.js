import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import pg from "pg";
import express from "express";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName, TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";
import { runPostgresMigrations } from "./runPostgresMigrations.js";
import { migration } from "./postgresMigrations/018_synced_rfid_audit.js";
import { createSyncGateway } from "./syncGateway.js";
import { createSyncPublicationGateway } from "./syncPublicationGateway.js";
import { createAuditLogGateway } from "./auditLogGateway.js";
import { registerSyncRoutes } from "../../presentation/http/registerSyncRoutes.js";
import { registerPublicationSyncRoutes } from "../../presentation/http/registerPublicationSyncRoutes.js";
import { registerAuditRoutes } from "../../presentation/http/registerAuditRoutes.js";
import { createMachineSyncAuth } from "../../security/machineAuth.js";

const runFile = promisify(execFile);
const databases = [];
const pools = [];
let admin;
let cloud;
let pi;
let server;
let baseUrl;
let piName;
let cloudGateway;
let piGateway;
let failAudit = false;
const requests = [];
const headers = { "content-type": "application/json", "x-sync-machine-id": "selby-pi-1", "x-sync-machine-secret": "fixture-secret" };

before(async () => {
  assertSafeIntegrationEnvironment(process.env);
  admin = new pg.Pool({ database: "postgres" });
  for (const label of ["cloud_audit", "pi_audit"]) {
    const name = `${TEST_DATABASE_PREFIX}${label}_${randomUUID().replaceAll("-", "")}`;
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`CREATE DATABASE "${name}"`);
    databases.push(name);
    const pool = new pg.Pool({ database: name });
    pools.push(pool);
    await runPostgresMigrations({ pool, committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test",
      permissionDefinitions: [], seedUsers: [], systemRoleDefinitions: [] });
    await pool.query("INSERT INTO users (username, first_name, surname) VALUES ('robin', 'Robin', 'Archer')");
  }
  [cloud, pi] = pools;
  piName = databases[1];
  cloudGateway = createSyncGateway({ pool: cloud });
  piGateway = createSyncGateway({ pool: pi });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { requests.push(req.path); next(); });
  const authenticateMachineRequest = createMachineSyncAuth({
    credentials: [{ machineId: "selby-pi-1", secretHash: "fixture-hash" }],
    verifySecret: (provided) => provided === "fixture-secret",
  }).authenticateMachineRequest;
  registerSyncRoutes({ app, authenticateMachineRequest, syncGateway: {
    ...cloudGateway,
    async upsertLoginEventFromSync(args) {
      await cloudGateway.upsertLoginEventFromSync(args);
      if (failAudit) throw new Error("fixture transaction failure");
    },
  } });
  registerPublicationSyncRoutes({ app, authenticateMachineRequest,
    publicationGateway: createSyncPublicationGateway({ pool: cloud }) });
  registerAuditRoutes({ app, auditLogGateway: createAuditLogGateway({ databaseEngine: "postgres", pool: cloud }),
    getActorUser: () => ({ username: "committee" }), actorHasPermission: () => true, PERMISSIONS: { VIEW_REPORTS: "view_reports" } });
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await Promise.all(pools.map((pool) => pool.end()));
  for (const name of databases) {
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await admin?.end();
});

async function queueEvent(eventId, method = "rfid", time = "18:32:00.000Z") {
  await piGateway.enqueueLoginEvent({ eventId, loggedInDate: "2026-09-30", loggedInTime: time,
    loginMethod: method, machineId: "selby-pi-1", sourceNodeMode: "local-pi", username: "robin" });
  return (await piGateway.listPendingOutboxEvents({ limit: 200 })).find((row) => row.eventId === eventId);
}

async function push(event) {
  return fetch(`${baseUrl}/api/sync/v1/push`, { method: "POST", headers,
    body: JSON.stringify({ events: [event] }) });
}

test("Pi outbox -> authenticated Cloud push -> Audit Report uses original RFID time exactly once", async () => {
  const event = await queueEvent("audit-rfid-1");
  assert.equal((await push(event)).status, 200);
  assert.equal((await push(event)).status, 200);
  // An altered retry must still describe the persisted, original event.
  assert.equal((await push({ ...event, payload: { ...event.payload, loggedInTime: "21:15:00.000Z" } })).status, 200);
  await piGateway.acknowledgeOutboxEvents({ eventIds: [event.eventId] });
  const { rows } = await cloud.query("SELECT * FROM audit_events WHERE sync_event_id = $1", [event.eventId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].created_at_date, "2026-09-30");
  assert.equal(rows[0].created_at_time, "18:32:00.000Z");
  assert.equal(rows[0].action, "RFID Sign-in");
  const response = await fetch(`${baseUrl}/api/audit-events`);
  const report = (await response.json()).auditEvents.find((entry) => entry.metadata?.entityId === event.eventId);
  assert.equal(report.actorUsername, "robin");
  assert.equal(report.metadata.entityLabel, "Robin Archer");
  assert.ok(report.metadata.changes.some((change) => change.path === "sourceMachineId" && change.after === "selby-pi-1"));
  assert.equal(requests.some((path) => path.endsWith("/events")), false, "no SSE or browser client was connected");
});

test("Cloud transaction failure leaves RFID queued and retry produces a single audit", async () => {
  const event = await queueEvent("audit-retry-1");
  failAudit = true;
  assert.equal((await push(event)).status, 500);
  failAudit = false;
  for (const table of ["audit_events", "login_events"]) {
    assert.equal((await cloud.query(`SELECT * FROM ${table} WHERE sync_event_id = $1`, [event.eventId])).rowCount, 0);
  }
  assert.ok((await piGateway.listPendingOutboxEvents()).some((row) => row.eventId === event.eventId));
  assert.equal((await push(event)).status, 200);
  await piGateway.acknowledgeOutboxEvents({ eventIds: [event.eventId] });
  assert.equal((await cloud.query("SELECT * FROM audit_events WHERE sync_event_id = $1", [event.eventId])).rowCount, 1);
});

test("concurrent replay creates one login and one audit under real unique constraints", async () => {
  const event = await queueEvent("audit-concurrent");
  const responses = await Promise.all([push(event), push(event)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  for (const table of ["audit_events", "login_events"]) {
    assert.equal((await cloud.query(`SELECT * FROM ${table} WHERE sync_event_id = $1`, [event.eventId])).rowCount, 1);
  }
  await piGateway.acknowledgeOutboxEvents({ eventIds: [event.eventId] });
});

test("migration backfills missing history once and preserves existing Pi auth audits and non-RFID history", async () => {
  await queueEvent("audit-existing-pi", "rfid", "17:00:00.000Z");
  await queueEvent("audit-missing-pi", "rfid", "17:01:00.000Z");
  await queueEvent("audit-password-pi", "password", "17:02:00.000Z");
  await pi.query(`INSERT INTO audit_events (actor_username, action, target, status_code, created_at_date, created_at_time)
    VALUES ('robin', 'MEMBER_ACTIVITY_CREATED', '/api/auth/rfid/check-in', 200, '2026-09-30', '17:00:00.000Z')`);
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const statement of migration.statements) await pi.query(statement);
  }
  assert.equal((await pi.query("SELECT * FROM audit_events WHERE created_at_time = '17:00:00.000Z'")).rowCount, 1);
  assert.equal((await pi.query("SELECT * FROM audit_events WHERE sync_event_id = 'audit-missing-pi'")).rowCount, 1);
  assert.equal((await pi.query("SELECT * FROM audit_events WHERE sync_event_id = 'audit-password-pi'")).rowCount, 0);
  const password = (await piGateway.listPendingOutboxEvents()).find((row) => row.eventId === "audit-password-pi");
  assert.equal((await push(password)).status, 200);
  assert.equal((await cloud.query("SELECT * FROM audit_events WHERE sync_event_id = 'audit-password-pi'")).rowCount, 0);
});

test("historical checkpoint requests stay stored but are absent from the human report", async () => {
  await cloud.query(`INSERT INTO audit_events (action, target, status_code, metadata_json, created_at_date, created_at_time)
    VALUES ('POST /api/sync/v1/pull', '/api/sync/v1/pull', 200, '{"body":{"checkpoint":12733,"limit":200}}', '2026-09-30', '22:00:00')`);
  const response = await fetch(`${baseUrl}/api/audit-events`);
  assert.equal((await response.json()).auditEvents.some((entry) => entry.target.startsWith("/api/sync/")), false);
  assert.equal((await cloud.query("SELECT * FROM audit_events WHERE target = '/api/sync/v1/pull'")).rowCount, 1);
});

async function runSync(args) {
  return runFile(process.execPath, ["scripts/syncLocalDatabase.mjs", ...args], {
    cwd: new URL("../../../", import.meta.url), windowsHide: true, timeout: 30000,
    env: { ...process.env, SYNC_NODE_MODE: "local-pi", SYNC_API_BASE_URL: baseUrl,
      SYNC_MACHINE_ID: "selby-pi-1", SYNC_MACHINE_SECRET: "fixture-secret",
      SYNC_LOCAL_DATABASE_URL: "", SYNC_LOCAL_DB_HOST: process.env.PGHOST,
      SYNC_LOCAL_DB_PORT: process.env.PGPORT ?? "5432", SYNC_LOCAL_DB_NAME: piName,
      SYNC_LOCAL_DB_USER: process.env.PGUSER, SYNC_LOCAL_DB_PASSWORD: process.env.PGPASSWORD ?? "",
      SYNC_PUSH_BATCH_SIZE: "1", SYNC_PULL_BATCH_SIZE: "1" },
  });
}

test("nightly v1 CLI drains multiple queued batches and repairs Cloud -> Pi drift without SSE", async () => {
  await cloud.query("UPDATE users SET first_name = 'Authoritative' WHERE username = 'robin'");
  await piGateway.writeLocalState({ stateKey: "local_machine_sync", state: { currentCheckpoint: 99999999 } });
  await runSync(["--reconcile"]);
  assert.equal(await piGateway.countPendingOutboxEvents(), 0);
  assert.equal((await pi.query("SELECT first_name FROM users WHERE username = 'robin'")).rows[0].first_name, "Authoritative");
  assert.ok((await piGateway.readLocalState("local_machine_sync")).state.lastReconciledAt);
  assert.equal(await piGateway.readLocalState("local_machine_publication_sync_v2"), null);
});

test("nightly lock contention exits unsuccessfully so systemd retries instead of losing the scheduled run", async () => {
  const lockClient = await pi.connect();
  try {
    assert.equal(await piGateway.acquireSyncLock(lockClient), true);
    await assert.rejects(runSync(["--reconcile"]), (error) => error.code === 1);
  } finally {
    await piGateway.releaseSyncLock(lockClient);
    lockClient.release();
  }
});

test("nightly CLI detects an existing v2 baseline and keeps its feed and cursor separate", async () => {
  await runSync(["--v2", "--rebaseline"]);
  const v1Checkpoint = (await piGateway.readLocalState("local_machine_sync")).state.currentCheckpoint;
  await cloud.query("UPDATE users SET first_name = 'V2 Authoritative' WHERE username = 'robin'");
  const start = requests.length;
  await runSync(["--reconcile"]);
  assert.ok(requests.slice(start).includes("/api/sync/v2/snapshot"));
  assert.equal((await pi.query("SELECT first_name FROM users WHERE username = 'robin'")).rows[0].first_name, "V2 Authoritative");
  assert.equal((await piGateway.readLocalState("local_machine_sync")).state.currentCheckpoint, v1Checkpoint);
  assert.equal(typeof (await piGateway.readLocalState("local_machine_publication_sync_v2")).state.publicationCheckpoint, "string");
});
