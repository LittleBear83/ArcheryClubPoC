import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { after, before, test } from "node:test";
import pg from "pg";

import {
  runPostgresMigrations,
} from "./runPostgresMigrations.js";
import {
  assertSafeTemporaryDatabaseName,
  TEST_DATABASE_PREFIX,
} from "./phase2a1PostgresIntegrationGuards.js";

const { Pool } = pg;

const allowedHosts = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "/var/run/postgresql",
]);

let adminPool;
let testPool;
let databaseName;

const externalDatabase =
  process.env.ARCHERY_POSTGRES_TEST_DATABASE || null;

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function assertSafeEnvironment() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("NODE_ENV must be test");
  }

  if (process.env.ARCHERY_POSTGRES_INTEGRATION_TESTS !== "1") {
    throw new Error("ARCHERY_POSTGRES_INTEGRATION_TESTS must be 1");
  }

  if (!allowedHosts.has(process.env.PGHOST)) {
    throw new Error(
      "PostgreSQL integration tests require a local PostgreSQL host",
    );
  }

  if (externalDatabase) {
    assertSafeTemporaryDatabaseName(externalDatabase);

    if (process.env.PGDATABASE !== externalDatabase) {
      throw new Error(
        "PGDATABASE must match ARCHERY_POSTGRES_TEST_DATABASE",
      );
    }
  } else if (process.env.PGDATABASE !== "postgres") {
    throw new Error(
      "PostgreSQL integration tests require the postgres maintenance database",
    );
  }

  if (!process.env.PGUSER) {
    throw new Error("PGUSER must be set");
  }
}

function createPool(database) {
  return new Pool({
    database,
    host: process.env.PGHOST,
    password: process.env.PGPASSWORD || undefined,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
  });
}

before(async () => {
  assertSafeEnvironment();

  if (externalDatabase) {
    databaseName = externalDatabase;
  } else {
    databaseName =
      `${TEST_DATABASE_PREFIX}m010_` +
      randomUUID().replaceAll("-", "");

    assertSafeTemporaryDatabaseName(databaseName);

    adminPool = createPool("postgres");

    await adminPool.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
    );
  }

  testPool = createPool(databaseName);

  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Test cupboard",
    permissionDefinitions: [],
    pool: testPool,
    seedUsers: [],
    systemRoleDefinitions: [],
  });
});

after(async () => {
  await testPool?.end();

  if (!externalDatabase && databaseName) {
    assertSafeTemporaryDatabaseName(databaseName);

    await adminPool?.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
    );
  }

  await adminPool?.end();
});

