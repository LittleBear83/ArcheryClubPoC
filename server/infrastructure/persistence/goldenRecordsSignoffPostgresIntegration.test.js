import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { after, before, test } from "node:test";
import pg from "pg";
import { runPostgresMigrations } from "./runPostgresMigrations.js";
import { createMemberDistanceSignOffRepository } from "./memberDistanceSignOffRepository.js";
import { upsertMemberDistanceSignOffRows } from "./localSyncCommitteeGateway.js";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName,
  TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";

const { Pool } = pg;
const databaseName = `${TEST_DATABASE_PREFIX}signoff_${randomUUID().replaceAll("-", "")}`;
const piDatabaseName = `${TEST_DATABASE_PREFIX}signoff_pi_${randomUUID().replaceAll("-", "")}`;
let adminPool;
let testPool;
let piPool;
const migrationOptions = { committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test cupboard",
  permissionDefinitions: [], seedUsers: [], systemRoleDefinitions: [] };

before(async () => {
  assertSafeIntegrationEnvironment(process.env);
  if (process.env.DATABASE_URL) throw new Error("Integration test must not use DATABASE_URL");
  if (process.env.ARCHERY_POSTGRES_TEST_DATABASE) throw new Error("Integration test requires its own disposable database");
  assertSafeTemporaryDatabaseName(databaseName);
  assertSafeTemporaryDatabaseName(piDatabaseName);
  const connection = { host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER, password: process.env.PGPASSWORD || undefined };
  adminPool = new Pool({ ...connection, database: "postgres" });
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await adminPool.query(`CREATE DATABASE "${piDatabaseName}"`);
  testPool = new Pool({ ...connection, database: databaseName });
  piPool = new Pool({ ...connection, database: piDatabaseName });
});

after(async () => {
  await testPool?.end();
  await piPool?.end();
  if (adminPool) {
    assertSafeTemporaryDatabaseName(databaseName);
    assertSafeTemporaryDatabaseName(piDatabaseName);
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await adminPool.query(`DROP DATABASE IF EXISTS "${piDatabaseName}" WITH (FORCE)`);
    await adminPool.end();
  }
});

test("production-compatible sign-offs migrate to nullable external signers without losing manual approvals", async () => {
  await runPostgresMigrations({ ...migrationOptions, pool: testPool });
  await testPool.query(`INSERT INTO users (username, first_name, surname, active_member) VALUES
    ('member', 'Club', 'Member', 1), ('coach', 'Club', 'Coach', 1)`);

  // Re-create the previous production constraint and migration marker in this
  // disposable database, then exercise the actual migration runner.
  await testPool.query(`ALTER TABLE member_distance_sign_offs ALTER COLUMN signed_off_by_username SET NOT NULL`);
  await testPool.query(`ALTER TABLE member_distance_sign_offs DROP CONSTRAINT member_distance_sign_offs_manual_signer_check`);
  await testPool.query(`DELETE FROM schema_migrations WHERE version = '025_external_distance_signers'`);
  await testPool.query(`INSERT INTO member_distance_sign_offs
    (username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time)
    VALUES ('member', 'Recurve Bow', 20, 'coach', 'manual', '2026-01-01', '10:00:00')`);
  await runPostgresMigrations({ ...migrationOptions, pool: testPool });
  const schema = await testPool.query(`SELECT is_nullable FROM information_schema.columns
    WHERE table_name = 'member_distance_sign_offs' AND column_name = 'signed_off_by_username'`);
  assert.equal(schema.rows[0].is_nullable, "YES");
  const constraint = await testPool.query(`SELECT 1 FROM pg_constraint
    WHERE conname = 'member_distance_sign_offs_manual_signer_check'`);
  assert.equal(constraint.rowCount, 1);

  const repository = createMemberDistanceSignOffRepository({ engine: "postgres", pool: testPool },
    { allowedDisciplines: ["Recurve Bow"], distanceYards: [20, 30, 40, 60] });
  const imported = (distanceYards) => ({ username: "member", discipline: "Recurve Bow",
    distanceYards, source: "golden-records", signedOffByUsername: null,
    signedOffAtDate: "2026-02-01", signedOffAtTime: "09:00:00" });
  await repository.replaceForDiscipline("member", "Recurve Bow", [imported(20), imported(40)]);
  await repository.replaceForDiscipline("member", "Recurve Bow", [imported(20), imported(40)]);
  await repository.replaceForDiscipline("member", "Recurve Bow", []);
  const rows = await repository.listByUsername("member");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ distanceYards, signedOffByUsername, source, signedOffAt, signedOffAtTime }) =>
    ({ distanceYards, signedOffByUsername, source, signedOffAt, signedOffAtTime })), [
    { distanceYards: 20, signedOffByUsername: "coach", source: "manual",
      signedOffAt: "2026-01-01", signedOffAtTime: "10:00:00" },
    { distanceYards: 40, signedOffByUsername: null, source: "golden-records",
      signedOffAt: "2026-02-01", signedOffAtTime: "09:00:00" },
  ]);
  await assert.rejects(testPool.query(`INSERT INTO member_distance_sign_offs
    (username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time)
    VALUES ('member', 'Recurve Bow', 30, NULL, 'manual', '2026-02-01', '09:00:00')`),
  { code: "23514" });
  await assert.rejects(testPool.query(`INSERT INTO member_distance_sign_offs
    (username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time)
    VALUES ('member', 'Recurve Bow', 30, 'scheduler', 'manual', '2026-02-01', '09:00:00')`),
  { code: "23503" });

  await assert.rejects(repository.replaceForDiscipline("member", "Recurve Bow", [
    imported(30), { ...imported(50), username: "missing-member" },
  ]), { code: "23503" });
  assert.equal((await repository.listByUsername("member")).length, 2,
    "a failed multi-row import must roll back its earlier insert");

  await upsertMemberDistanceSignOffRows(testPool, [{ username: "member", discipline: "Recurve Bow",
    distance_yards: 60, signed_off_by_username: null, source: "golden-records",
    signed_off_at_date: "2026-02-02", signed_off_at_time: "12:00:00" }]);
  await runPostgresMigrations({ ...migrationOptions, pool: testPool });
  const replicated = await testPool.query(`SELECT signed_off_by_username, signed_off_by_user_id
    FROM member_distance_sign_offs WHERE username = 'member' AND distance_yards = 60`);
  assert.deepEqual(replicated.rows, [{ signed_off_by_username: null, signed_off_by_user_id: null }]);
  assert.equal((await repository.listByUsername("member")).length, 3);
});

