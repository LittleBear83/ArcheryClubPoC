import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { after, before, test } from "node:test";
import pg from "pg";
import { applyAuthSnapshot, applyPulledSyncResponse } from "../../domain/services/localDatabaseSyncService.js";
import { postgresMigrations } from "./postgresMigrations/index.js";
import { buildInitialSchemaSql, runPostgresMigrations } from "./runPostgresMigrations.js";
import { createMemberAuthGateway } from "./memberAuthGateway.js";
import { createActivityReportingGateway } from "./activityReportingGateway.js";
import { createSyncGateway } from "./syncGateway.js";
import {
  assertSafeIntegrationEnvironment,
  assertSafeTemporaryDatabaseName,
  TEST_DATABASE_PREFIX,
} from "./phase2a1PostgresIntegrationGuards.js";

const { Pool } = pg;
let adminPool;
let cloudPool;
let piPool;
let pre006Pool;
let databaseNames = [];
let disposablePools = [];

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function createTemporaryPool(label) {
  const databaseName = `${TEST_DATABASE_PREFIX}${label}_${randomUUID().replaceAll("-", "")}`;
  assertSafeTemporaryDatabaseName(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseNames.push(databaseName);
  const pool = new Pool({
    database: databaseName,
    host: process.env.PGHOST,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
  });
  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Test cupboard",
    permissionDefinitions: [],
    pool,
    seedUsers: [],
    systemRoleDefinitions: [],
  });
  return pool;
}

async function createPre006Pool() {
  const databaseName = `${TEST_DATABASE_PREFIX}pre006_${randomUUID().replaceAll("-", "")}`;
  assertSafeTemporaryDatabaseName(databaseName);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseNames.push(databaseName);
  const pool = new Pool({ database: databaseName, host: process.env.PGHOST, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT ?? 5432), user: process.env.PGUSER });
  await pool.query(buildInitialSchemaSql());
  for (const migration of postgresMigrations.filter((entry) => !entry.version.startsWith("006_"))) {
    for (const statement of migration.statements) await pool.query(statement);
    await pool.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [migration.version]);
  }
  await pool.query(`INSERT INTO schema_migrations (version) VALUES ('001_initial_schema') ON CONFLICT DO NOTHING`);
  return pool;
}

async function seedUser(pool, id, username = "robin") {
  await pool.query(
    `INSERT INTO users (id, username, first_name, surname, active_member) VALUES ($1, $2, 'Robin', 'Archer', 1)`,
    [id, username],
  );
  await pool.query(`INSERT INTO roles (role_key, title) VALUES ('member', 'Member') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO user_types (username, user_type, user_id) VALUES ($1, 'member', $2)`, [username, id]);
}

async function applyPull(pool, options) {
  const client = await pool.connect();

  try {
    return await applyPulledSyncResponse({ ...options, client });
  } finally {
    client.release();
  }
}

before(async () => {
  assertSafeIntegrationEnvironment(process.env);
  adminPool = new Pool({
    database: "postgres",
    host: process.env.PGHOST,
    password: process.env.PGPASSWORD,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
  });
  cloudPool = await createTemporaryPool("cloud");
  piPool = await createTemporaryPool("pi");
  await seedUser(cloudPool, 5);
  await seedUser(piPool, 87);
});

after(async () => {
  await Promise.all([cloudPool?.end(), piPool?.end(), pre006Pool?.end(), ...disposablePools.map((pool) => pool.end())]);
  for (const databaseName of databaseNames) {
    assertSafeTemporaryDatabaseName(databaseName);
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
  }
  await adminPool?.end();
});