test(
  "migration 010 publishes committee roles and bow sign-offs without sync echo",
  async () => {
    const migration = await testPool.query(`
      SELECT version
      FROM schema_migrations
      WHERE version = '010_member_signoff_committee_sync'
    `);

    assert.equal(migration.rowCount, 1);

    const triggers = await testPool.query(`
      SELECT DISTINCT
        event_object_table AS table_name,
        trigger_name
      FROM information_schema.triggers
      WHERE trigger_name IN (
        'sync_member_distance_sign_offs_change_log_trigger',
        'sync_committee_roles_change_log_trigger'
      )
      ORDER BY trigger_name
    `);

    assert.deepEqual(
      triggers.rows,
      [
        {
          table_name: "committee_roles",
          trigger_name: "sync_committee_roles_change_log_trigger",
        },
        {
          table_name: "member_distance_sign_offs",
          trigger_name:
            "sync_member_distance_sign_offs_change_log_trigger",
        },
      ],
    );

    const triggerEvents = await testPool.query(`
      SELECT
        trigger_name,
        string_agg(
          event_manipulation,
          ',' ORDER BY event_manipulation
        ) AS events
      FROM information_schema.triggers
      WHERE trigger_name IN (
        'sync_member_distance_sign_offs_change_log_trigger',
        'sync_committee_roles_change_log_trigger'
      )
      GROUP BY trigger_name
      ORDER BY trigger_name
    `);

    assert.equal(triggerEvents.rowCount, 2);

    for (const row of triggerEvents.rows) {
      assert.equal(row.events, "DELETE,INSERT,UPDATE");
    }

    await testPool.query(`
      INSERT INTO users (
        username,
        first_name,
        surname,
        active_member
      )
      VALUES
        ('robin', 'Robin', 'Archer', 1),
        ('coach', 'Casey', 'Coach', 1)
    `);

    await testPool.query(`DELETE FROM sync_change_log`);

    await testPool.query(`
      INSERT INTO committee_roles (
        role_key,
        title,
        summary,
        responsibilities,
        personal_blurb,
        photo_data_url,
        display_order,
        assigned_username
      )
      VALUES (
        'test-chair',
        'Test Chair',
        'Initial',
        'Initial',
        '',
        NULL,
        1,
        'robin'
      )
    `);

    await testPool.query(`
      UPDATE committee_roles
      SET summary = 'Updated'
      WHERE role_key = 'test-chair'
    `);

    await testPool.query(`
      DELETE FROM committee_roles
      WHERE role_key = 'test-chair'
    `);

    const committeeChanges = await testPool.query(`
      SELECT record_key, operation
      FROM sync_change_log
      WHERE domain = 'committee_roles'
      ORDER BY change_id
    `);

    assert.deepEqual(
      committeeChanges.rows,
      [
        { record_key: "test-chair", operation: "upsert" },
        { record_key: "test-chair", operation: "upsert" },
        { record_key: "test-chair", operation: "delete" },
      ],
    );

    await testPool.query(`
      INSERT INTO member_distance_sign_offs (
        username,
        discipline,
        distance_yards,
        signed_off_by_username,
        source,
        signed_off_at_date,
        signed_off_at_time
      )
      VALUES (
        'robin',
        'Recurve',
        40,
        'coach',
        'manual',
        '2026-09-12',
        '17:30:00'
      )
    `);

    await testPool.query(`
      UPDATE member_distance_sign_offs
      SET distance_yards = 50
      WHERE username = 'robin'
        AND discipline = 'Recurve'
        AND distance_yards = 40
    `);

    await testPool.query(`
      DELETE FROM member_distance_sign_offs
      WHERE username = 'robin'
        AND discipline = 'Recurve'
        AND distance_yards = 50
    `);

    const signoffChanges = await testPool.query(`
      SELECT record_key, operation
      FROM sync_change_log
      WHERE domain = 'member_distance_sign_offs'
      ORDER BY change_id
    `);

    assert.deepEqual(
      signoffChanges.rows,
      [
        {
          record_key: "robin:recurve:40",
          operation: "upsert",
        },
        {
          record_key: "robin:recurve:40",
          operation: "delete",
        },
        {
          record_key: "robin:recurve:50",
          operation: "upsert",
        },
        {
          record_key: "robin:recurve:50",
          operation: "delete",
        },
      ],
    );

    await testPool.query("BEGIN");

    try {
      await testPool.query(
        `SELECT set_config('archery.sync.apply_mode', 'pull', true)`,
      );

      await testPool.query(`
        INSERT INTO member_distance_sign_offs (
          username,
          discipline,
          distance_yards,
          signed_off_by_username,
          source,
          signed_off_at_date,
          signed_off_at_time
        )
        VALUES (
          'robin',
          'Recurve',
          60,
          'coach',
          'manual',
          '2026-09-12',
          '17:31:00'
        )
      `);

      await testPool.query("COMMIT");
    } catch (error) {
      await testPool.query("ROLLBACK");
      throw error;
    }

    const pullEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'member_distance_sign_offs'
        AND record_key = 'robin:recurve:60'
    `);

    assert.equal(pullEcho.rows[0].count, 0);

    await testPool.query("BEGIN");

    try {
      await testPool.query(
        `SELECT set_config(
          'archery.sync.apply_mode',
          'maintenance',
          true
        )`,
      );

      await testPool.query(`
        INSERT INTO committee_roles (
          role_key,
          title,
          summary,
          responsibilities,
          personal_blurb,
          photo_data_url,
          display_order,
          assigned_username
        )
        VALUES (
          'maintenance-test-role',
          'Maintenance Test',
          'Suppressed',
          'Suppressed',
          '',
          NULL,
          99,
          'robin'
        )
      `);

      await testPool.query("COMMIT");
    } catch (error) {
      await testPool.query("ROLLBACK");
      throw error;
    }

    const maintenanceEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_roles'
        AND record_key = 'maintenance-test-role'
    `);

    assert.equal(maintenanceEcho.rows[0].count, 0);
  },
);