test("old Pi PostgreSQL rejects null-signer Cloud rows until its migration 025 runs", async () => {
  await runPostgresMigrations({ ...migrationOptions, pool: piPool });
  await piPool.query(`INSERT INTO users (username, first_name, surname, active_member) VALUES
    ('member', 'Club', 'Member', 1), ('coach', 'Club', 'Coach', 1)`);
  await piPool.query(`ALTER TABLE member_distance_sign_offs ALTER COLUMN signed_off_by_username SET NOT NULL`);
  await piPool.query(`ALTER TABLE member_distance_sign_offs DROP CONSTRAINT member_distance_sign_offs_manual_signer_check`);
  await piPool.query(`DELETE FROM schema_migrations WHERE version = '025_external_distance_signers'`);
  await piPool.query(`INSERT INTO member_distance_sign_offs
    (username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time)
    VALUES ('member', 'Recurve Bow', 20, 'coach', 'manual', '2026-01-01', '10:00:00')`);
  const cloudRow = (await testPool.query(`SELECT username, discipline, distance_yards,
    signed_off_by_username, source, signed_off_at_date, signed_off_at_time
    FROM member_distance_sign_offs WHERE username = 'member' AND distance_yards = 40`)).rows[0];
  await assert.rejects(upsertMemberDistanceSignOffRows(piPool, [cloudRow]), { code: "23502" });
  await runPostgresMigrations({ ...migrationOptions, pool: piPool });
  await upsertMemberDistanceSignOffRows(piPool, [cloudRow]);
  const rows = await piPool.query(`SELECT distance_yards, signed_off_by_username, source,
    signed_off_at_date, signed_off_at_time FROM member_distance_sign_offs
    WHERE username = 'member' ORDER BY distance_yards`);
  assert.deepEqual(rows.rows, [
    { distance_yards: 20, signed_off_by_username: "coach", source: "manual",
      signed_off_at_date: "2026-01-01", signed_off_at_time: "10:00:00" },
    { distance_yards: 40, signed_off_by_username: null, source: "golden-records",
      signed_off_at_date: "2026-02-01", signed_off_at_time: "09:00:00" },
  ]);
});