test("migration 006 creates stable identities and cloud logins are tracked without Pi outbox", async () => {
  const gateway = createSyncGateway({ pool: cloudPool });
  const auth = createMemberAuthGateway({
    databaseEngine: "postgres",
    pool: cloudPool,
    syncGateway: gateway,
    syncNodeMode: "cloud-server",
  });

  for (const method of ["password", "mobile-app", "rfid"]) {
    await auth.recordLoginEvent({ method, timestampParts: ["2026-09-01", `${10 + method.length}:00:00`], username: "robin" });
  }

  const events = await cloudPool.query(`SELECT sync_event_id, sync_identity_origin FROM login_events ORDER BY id`);
  assert.equal(events.rowCount, 3);
  assert.equal(new Set(events.rows.map((row) => row.sync_event_id)).size, 3);
  assert.deepEqual(new Set(events.rows.map((row) => row.sync_identity_origin)), new Set(["native"]));
  assert.equal(Number((await cloudPool.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count), 0);
  assert.equal(Number((await cloudPool.query(`SELECT COUNT(*) AS count FROM sync_change_log WHERE domain = 'login_events'`)).rows[0].count), 3);
});

test("migration runner upgrades representative pre-006 rows without history or trigger storms", async () => {
  pre006Pool = await createPre006Pool();
  await seedUser(pre006Pool, 301);
  await seedUser(pre006Pool, 302, "coach");
  await pre006Pool.query(`INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id) VALUES ('robin', 'rfid', '2026-07-01', '10:00:00', 301), ('robin', 'rfid', '2026-07-01', '10:00:00', 301), ('robin', 'mobile-app', '2026-07-02', '11:00:00', 301)`);
  await pre006Pool.query(`UPDATE login_events SET sync_event_id = 'phase1-native-id' WHERE login_method = 'mobile-app'`);
  await pre006Pool.query(`INSERT INTO guest_login_events (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time) VALUES ('Guest', 'Archer', 'AGB-77', 'cash', '2026-07-01', '10:00:00'), ('Guest', 'Archer', 'AGB-77', 'cash', '2026-07-01', '10:00:00')`);
  await pre006Pool.query(`INSERT INTO range_presence_extensions VALUES ('robin', '2026-07-01', '20:00:00', 'robin', '2026-07-01', '10:00:00')`);
  await pre006Pool.query(`INSERT INTO beginners_courses (id, course_type, coordinator_username, submitted_by_username, first_lesson_date, start_time, end_time, lesson_count, beginner_capacity, created_at_date, created_at_time) VALUES (410, 'beginners', 'coach', 'coach', '2026-08-01', '18:00:00', '20:00:00', 4, 12, '2026-07-01', '10:00:00')`);
  await pre006Pool.query(`INSERT INTO beginners_course_lessons (id, course_id, lesson_number, lesson_date, start_time, end_time) VALUES (420, 410, 1, '2026-08-01', '18:00:00', '20:00:00')`);
  await pre006Pool.query(`INSERT INTO beginners_course_lesson_coaches (lesson_id, coach_username, assigned_by_username, assigned_at_date, assigned_at_time) VALUES (420, 'coach', 'coach', '2026-07-01', '10:00:00')`);
  await pre006Pool.query(`INSERT INTO beginners_course_participants (id, course_id, username, first_name, surname, beginner_size_category, created_by_username, created_at_date, created_at_time) VALUES (430, 410, 'robin', 'Robin', 'Archer', 'adult', 'coach', '2026-07-01', '10:00:00')`);
  await runPostgresMigrations({ committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test cupboard", permissionDefinitions: [], pool: pre006Pool, seedUsers: [], systemRoleDefinitions: [] });
  await runPostgresMigrations({ committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test cupboard", permissionDefinitions: [], pool: pre006Pool, seedUsers: [], systemRoleDefinitions: [] });
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM schema_migrations WHERE version = '006_phase_2a1_reporting_sync'`)).rows[0].count), 1);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM login_events`)).rows[0].count), 3);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_identity_origin = 'legacy'`)).rows[0].count), 2);
  assert.equal((await pre006Pool.query(`SELECT sync_event_id, sync_identity_origin FROM login_events WHERE login_method = 'mobile-app'`)).rows[0].sync_event_id, 'phase1-native-id');
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM guest_login_events WHERE sync_event_id IS NOT NULL`)).rows[0].count), 2);
  const loginIndex = (await pre006Pool.query(`
    SELECT indexes.indisunique, pg_get_expr(indexes.indpred, indexes.indrelid) AS predicate
    FROM pg_index AS indexes
    INNER JOIN pg_class AS index_class ON index_class.oid = indexes.indexrelid
    WHERE index_class.relname = 'login_events_sync_event_id_uidx'
  `)).rows[0];
  assert.equal(loginIndex.indisunique, true);
  assert.equal(loginIndex.predicate, null);
  const upgradedGateway = createSyncGateway({ pool: pre006Pool });
  await upgradedGateway.enqueueLoginEvent({ client: pre006Pool, eventId: "upgraded-enqueue", loggedInDate: "2026-07-03", loggedInTime: "10:00:00", loginMethod: "rfid", machineId: "pi-test", sourceNodeMode: "local-pi", username: "robin" });
  await upgradedGateway.upsertLoginEventFromSync({ client: pre006Pool, eventId: "upgraded-sync", loggedInDate: "2026-07-03", loggedInTime: "11:00:00", loginMethod: "rfid", machineId: "pi-test", username: "robin" });
  await upgradedGateway.upsertLoginEventFromSync({ client: pre006Pool, eventId: "upgraded-sync", loggedInDate: "2026-07-03", loggedInTime: "11:00:00", loginMethod: "rfid", machineId: "pi-test", username: "robin" });
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_event_id = 'upgraded-sync'`)).rows[0].count), 1);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id IS NOT NULL AND id = 410`)).rows[0].count), 1);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM beginners_course_lessons WHERE sync_id IS NOT NULL AND course_id = 410`)).rows[0].count), 1);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM beginners_course_participants WHERE sync_id IS NOT NULL AND course_id = 410 AND user_id = 301`)).rows[0].count), 1);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count), 0);
  assert.equal(Number((await pre006Pool.query(`SELECT COUNT(*) AS count FROM sync_change_log WHERE domain IN ('login_events', 'guest_login_events', 'beginners_courses', 'beginners_course_participants')`)).rows[0].count), 0);
});

test("Pi login push, retry, acknowledgement, and echoed Cloud pull remain one event", async () => {
  const piGateway = createSyncGateway({ pool: piPool });
  const cloudGateway = createSyncGateway({ pool: cloudPool });
  const eventId = randomUUID();
  await piGateway.enqueueLoginEvent({ client: piPool, eventId, loggedInDate: "2026-09-02", loggedInTime: "10:00:00", loginMethod: "rfid", machineId: "pi-test", sourceNodeMode: "local-pi", username: "robin" });
  const event = (await piGateway.listPendingOutboxEvents({ limit: 10 }))[0];
  await cloudGateway.upsertLoginEventFromSync({ client: cloudPool, eventId, loggedInDate: event.payload.loggedInDate, loggedInTime: event.payload.loggedInTime, loginMethod: event.payload.loginMethod, machineId: "pi-test", username: "robin" });
  await cloudGateway.upsertLoginEventFromSync({ client: cloudPool, eventId, loggedInDate: event.payload.loggedInDate, loggedInTime: event.payload.loggedInTime, loginMethod: event.payload.loginMethod, machineId: "pi-test", username: "robin" });
  await piGateway.acknowledgeOutboxEvents({ eventIds: [eventId] });
  const row = (await cloudPool.query(`SELECT * FROM login_events WHERE sync_event_id = $1`, [eventId])).rows[0];
  await applyPulledSyncResponse({ client: piPool, currentCheckpoint: 0, deactivatedRfidSuffix: "-deactivated", pullResponse: { changes: [{ domain: "login_events", operation: "upsert", payload: row, recordKey: eventId }], checkpoint: 1, mode: "incremental" }, syncGateway: piGateway });
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_event_id = $1`, [eventId])).rows[0].count), 1);
  assert.equal(Number((await cloudPool.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_event_id = $1`, [eventId])).rows[0].count), 1);
});

