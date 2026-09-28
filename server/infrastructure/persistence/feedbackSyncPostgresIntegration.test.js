import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { test } from "node:test";
import pg from "pg";
import { buildInitialSchemaSql } from "./runPostgresMigrations.js";
import { postgresMigrations } from "./postgresMigrations/index.js";
import { createSyncGateway } from "./syncGateway.js";
import { processFeedbackCreateCommand } from "./feedbackSyncCommand.js";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName, TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";

const enabled = process.env.ARCHERY_POSTGRES_INTEGRATION_TESTS === "1";

async function inTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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

test("PostgreSQL feedback migration publishes both domains and suppresses pulled echoes", { skip: !enabled }, async () => {
  assertSafeIntegrationEnvironment(process.env);
  const databaseName = `${TEST_DATABASE_PREFIX}feedback_${randomUUID().replaceAll("-", "")}`;
  assertSafeTemporaryDatabaseName(databaseName);
  const config = {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || undefined,
  };
  const admin = new pg.Pool({ ...config, database: "postgres" });
  let pool;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    pool = new pg.Pool({ ...config, database: databaseName });
    await pool.query(buildInitialSchemaSql());
    for (const migration of postgresMigrations) {
      for (const statement of migration.statements) await pool.query(statement);
    }
    await pool.query(`INSERT INTO users (username, first_name, surname, active_member)
      VALUES ('robin', 'Robin', 'Archer', 1)`);

    const createdQuestion = await pool.query(`INSERT INTO member_questions
      (submitted_by_username, question_title, question_body, created_at_date, created_at_time)
      VALUES ('robin', 'Question', 'Body', '2026-09-01', '10:00:00') RETURNING sync_id`);
    const createdSuggestion = await pool.query(`INSERT INTO suggestions
      (submitted_by_username, submitted_by_name, is_anonymous, suggestion_title,
       improvement_text, suggestion_details, created_at_date, created_at_time)
      VALUES ('robin', 'Robin', FALSE, 'Suggestion', 'Improve', '', '2026-09-01', '10:00:00') RETURNING sync_id`);
    const gateway = createSyncGateway({ pool });
    const { snapshot } = await gateway.getAuthSnapshot();
    assert.equal(snapshot.memberQuestions[0].sync_id, createdQuestion.rows[0].sync_id);
    assert.equal(snapshot.suggestions[0].sync_id, createdSuggestion.rows[0].sync_id);

    await pool.query("UPDATE member_questions SET response_text = 'Cloud answer' WHERE sync_id = $1", [createdQuestion.rows[0].sync_id]);
    await pool.query("DELETE FROM suggestions WHERE sync_id = $1", [createdSuggestion.rows[0].sync_id]);
    const changes = await pool.query(`SELECT domain, operation, record_key, payload_json
      FROM sync_change_log WHERE domain IN ('member_questions', 'suggestions') ORDER BY change_id`);
    assert.deepEqual(changes.rows.map((row) => [row.domain, row.operation]), [
      ["member_questions", "upsert"], ["suggestions", "upsert"],
      ["member_questions", "upsert"], ["suggestions", "delete"],
    ]);
    assert.equal(changes.rows[3].payload_json.sync_id, createdSuggestion.rows[0].sync_id);
    assert.equal(Object.hasOwn(changes.rows[0].payload_json, "id"), false);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('archery.sync.apply_mode', 'pull', true)");
      await client.query("UPDATE member_questions SET response_text = 'Pulled answer' WHERE sync_id = $1", [createdQuestion.rows[0].sync_id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const echoed = await pool.query("SELECT COUNT(*)::int AS count FROM sync_change_log WHERE domain = 'member_questions'");
    assert.equal(echoed.rows[0].count, 2);

    const event = { eventId: randomUUID(), eventType: "member_question_created", payload: {
      sync_id: randomUUID(), sync_source_machine_id: "pi-1", expectedVersion: 0,
      submitted_by_username: "robin", question_title: "Pi question", question_body: "Pi body",
      created_at_date: "2026-09-01", created_at_time: "11:00:00",
    } };
    event.payload.sync_origin_event_id = event.eventId;
    assert.deepEqual(await inTransaction(pool, (client) => processFeedbackCreateCommand({ client, event, machineId: "pi-1" })), { accepted: true });
    assert.deepEqual(await inTransaction(pool, (client) => processFeedbackCreateCommand({ client, event, machineId: "pi-1" })), { accepted: true });
    const duplicates = await pool.query("SELECT COUNT(*)::int AS count FROM member_questions WHERE sync_id = $1", [event.payload.sync_id]);
    assert.equal(duplicates.rows[0].count, 1);
  } finally {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
});
