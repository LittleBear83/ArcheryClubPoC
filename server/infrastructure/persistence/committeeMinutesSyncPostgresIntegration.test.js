import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { after, before, test } from "node:test";
import pg from "pg";

import {
  applyAuthSnapshot,
} from "../../domain/services/localDatabaseSyncService.js";
import {
  buildInitialSchemaSql,
} from "./runPostgresMigrations.js";
import {
  createSyncPublicationGateway,
} from "./syncPublicationGateway.js";
import {
  postgresMigrations,
} from "./postgresMigrations/index.js";
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

const externalDatabase =
  process.env.ARCHERY_POSTGRES_TEST_DATABASE || null;

let adminPool;
let testPool;
let databaseName;

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
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

function assertSafeEnvironment() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("NODE_ENV must be test");
  }

  if (process.env.ARCHERY_POSTGRES_INTEGRATION_TESTS !== "1") {
    throw new Error(
      "ARCHERY_POSTGRES_INTEGRATION_TESTS must be 1",
    );
  }

  if (!allowedHosts.has(process.env.PGHOST)) {
    throw new Error(
      "PostgreSQL integration tests require a local PostgreSQL host",
    );
  }

  if (!process.env.PGUSER) {
    throw new Error("PGUSER must be set");
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
      "PostgreSQL integration tests require postgres maintenance database",
    );
  }
}

async function withApplyMode(mode, callback) {
  const client = await testPool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('archery.sync.apply_mode', $1, true)`,
      [mode],
    );

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

before(async () => {
  assertSafeEnvironment();

  if (externalDatabase) {
    databaseName = externalDatabase;
  } else {
    databaseName =
      `${TEST_DATABASE_PREFIX}cm011_` +
      randomUUID().replaceAll("-", "");

    assertSafeTemporaryDatabaseName(databaseName);

    adminPool = createPool("postgres");

    await adminPool.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
    );
  }

  testPool = createPool(databaseName);

  await testPool.query(buildInitialSchemaSql());

  for (const migration of postgresMigrations) {
    if (migration.version === "011_committee_minutes_sync") {
      break;
    }

    for (const statement of migration.statements) {
      await testPool.query(statement);
    }

    await testPool.query(
      `
        INSERT INTO schema_migrations (version)
        VALUES ($1)
      `,
      [migration.version],
    );
  }
});

after(async () => {
  await testPool?.end();

  if (!externalDatabase && databaseName) {
    assertSafeTemporaryDatabaseName(databaseName);

    await adminPool?.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}
       WITH (FORCE)`,
    );
  }

  await adminPool?.end();
});