test("legacy multiset reconciliation keeps maximum multiplicity without numeric-ID matching", async () => {
  await cloudPool.query(`INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id, sync_event_id, sync_identity_origin) VALUES ('robin', 'rfid', '2026-08-01', '10:00:00', 5, 'cloud-legacy-a', 'legacy')`);
  await piPool.query(`INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id, sync_event_id, sync_identity_origin) VALUES ('robin', 'rfid', '2026-08-01', '10:00:00', 87, 'cloud-legacy-a', 'legacy'), ('robin', 'rfid', '2026-08-01', '10:00:00', 87, 'pi-legacy-b', 'legacy')`);
  const cloudRows = (await cloudPool.query(`SELECT * FROM login_events WHERE logged_in_date = '2026-08-01'`)).rows;
  await applyAuthSnapshot({ client: piPool, deactivatedRfidSuffix: "-deactivated", snapshot: { loginEvents: cloudRows, users: [] }, syncGateway: createSyncGateway({ pool: piPool }) });
  const pending = await piPool.query(`SELECT * FROM sync_local_outbox WHERE event_id = 'pi-legacy-b'`);
  assert.equal(pending.rowCount, 1);
  await createSyncGateway({ pool: cloudPool }).upsertLoginEventFromSync({ client: cloudPool, eventId: "pi-legacy-b", loggedInDate: "2026-08-01", loggedInTime: "10:00:00", loginMethod: "rfid", machineId: "pi-test", username: "robin" });
  assert.equal(Number((await cloudPool.query(`SELECT COUNT(*) AS count FROM login_events WHERE logged_in_date = '2026-08-01'`)).rows[0].count), 2);
});

test("member and guest legacy multiset matrix converges without count inflation", async () => {
  const cloudGateway = createSyncGateway({ pool: cloudPool });
  const piGateway = createSyncGateway({ pool: piPool });
  const cases = [[1, 1], [2, 2], [2, 1], [1, 2]];

  for (const [caseIndex, [cloudCount, piCount]] of cases.entries()) {
    const date = `2026-08-${String(20 + caseIndex).padStart(2, "0")}`;
    for (const [kind, table] of [["login", "login_events"], ["guest", "guest_login_events"]]) {
      for (let index = 0; index < cloudCount; index += 1) {
        const id = `cloud-${kind}-${date}-${index}`;
        const sql = kind === "login"
          ? `INSERT INTO ${table} (username, login_method, logged_in_date, logged_in_time, user_id, sync_event_id, sync_identity_origin) VALUES ('robin', 'rfid', $1, '12:00:00', 5, $2, 'legacy')`
          : `INSERT INTO ${table} (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time, sync_event_id, sync_identity_origin) VALUES ('Guest', 'Archer', 'AGB-1', 'cash', $1, '12:00:00', $2, 'legacy')`;
        await cloudPool.query(sql, [date, id]);
      }
      for (let index = 0; index < piCount; index += 1) {
        const shared = index < cloudCount ? `cloud-${kind}-${date}-${index}` : `pi-${kind}-${date}-${index}`;
        const sql = kind === "login"
          ? `INSERT INTO ${table} (username, login_method, logged_in_date, logged_in_time, user_id, sync_event_id, sync_identity_origin) VALUES ('robin', 'rfid', $1, '12:00:00', 87, $2, 'legacy')`
          : `INSERT INTO ${table} (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time, sync_event_id, sync_identity_origin) VALUES ('Guest', 'Archer', 'AGB-1', 'cash', $1, '12:00:00', $2, 'legacy')`;
        await piPool.query(sql, [date, shared]);
      }
      const cloudRows = (await cloudPool.query(`SELECT * FROM ${table} WHERE logged_in_date = $1 ORDER BY id`, [date])).rows;
      await applyAuthSnapshot({ client: piPool, deactivatedRfidSuffix: "-deactivated", snapshot: kind === "login" ? { loginEvents: cloudRows, users: [] } : { guestLoginEvents: cloudRows, users: [] }, syncGateway: piGateway });
      await applyAuthSnapshot({ client: piPool, deactivatedRfidSuffix: "-deactivated", snapshot: kind === "login" ? { loginEvents: cloudRows, users: [] } : { guestLoginEvents: cloudRows, users: [] }, syncGateway: piGateway });
      const piRows = (await piPool.query(`SELECT * FROM ${table} WHERE logged_in_date = $1 ORDER BY id`, [date])).rows;
      for (const row of piRows) {
        if (cloudRows.some((cloudRow) => cloudRow.sync_event_id === row.sync_event_id)) continue;
        if (kind === "login") {
          await cloudGateway.upsertLoginEventFromSync({ client: cloudPool, eventId: row.sync_event_id, loggedInDate: row.logged_in_date, loggedInTime: row.logged_in_time, loginMethod: row.login_method, machineId: "pi-test", username: row.username });
        } else {
          await cloudGateway.upsertGuestLoginEventFromSync({ client: cloudPool, eventId: row.sync_event_id, firstName: row.first_name, surname: row.surname, archeryGbMembershipNumber: row.archery_gb_membership_number, paymentMethod: row.payment_method, loggedInDate: row.logged_in_date, loggedInTime: row.logged_in_time, machineId: "pi-test" });
        }
      }
      const expected = Math.max(cloudCount, piCount);
      assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE logged_in_date = $1`, [date])).rows[0].count), expected, `${kind} Pi ${cloudCount}/${piCount}`);
      assert.equal(Number((await cloudPool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE logged_in_date = $1`, [date])).rows[0].count), expected, `${kind} Cloud ${cloudCount}/${piCount}`);
    }
  }
});

test("presence commands increment once, reject stale versions, and remain idempotent", async () => {
  const gateway = createSyncGateway({ pool: cloudPool });
  await cloudPool.query(`INSERT INTO range_presence_extensions (username, active_until_date, active_until_time, updated_by_username, updated_at_date, updated_at_time, sync_version) VALUES ('robin', '2026-09-01', '18:00:00', 'robin', '2026-09-01', '10:00:00', 4) ON CONFLICT (username) DO UPDATE SET sync_version = 4`);
  const accepted = { eventId: "presence-accepted", eventType: "range_presence_extension_upsert", payload: { username: "robin", updatedByUsername: "robin", activeUntilDate: "2026-09-01", activeUntilTime: "20:00:00", updatedAtDate: "2026-09-01", updatedAtTime: "12:00:00", expectedVersion: 4 } };
  assert.equal((await gateway.processRangePresenceCommand({ client: cloudPool, event: accepted, machineId: "pi-test" })).accepted, true);
  assert.equal((await gateway.processRangePresenceCommand({ client: cloudPool, event: accepted, machineId: "pi-test" })).accepted, true);
  assert.equal(Number((await cloudPool.query(`SELECT sync_version FROM range_presence_extensions WHERE username = 'robin'`)).rows[0].sync_version), 5);
  const stale = { ...accepted, eventId: "presence-stale", payload: { ...accepted.payload, expectedVersion: 4 } };
  assert.equal((await gateway.processRangePresenceCommand({ client: cloudPool, event: stale, machineId: "pi-test" })).code, "range_presence_conflict");
  assert.equal(Number((await cloudPool.query(`SELECT sync_version FROM range_presence_extensions WHERE username = 'robin'`)).rows[0].sync_version), 5);
});

test("course graph snapshot remaps every Cloud relationship to Pi-local foreign keys and rolls back invalid children", async () => {
  await seedUser(cloudPool, 6, "coach");
  await seedUser(piPool, 91, "coach");
  const snapshot = {
    beginnersCourses: [{ sync_id: "course-cloud-opaque", course_type: "beginners", coordinator_username: "coach", submitted_by_username: "coach", first_lesson_date: "2026-10-01", start_time: "18:00:00", end_time: "20:00:00", lesson_count: 2, beginner_capacity: 12, approval_status: "approved", is_cancelled: 0, cancellation_reason: null, cancelled_by_username: null, cancelled_at_date: null, cancelled_at_time: null, rejection_reason: null, approved_by_username: "coach", approved_at_date: "2026-09-01", approved_at_time: "09:00:00", created_at_date: "2026-09-01", created_at_time: "09:00:00" }],
    beginnersCourseLessons: [{ sync_id: "lesson-cloud-opaque", course_sync_id: "course-cloud-opaque", lesson_number: 1, lesson_date: "2026-10-01", start_time: "18:00:00", end_time: "20:00:00" }],
    beginnersCourseLessonCoaches: [{ lesson_sync_id: "lesson-cloud-opaque", coach_username: "coach", assigned_by_username: "coach", assigned_at_date: "2026-09-01", assigned_at_time: "09:00:00" }],
    beginnersCourseParticipants: [{ sync_id: "participant-cloud-opaque", course_sync_id: "course-cloud-opaque", username: "robin", first_name: "Robin", surname: "Archer", beginner_size_category: "adult", height_text: "", draw_length: "", handedness: "right", eye_dominance: "right", initial_email_sent: 0, thirty_day_reminder_sent: 0, course_fee_paid: 0, origin_course_type: "beginners", converted_to_member: 1, converted_at_date: "2026-11-01", converted_at_time: "10:00:00", converted_by_username: "coach", assigned_case_by_username: null, assigned_case_at_date: null, assigned_case_at_time: null, created_at_date: "2026-09-01", created_at_time: "09:00:00", created_by_username: "coach" }],
    users: [],
  };
  const piGateway = createSyncGateway({ pool: piPool });
  await applyPull(piPool, { currentCheckpoint: 10, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 11, mode: "snapshot", snapshot }, syncGateway: piGateway });
  const graph = (await piPool.query(`SELECT courses.id AS course_id, lessons.course_id AS lesson_course_id, coaches.lesson_id, coaches.coach_user_id, participants.course_id AS participant_course_id, participants.user_id FROM beginners_courses courses JOIN beginners_course_lessons lessons ON lessons.sync_id = 'lesson-cloud-opaque' JOIN beginners_course_lesson_coaches coaches ON coaches.lesson_id = lessons.id JOIN beginners_course_participants participants ON participants.sync_id = 'participant-cloud-opaque' WHERE courses.sync_id = 'course-cloud-opaque'`)).rows[0];
  assert.notEqual(Number(graph.course_id), 10);
  assert.equal(Number(graph.lesson_course_id), Number(graph.course_id));
  assert.equal(Number(graph.participant_course_id), Number(graph.course_id));
  assert.equal(Number(graph.coach_user_id), 91);
  assert.equal(Number(graph.user_id), 87);
  await applyPull(piPool, { currentCheckpoint: 11, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 12, mode: "snapshot", snapshot }, syncGateway: piGateway });
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'course-cloud-opaque'`)).rows[0].count), 1);
  const invalidSnapshot = { ...snapshot, beginnersCourseLessons: [{ ...snapshot.beginnersCourseLessons[0], course_sync_id: "missing-parent" }] };
  await assert.rejects(() => applyPull(piPool, { currentCheckpoint: 12, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 13, mode: "snapshot", snapshot: invalidSnapshot }, syncGateway: piGateway }));
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'course-cloud-opaque'`)).rows[0].count), 1);
});