test(
  "migration 011 publishes and applies committee minutes by opaque identity",
  async () => {
    await testPool.query(`
      INSERT INTO users (
        username,
        first_name,
        surname,
        active_member
      )
      VALUES (
        'Cfleetham',
        'Craig',
        'Fleetham',
        1
      )
    `);

    const cloudUser = await testPool.query(`
      SELECT id
      FROM users
      WHERE username = 'Cfleetham'
    `);

    const cloudUserId = Number(cloudUser.rows[0].id);

    await testPool.query(`DELETE FROM sync_change_log`);

    const historical = await testPool.query(`
      INSERT INTO committee_meeting_minutes (
        meeting_date,
        title,
        sections_json,
        actions_json,
        created_at_date,
        created_at_time,
        updated_at_date,
        updated_at_time,
        updated_by_username,
        updated_by_user_id
      )
      VALUES (
        '2026-07-10',
        'Historical Committee Minute',
        '[{"id":"section-1","title":"Opening","body":"Initial"}]'::jsonb,
        '[{"id":"action-1","text":"Initial action","owner":"Craig"}]'::jsonb,
        '2026-07-10',
        '18:00:00',
        '2026-07-10',
        '18:00:00',
        'Cfleetham',
        (
          SELECT id
          FROM users
          WHERE username = 'Cfleetham'
        )
      )
      RETURNING id
    `);

    const cloudMinuteId = Number(historical.rows[0].id);

    const before011Column = await testPool.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'committee_meeting_minutes'
        AND column_name = 'sync_id'
    `);

    assert.equal(before011Column.rowCount, 0);

    const migration011 = postgresMigrations.find(
      (entry) =>
        entry.version === "011_committee_minutes_sync",
    );

    assert.ok(migration011);

    for (const statement of migration011.statements) {
      await testPool.query(statement);
    }

    await testPool.query(
      `
        INSERT INTO schema_migrations (version)
        VALUES ($1)
      `,
      [migration011.version],
    );

    const migrated = await testPool.query(`
      SELECT
        id,
        sync_id,
        updated_by_user_id
      FROM committee_meeting_minutes
      WHERE id = $1
    `, [cloudMinuteId]);

    assert.equal(migrated.rowCount, 1);

    const syncId = migrated.rows[0].sync_id;

    assert.match(
      syncId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    assert.equal(
      Number(migrated.rows[0].updated_by_user_id),
      cloudUserId,
    );

    const backfillEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
    `);

    assert.equal(backfillEcho.rows[0].count, 0);

    const triggerEvents = await testPool.query(`
      SELECT
        trigger_name,
        string_agg(
          event_manipulation,
          ',' ORDER BY event_manipulation
        ) AS events
      FROM information_schema.triggers
      WHERE trigger_name =
        'sync_committee_meeting_minutes_change_log_trigger'
      GROUP BY trigger_name
    `);

    assert.equal(triggerEvents.rowCount, 1);
    assert.equal(
      triggerEvents.rows[0].events,
      "DELETE,INSERT,UPDATE",
    );

    await testPool.query(`
      UPDATE committee_meeting_minutes
      SET title = 'Published Committee Minute'
      WHERE sync_id = $1
    `, [syncId]);

    const secondMinute = await testPool.query(`
      INSERT INTO committee_meeting_minutes (
        meeting_date,
        title,
        sections_json,
        actions_json,
        created_at_date,
        created_at_time,
        updated_at_date,
        updated_at_time,
        updated_by_username
      )
      VALUES (
        '2026-08-01',
        'Temporary Minute',
        '[]'::jsonb,
        '[]'::jsonb,
        '2026-08-01',
        '18:00:00',
        '2026-08-01',
        '18:00:00',
        'Cfleetham'
      )
      RETURNING sync_id
    `);

    const secondSyncId = secondMinute.rows[0].sync_id;

    await testPool.query(`
      UPDATE committee_meeting_minutes
      SET title = 'Temporary Minute Updated'
      WHERE sync_id = $1
    `, [secondSyncId]);

    await testPool.query(`
      DELETE FROM committee_meeting_minutes
      WHERE sync_id = $1
    `, [secondSyncId]);

    const changes = await testPool.query(`
      SELECT
        record_key,
        operation,
        payload_json
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
      ORDER BY change_id
    `);

    assert.deepEqual(
      changes.rows.map((row) => ({
        operation: row.operation,
        recordKey: row.record_key,
      })),
      [
        { recordKey: syncId, operation: "upsert" },
        { recordKey: secondSyncId, operation: "upsert" },
        { recordKey: secondSyncId, operation: "upsert" },
        { recordKey: secondSyncId, operation: "delete" },
      ],
    );

    for (const row of changes.rows) {
      assert.equal(
        Object.hasOwn(row.payload_json, "id"),
        false,
      );

      assert.equal(
        Object.hasOwn(row.payload_json, "updated_by_user_id"),
        false,
      );

      assert.equal(
        row.payload_json.sync_id,
        row.record_key,
      );
    }

    const beforePullEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
        AND record_key = $1
    `, [syncId]);

    await withApplyMode("pull", async (client) => {
      await client.query(`
        UPDATE committee_meeting_minutes
        SET title = 'Pull Applied Title'
        WHERE sync_id = $1
      `, [syncId]);
    });

    const afterPullEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
        AND record_key = $1
    `, [syncId]);

    assert.equal(
      afterPullEcho.rows[0].count,
      beforePullEcho.rows[0].count,
    );

    await withApplyMode("maintenance", async (client) => {
      await client.query(`
        UPDATE committee_meeting_minutes
        SET updated_at_time = '18:30:00'
        WHERE sync_id = $1
      `, [syncId]);
    });

    const afterMaintenanceEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
        AND record_key = $1
    `, [syncId]);

    assert.equal(
      afterMaintenanceEcho.rows[0].count,
      beforePullEcho.rows[0].count,
    );

    const publicationGateway = createSyncPublicationGateway({
      pool: testPool,
    });

    const publication = await publicationGateway.createSnapshot();

    assert.ok(
      Array.isArray(
        publication.snapshot.committeeMeetingMinutes,
      ),
    );

    assert.equal(
      publication.snapshot.committeeMeetingMinutes.length,
      1,
    );

    const cloudMinute =
      publication.snapshot.committeeMeetingMinutes[0];

    assert.equal(cloudMinute.sync_id, syncId);
    assert.equal(
      Object.hasOwn(cloudMinute, "id"),
      false,
    );
    assert.equal(
      Object.hasOwn(cloudMinute, "updated_by_user_id"),
      false,
    );

    const beforeLocalApplyEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
    `);

    let localUserId;
    let dummySyncId;

    await withApplyMode("maintenance", async (client) => {
      await client.query(`
        DELETE FROM committee_meeting_minutes
        WHERE sync_id = $1
      `, [syncId]);

      await client.query(`
        DELETE FROM users
        WHERE username = 'Cfleetham'
      `);

      await client.query(`
        INSERT INTO users (
          username,
          first_name,
          surname,
          active_member
        )
        VALUES (
          'local-seed',
          'Local',
          'Seed',
          1
        )
      `);

      const recreated = await client.query(`
        INSERT INTO users (
          username,
          first_name,
          surname,
          active_member
        )
        VALUES (
          'Cfleetham',
          'Craig',
          'Fleetham',
          1
        )
        RETURNING id
      `);

      localUserId = Number(recreated.rows[0].id);

      const dummy = await client.query(`
        INSERT INTO committee_meeting_minutes (
          meeting_date,
          title,
          sections_json,
          actions_json,
          created_at_date,
          created_at_time,
          updated_at_date,
          updated_at_time,
          updated_by_username
        )
        VALUES (
          '2026-01-01',
          'Local stale minute',
          '[]'::jsonb,
          '[]'::jsonb,
          '2026-01-01',
          '12:00:00',
          '2026-01-01',
          '12:00:00',
          'local-seed'
        )
        RETURNING sync_id
      `);

      dummySyncId = dummy.rows[0].sync_id;
    });

    assert.notEqual(localUserId, cloudUserId);

    await withApplyMode("pull", async (client) => {
      await applyAuthSnapshot({
        client,
        deactivatedRfidSuffix: "__integration_inactive__",
        snapshot: publication.snapshot,
      });
    });

    const appliedMinute = await testPool.query(`
      SELECT
        id,
        sync_id,
        updated_by_username,
        updated_by_user_id
      FROM committee_meeting_minutes
      WHERE sync_id = $1
    `, [syncId]);

    assert.equal(appliedMinute.rowCount, 1);

    assert.notEqual(
      Number(appliedMinute.rows[0].id),
      cloudMinuteId,
    );

    assert.equal(
      appliedMinute.rows[0].updated_by_username,
      "Cfleetham",
    );

    assert.equal(
      Number(appliedMinute.rows[0].updated_by_user_id),
      localUserId,
    );

    const staleMinute = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM committee_meeting_minutes
      WHERE sync_id = $1
    `, [dummySyncId]);

    assert.equal(staleMinute.rows[0].count, 0);

    const afterLocalApplyEcho = await testPool.query(`
      SELECT COUNT(*)::int AS count
      FROM sync_change_log
      WHERE domain = 'committee_meeting_minutes'
    `);

    assert.equal(
      afterLocalApplyEcho.rows[0].count,
      beforeLocalApplyEcho.rows[0].count,
    );
  },
);