test("course graph snapshots update, transfer, delete, distinguish empty from omitted, and roll back corrected retries", async () => {
  const piGateway = createSyncGateway({ pool: piPool });
  let checkpoint = 20;
  const applySnapshot = async (snapshot) => {
    checkpoint += 1;
    await applyPulledSyncResponse({
      client: piPool,
      currentCheckpoint: checkpoint - 1,
      deactivatedRfidSuffix: "-deactivated",
      pullResponse: { checkpoint, mode: "snapshot", snapshot },
      syncGateway: piGateway,
    });
  };
  const course = (syncId, values = {}) => ({
    approval_status: "approved",
    approved_at_date: "2026-09-10",
    approved_at_time: "09:00:00",
    approved_by_username: "coach",
    beginner_capacity: 12,
    cancellation_reason: null,
    cancelled_at_date: null,
    cancelled_at_time: null,
    cancelled_by_username: null,
    coordinator_username: "coach",
    course_type: "beginners",
    created_at_date: "2026-09-10",
    created_at_time: "09:00:00",
    end_time: "20:00:00",
    first_lesson_date: "2026-10-10",
    is_cancelled: 0,
    lesson_count: 2,
    rejection_reason: null,
    start_time: "18:00:00",
    submitted_by_username: "coach",
    sync_id: syncId,
    ...values,
  });
  const lesson = (syncId, courseSyncId, values = {}) => ({
    course_sync_id: courseSyncId,
    end_time: "20:00:00",
    lesson_date: "2026-10-10",
    lesson_number: 1,
    start_time: "18:00:00",
    sync_id: syncId,
    ...values,
  });
  const participant = (syncId, courseSyncId, username, values = {}) => ({
    assigned_case_at_date: null,
    assigned_case_at_time: null,
    assigned_case_by_username: null,
    beginner_size_category: "adult",
    converted_at_date: null,
    converted_at_time: null,
    converted_by_username: null,
    converted_to_member: 0,
    course_fee_paid: 0,
    course_sync_id: courseSyncId,
    created_at_date: "2026-09-10",
    created_at_time: "09:00:00",
    created_by_username: "coach",
    draw_length: "28in",
    eye_dominance: "right",
    first_name: username === "robin" ? "Robin" : "Coach",
    handedness: "right",
    height_text: "170cm",
    initial_email_sent: 0,
    origin_course_type: "beginners",
    surname: "Archer",
    sync_id: syncId,
    thirty_day_reminder_sent: 0,
    username,
    ...values,
  });
  const coach = (lessonSyncId) => ({
    assigned_at_date: "2026-09-10",
    assigned_at_time: "09:00:00",
    assigned_by_username: "coach",
    coach_username: "coach",
    lesson_sync_id: lessonSyncId,
  });
  const graphSnapshot = (values) => ({ ...values, users: [] });
  const graphCounts = async () => {
    const result = await piPool.query(`
      SELECT
        (SELECT COUNT(*) FROM beginners_courses) AS courses,
        (SELECT COUNT(*) FROM beginners_course_lessons) AS lessons,
        (SELECT COUNT(*) FROM beginners_course_lesson_coaches) AS coaches,
        (SELECT COUNT(*) FROM beginners_course_participants) AS participants
    `);
    return result.rows[0];
  };

  await applySnapshot(graphSnapshot({
    beginnersCourses: [],
    beginnersCourseLessonCoaches: [],
    beginnersCourseLessons: [],
    beginnersCourseParticipants: [],
  }));
  await piPool.query(`INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id) VALUES ('robin', 'rfid', '2026-09-11', '10:00:00', 87)`);
  await piPool.query(`INSERT INTO guest_login_events (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time) VALUES ('Guest', 'History', 'AGB-HISTORY', 'cash', '2026-09-11', '10:00:00')`);
  await piPool.query(`INSERT INTO range_presence_extensions (username, active_until_date, active_until_time, updated_by_username, updated_at_date, updated_at_time) VALUES ('robin', '2026-09-11', '20:00:00', 'robin', '2026-09-11', '10:00:00') ON CONFLICT (username) DO UPDATE SET active_until_date = EXCLUDED.active_until_date`);
  const outboxCount = Number((await piPool.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count);

  const initial = graphSnapshot({
    beginnersCourses: [course("course-c1"), course("course-c2", { first_lesson_date: "2026-11-10" })],
    beginnersCourseLessons: [lesson("lesson-l1", "course-c1")],
    beginnersCourseLessonCoaches: [coach("lesson-l1")],
    beginnersCourseParticipants: [participant("participant-p1", "course-c1", "robin")],
  });
  await applySnapshot(initial);
  const initialIds = (await piPool.query(`SELECT c.id AS course_id, l.id AS lesson_id FROM beginners_courses c JOIN beginners_course_lessons l ON l.course_id = c.id WHERE c.sync_id = 'course-c1'`)).rows[0];

  const updated = graphSnapshot({
    beginnersCourses: [course("course-c1", { beginner_capacity: 18, lesson_count: 3 }), course("course-c2", { first_lesson_date: "2026-11-10" })],
    beginnersCourseLessons: [lesson("lesson-l1", "course-c1", { lesson_date: "2026-10-17", lesson_number: 2 })],
    beginnersCourseLessonCoaches: [coach("lesson-l1")],
    beginnersCourseParticipants: [participant("participant-p1", "course-c2", "robin", { first_name: "Robyn", height_text: "172cm" })],
  });
  await applySnapshot(updated);
  const updatedGraph = (await piPool.query(`
    SELECT c.id AS course_id, c.beginner_capacity, l.course_id AS lesson_course_id,
      l.lesson_date, l.lesson_number, lc.coach_user_id, p.course_id AS participant_course_id,
      p.first_name, p.height_text, p.user_id
    FROM beginners_courses c
    JOIN beginners_course_lessons l ON l.sync_id = 'lesson-l1'
    JOIN beginners_course_lesson_coaches lc ON lc.lesson_id = l.id
    JOIN beginners_course_participants p ON p.sync_id = 'participant-p1'
    WHERE c.sync_id = 'course-c1'
  `)).rows[0];
  const c2Id = Number((await piPool.query(`SELECT id FROM beginners_courses WHERE sync_id = 'course-c2'`)).rows[0].id);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'course-c1'`)).rows[0].count), 1);
  assert.ok(Number(updatedGraph.course_id) > 0);
  assert.equal(Number(updatedGraph.beginner_capacity), 18);
  assert.equal(Number(updatedGraph.lesson_course_id), Number(updatedGraph.course_id));
  assert.equal(updatedGraph.lesson_date, "2026-10-17");
  assert.equal(Number(updatedGraph.lesson_number), 2);
  assert.equal(Number(updatedGraph.coach_user_id), 91);
  assert.equal(Number(updatedGraph.participant_course_id), c2Id);
  assert.equal(Number(updatedGraph.user_id), 87);
  assert.equal(updatedGraph.first_name, "Robyn");
  assert.equal(updatedGraph.height_text, "172cm");
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_course_participants WHERE sync_id = 'participant-p1'`)).rows[0].count), 1);
  assert.notEqual(Number(initialIds.course_id), Number(updatedGraph.course_id));

  const previousGraph = await piPool.query(`
    SELECT 'course' AS kind, sync_id, course_type AS value FROM beginners_courses
    UNION ALL SELECT 'lesson', sync_id, lesson_date FROM beginners_course_lessons
    UNION ALL SELECT 'participant', sync_id, first_name FROM beginners_course_participants
    ORDER BY kind, sync_id
  `);
  const invalidLaterChild = graphSnapshot({
    beginnersCourses: [course("course-c1", { beginner_capacity: 20 }), course("course-c2")],
    beginnersCourseLessons: [lesson("lesson-l1", "course-c2"), lesson("lesson-l2", "course-c1", { lesson_number: 2 })],
    beginnersCourseLessonCoaches: [coach("lesson-l1"), coach("lesson-l2")],
    beginnersCourseParticipants: [
      participant("participant-p1", "course-c2", "robin"),
      participant("participant-p2", "missing-course", "coach"),
    ],
  });
  await assert.rejects(() => applySnapshot(invalidLaterChild));
  assert.deepEqual((await piPool.query(`
    SELECT 'course' AS kind, sync_id, course_type AS value FROM beginners_courses
    UNION ALL SELECT 'lesson', sync_id, lesson_date FROM beginners_course_lessons
    UNION ALL SELECT 'participant', sync_id, first_name FROM beginners_course_participants
    ORDER BY kind, sync_id
  `)).rows, previousGraph.rows);

  const correctedRetry = {
    ...invalidLaterChild,
    beginnersCourseParticipants: [
      participant("participant-p1", "course-c2", "robin"),
      participant("participant-p2", "course-c1", "coach"),
    ],
  };
  await applySnapshot(correctedRetry);
  assert.deepEqual(await graphCounts(), { courses: "2", lessons: "2", coaches: "2", participants: "2" });
  assert.equal(Number((await piPool.query(`SELECT course_id FROM beginners_course_participants WHERE sync_id = 'participant-p1'`)).rows[0].course_id), Number((await piPool.query(`SELECT id FROM beginners_courses WHERE sync_id = 'course-c2'`)).rows[0].id));

  const c1Only = graphSnapshot({
    beginnersCourses: [course("course-c1")],
    beginnersCourseLessons: [lesson("lesson-l2", "course-c1", { lesson_number: 2 })],
    beginnersCourseLessonCoaches: [coach("lesson-l2")],
    beginnersCourseParticipants: [participant("participant-p2", "course-c1", "coach")],
  });
  await applySnapshot(c1Only);
  assert.deepEqual(await graphCounts(), { courses: "1", lessons: "1", coaches: "1", participants: "1" });
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'course-c2'`)).rows[0].count), 0);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM beginners_course_participants WHERE sync_id = 'participant-p1'`)).rows[0].count), 0);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count), outboxCount);

  await applySnapshot(graphSnapshot({
    beginnersCourses: [],
    beginnersCourseLessonCoaches: [],
    beginnersCourseLessons: [],
    beginnersCourseParticipants: [],
  }));
  assert.deepEqual(await graphCounts(), { courses: "0", lessons: "0", coaches: "0", participants: "0" });
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM users WHERE username = 'robin'`)).rows[0].count), 1);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM range_presence_extensions WHERE username = 'robin'`)).rows[0].count), 1);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM login_events WHERE logged_in_date = '2026-09-11'`)).rows[0].count), 1);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM guest_login_events WHERE logged_in_date = '2026-09-11'`)).rows[0].count), 1);
  assert.equal(Number((await piPool.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count), outboxCount);

  await applySnapshot(c1Only);
  const beforeOmitted = await graphCounts();
  await applySnapshot({ users: [] });
  assert.deepEqual(await graphCounts(), beforeOmitted);
});

function normalizeReportingOutput(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeReportingOutput).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id").map(([key, entry]) => [key, normalizeReportingOutput(entry)]));
  }
  return value;
}

test("PostgreSQL Cloud and Pi reporting gateways return equivalent reconciled Phase 2A1 outputs", async () => {
  const cloud = await createTemporaryPool("reportcloud");
  const pi = await createTemporaryPool("reportpi");
  disposablePools.push(cloud, pi);
  await seedUser(cloud, 10, "report-robin");
  await seedUser(cloud, 11, "report-coach");
  await cloud.query(`INSERT INTO user_disciplines (username, discipline, user_id) VALUES ('report-robin', 'target', 10), ('report-robin', 'field', 10)`);
  await cloud.query(`
    INSERT INTO login_events (username, user_id, login_method, logged_in_date, logged_in_time, sync_event_id, sync_identity_origin) VALUES
      ('report-robin', 10, 'rfid', '2026-06-01', '10:00:00', 'report-rfid-1', 'native'),
      ('report-robin', 10, 'rfid', '2026-06-01', '11:00:00', 'report-rfid-2', 'native'),
      ('report-robin', 10, 'rfid', '2026-06-01', '12:01:00', 'report-rfid-3', 'native'),
      ('report-robin', 10, 'mobile-app', '2026-06-01', '14:00:00', 'report-mobile', 'native'),
      ('report-robin', 10, 'rfid', '2026-06-02', '09:00:00', 'report-next-day', 'native'),
      ('report-robin', 10, 'rfid', '2026-06-03', '10:00:00', 'report-legacy-1', 'legacy'),
      ('report-robin', 10, 'rfid', '2026-06-03', '10:00:00', 'report-legacy-2', 'legacy')
  `);
  await cloud.query(`
    INSERT INTO guest_login_events (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time, sync_event_id, sync_identity_origin) VALUES
      ('Guest', 'One', 'AGB-REPORT-1', 'cash', '2026-06-01', '10:00:00', 'report-guest-1', 'native'),
      ('Guest', 'Two', 'AGB-REPORT-2', 'cash', '2026-06-02', '11:00:00', 'report-guest-2', 'native'),
      ('Guest', 'Three', 'AGB-REPORT-3', 'cash', '2026-06-03', '12:00:00', 'report-guest-legacy-1', 'legacy'),
      ('Guest', 'Three', 'AGB-REPORT-3', 'cash', '2026-06-03', '12:00:00', 'report-guest-legacy-2', 'legacy')
  `);
  await cloud.query(`INSERT INTO club_events (sync_id, event_date, start_time, end_time, title, type, submitted_by_username, approval_status, created_at_date, created_at_time, submitted_by_user_id) VALUES ('report-event', '2026-06-10', '18:00:00', '20:00:00', 'Reporting event', 'social', 'report-coach', 'approved', '2026-06-01', '09:00:00', 11)`);
  await cloud.query(`INSERT INTO event_bookings (club_event_id, member_username, member_user_id, booked_at_date, booked_at_time) VALUES ((SELECT id FROM club_events WHERE sync_id = 'report-event'), 'report-robin', 10, '2026-06-01', '09:00:00')`);
  await cloud.query(`INSERT INTO coaching_sessions (sync_id, coach_username, coach_user_id, session_date, start_time, end_time, available_slots, topic, summary, venue, approval_status, created_at_date, created_at_time) VALUES ('report-coaching', 'report-coach', 11, '2026-06-11', '18:00:00', '19:00:00', 2, 'Form', 'Form review', 'range', 'approved', '2026-06-01', '09:00:00')`);
  await cloud.query(`INSERT INTO coaching_session_bookings (coaching_session_id, member_username, member_user_id, booked_at_date, booked_at_time) VALUES ((SELECT id FROM coaching_sessions WHERE sync_id = 'report-coaching'), 'report-robin', 10, '2026-06-01', '09:00:00')`);
  await cloud.query(`INSERT INTO beginners_courses (sync_id, coordinator_username, submitted_by_username, first_lesson_date, start_time, end_time, lesson_count, beginner_capacity, created_at_date, created_at_time) VALUES ('report-course', 'report-coach', 'report-coach', '2026-06-15', '18:00:00', '20:00:00', 2, 12, '2026-06-01', '09:00:00')`);
  await cloud.query(`INSERT INTO beginners_course_participants (sync_id, course_id, username, user_id, first_name, surname, beginner_size_category, converted_to_member, converted_at_date, converted_at_time, converted_by_username, created_by_username, created_at_date, created_at_time) VALUES ('report-participant', (SELECT id FROM beginners_courses WHERE sync_id = 'report-course'), 'report-robin', 10, 'Robin', 'Archer', 'adult', 1, '2026-07-01', '10:00:00', 'report-coach', 'report-coach', '2026-06-01', '09:00:00')`);
  const snapshot = await createSyncGateway({ pool: cloud }).getAuthSnapshot();
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 0, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: snapshot.checkpoint, mode: "snapshot", snapshot: snapshot.snapshot }, syncGateway: createSyncGateway({ pool: pi }) });
  const cloudReporting = createActivityReportingGateway({ databaseEngine: "postgres", pool: cloud });
  const piReporting = createActivityReportingGateway({ databaseEngine: "postgres", pool: pi });
  const range = ["2026-06-01T00:00:00", "2026-06-04T00:00:00"];
  const calls = [
    ["countMemberLoginsInRange", range], ["countMemberLoginsForUserInRange", ["report-robin", ...range]],
    ["memberLoginsByDateInRange", range], ["memberLoginsByHourInRange", range], ["memberLoginsByWeekdayInRange", range],
    ["memberLoginsByDateForUserInRange", ["report-robin", ...range]], ["memberLoginsByHourForUserInRange", ["report-robin", ...range]], ["memberLoginsByWeekdayForUserInRange", ["report-robin", ...range]],
    ["listReportingMemberLogins", range], ["findRecentRangeMembers", ["2026-06-01T00:00:00"]], ["findLatestRangeMembers", []],
    ["countGuestLoginsInRange", range], ["listReportingGuestLogins", range], ["guestLoginsByDateInRange", range], ["guestLoginsByHourInRange", range], ["guestLoginsByWeekdayInRange", range],
    ["listMemberJourneyParticipants", ["2026-06-01", "2026-06-30"]], ["listAllUserDisciplines", []],
  ];
  for (const [method, args] of calls) {
    assert.deepEqual(normalizeReportingOutput(await piReporting[method](...args)), normalizeReportingOutput(await cloudReporting[method](...args)), method);
  }
  const piRobinId = Number((await pi.query(`SELECT id FROM users WHERE username = 'report-robin'`)).rows[0].id);
  assert.deepEqual(normalizeReportingOutput(await piReporting.findMemberEventBookingsByUserId(piRobinId)), normalizeReportingOutput(await cloudReporting.findMemberEventBookingsByUserId(10)));
  assert.deepEqual(normalizeReportingOutput(await piReporting.findMemberCoachingBookingsByUserId(piRobinId)), normalizeReportingOutput(await cloudReporting.findMemberCoachingBookingsByUserId(10)));
  assert.deepEqual(await cloudReporting.countMemberLoginsInRange(...range), { count: 4 });
  assert.equal((await cloudReporting.listReportingMemberLogins(...range)).length, 7);
  assert.equal((await piReporting.listReportingGuestLogins(...range)).length, 4);
});

test("PostgreSQL incremental Phase 2A1 pull rolls back the batch and checkpoint, then retries idempotently", async () => {
  const pi = await createTemporaryPool("rollback");
  disposablePools.push(pi);
  await seedUser(pi, 87, "rollback-robin");
  const gateway = createSyncGateway({ pool: pi });
  await gateway.writeLocalState({ stateKey: "local_machine_sync", state: { currentCheckpoint: 41 } });
  const course = { sync_id: "rollback-course", course_type: "beginners", coordinator_username: "rollback-robin", submitted_by_username: "rollback-robin", first_lesson_date: "2026-06-20", start_time: "18:00:00", end_time: "20:00:00", lesson_count: 1, beginner_capacity: 8, approval_status: "approved", is_cancelled: 0, created_at_date: "2026-06-01", created_at_time: "09:00:00" };
  const participant = { sync_id: "rollback-participant", course_sync_id: "missing-course", username: "rollback-robin", first_name: "Robin", surname: "Archer", beginner_size_category: "adult", origin_course_type: "beginners", created_by_username: "rollback-robin", created_at_date: "2026-06-01", created_at_time: "09:00:00" };
  const changes = [
    { domain: "range_presence_extensions", operation: "upsert", recordKey: "rollback-robin", payload: { username: "rollback-robin", active_until_date: "2026-06-01", active_until_time: "20:00:00", updated_by_username: "rollback-robin", updated_at_date: "2026-06-01", updated_at_time: "09:00:00", sync_version: 1 } },
    { domain: "login_events", operation: "upsert", recordKey: "rollback-login", payload: { username: "rollback-robin", login_method: "rfid", logged_in_date: "2026-06-01", logged_in_time: "10:00:00", sync_event_id: "rollback-login", sync_identity_origin: "native" } },
    { domain: "beginners_courses", operation: "upsert", recordKey: course.sync_id, payload: course },
    { domain: "beginners_course_participants", operation: "upsert", recordKey: participant.sync_id, payload: participant },
    { domain: "guest_login_events", operation: "upsert", recordKey: "rollback-guest", payload: { first_name: "Late", surname: "Guest", archery_gb_membership_number: "AGB-ROLLBACK", payment_method: "cash", logged_in_date: "2026-06-01", logged_in_time: "11:00:00", sync_event_id: "rollback-guest", sync_identity_origin: "native" } },
  ];
  const pull = { changes, checkpoint: 99, mode: "incremental" };
  await assert.rejects(() => applyPull(pi, { currentCheckpoint: 41, deactivatedRfidSuffix: "-deactivated", pullResponse: pull, syncGateway: gateway }));
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_event_id = 'rollback-login'`)).rows[0].count), 0);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'rollback-course'`)).rows[0].count), 0);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM guest_login_events WHERE sync_event_id = 'rollback-guest'`)).rows[0].count), 0);
  assert.equal((await gateway.readLocalState("local_machine_sync")).state.currentCheckpoint, 41);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM sync_local_outbox`)).rows[0].count), 0);
  changes[3] = { ...changes[3], payload: { ...participant, course_sync_id: course.sync_id } };
  await applyPull(pi, { currentCheckpoint: 41, deactivatedRfidSuffix: "-deactivated", pullResponse: pull, syncGateway: gateway });
  await applyPull(pi, { currentCheckpoint: 99, deactivatedRfidSuffix: "-deactivated", pullResponse: pull, syncGateway: gateway });
  assert.equal((await gateway.readLocalState("local_machine_sync")).state.currentCheckpoint, 99);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM login_events WHERE sync_event_id = 'rollback-login'`)).rows[0].count), 1);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM beginners_courses WHERE sync_id = 'rollback-course'`)).rows[0].count), 1);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM beginners_course_participants WHERE sync_id = 'rollback-participant'`)).rows[0].count), 1);
  assert.equal(Number((await pi.query(`SELECT COUNT(*) AS count FROM guest_login_events WHERE sync_event_id = 'rollback-guest'`)).rows[0].count), 1);
});

test("PostgreSQL mixed-version snapshots preserve omitted Phase 2A1 domains and apply only explicit empties", async () => {
  const pi = await createTemporaryPool("mixed");
  disposablePools.push(pi);
  await seedUser(pi, 87, "mixed-robin");
  const gateway = createSyncGateway({ pool: pi });
  await pi.query(`INSERT INTO login_events (username, user_id, login_method, logged_in_date, logged_in_time, sync_event_id) VALUES ('mixed-robin', 87, 'rfid', '2026-06-01', '10:00:00', 'mixed-login')`);
  await pi.query(`INSERT INTO guest_login_events (first_name, surname, archery_gb_membership_number, payment_method, logged_in_date, logged_in_time, sync_event_id) VALUES ('Mixed', 'Guest', 'AGB-MIXED', 'cash', '2026-06-01', '10:00:00', 'mixed-guest')`);
  await pi.query(`INSERT INTO range_presence_extensions (username, active_until_date, active_until_time, updated_by_username, updated_at_date, updated_at_time) VALUES ('mixed-robin', '2026-06-01', '20:00:00', 'mixed-robin', '2026-06-01', '10:00:00')`);
  await pi.query(`INSERT INTO beginners_courses (sync_id, coordinator_username, submitted_by_username, first_lesson_date, start_time, end_time, lesson_count, beginner_capacity, created_at_date, created_at_time) VALUES ('mixed-course', 'mixed-robin', 'mixed-robin', '2026-06-10', '18:00:00', '20:00:00', 1, 8, '2026-06-01', '09:00:00')`);
  await pi.query(`INSERT INTO beginners_course_lessons (sync_id, course_id, lesson_number, lesson_date, start_time, end_time) VALUES ('mixed-lesson', (SELECT id FROM beginners_courses WHERE sync_id = 'mixed-course'), 1, '2026-06-10', '18:00:00', '20:00:00')`);
  await pi.query(`INSERT INTO beginners_course_lesson_coaches (lesson_id, coach_username, assigned_by_username, assigned_at_date, assigned_at_time) VALUES ((SELECT id FROM beginners_course_lessons WHERE sync_id = 'mixed-lesson'), 'mixed-robin', 'mixed-robin', '2026-06-01', '09:00:00')`);
  await pi.query(`INSERT INTO beginners_course_participants (sync_id, course_id, username, user_id, first_name, surname, beginner_size_category, created_by_username, created_at_date, created_at_time) VALUES ('mixed-participant', (SELECT id FROM beginners_courses WHERE sync_id = 'mixed-course'), 'mixed-robin', 87, 'Robin', 'Archer', 'adult', 'mixed-robin', '2026-06-01', '09:00:00')`);
  const count = async (table) => Number((await pi.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);
  const oldCloudSnapshot = { users: [] };
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 0, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 1, mode: "snapshot", snapshot: oldCloudSnapshot }, syncGateway: gateway });
  assert.deepEqual(await Promise.all(["login_events", "guest_login_events", "range_presence_extensions", "beginners_courses", "beginners_course_lessons", "beginners_course_lesson_coaches", "beginners_course_participants"].map(count)), [1, 1, 1, 1, 1, 1, 1]);
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 1, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 2, mode: "snapshot", snapshot: { users: [], loginEvents: [], guestLoginEvents: [] } }, syncGateway: gateway });
  assert.equal(await count("login_events"), 1);
  assert.equal(await count("guest_login_events"), 1);
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 2, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 3, mode: "snapshot", snapshot: { users: [], rangePresenceExtensions: [] } }, syncGateway: gateway });
  assert.equal(await count("range_presence_extensions"), 0);
  assert.equal(await count("beginners_courses"), 1);
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 3, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 4, mode: "snapshot", snapshot: { users: [], beginnersCourses: [], beginnersCourseLessons: [], beginnersCourseLessonCoaches: [], beginnersCourseParticipants: [] } }, syncGateway: gateway });
  assert.deepEqual(await Promise.all(["beginners_courses", "beginners_course_lessons", "beginners_course_lesson_coaches", "beginners_course_participants"].map(count)), [0, 0, 0, 0]);
  assert.deepEqual(await Promise.all(["login_events", "guest_login_events"].map(count)), [1, 1]);
  await pi.query(`INSERT INTO range_presence_extensions (username, active_until_date, active_until_time, updated_by_username, updated_at_date, updated_at_time) VALUES ('mixed-robin', '2026-06-02', '20:00:00', 'mixed-robin', '2026-06-02', '10:00:00')`);
  await applyPulledSyncResponse({ client: pi, currentCheckpoint: 4, deactivatedRfidSuffix: "-deactivated", pullResponse: { checkpoint: 5, mode: "snapshot", snapshot: { users: [], loginEvents: [], rangePresenceExtensions: [] } }, syncGateway: gateway });
  assert.equal(await count("guest_login_events"), 1);
  assert.equal(await count("range_presence_extensions"), 0);
});
