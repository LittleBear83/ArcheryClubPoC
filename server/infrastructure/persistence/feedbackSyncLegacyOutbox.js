import { randomUUID } from "node:crypto";

const DOMAINS = [
  ["member_questions", "member_question_created"],
  ["suggestions", "suggestion_created"],
];

export async function enqueueLegacyFeedbackRows({ pool, machineId }) {
  if (!machineId) throw new Error("A sync machine ID is required to backfill Pi feedback.");
  const client = await pool.connect();
  let enqueued = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(81420733)");
    await client.query("SELECT set_config('archery.sync.apply_mode', 'maintenance', true)");
    const migration = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = '015_feedback_sync' LIMIT 1",
    );
    if (!migration.rows[0]) {
      throw new Error("Migration 015_feedback_sync must run before Pi feedback sync.");
    }
    for (const [table, eventType] of DOMAINS) {
      const existing = await client.query(
        `SELECT * FROM ${table} WHERE sync_origin_event_id IS NULL
           AND sync_is_cloud_managed = FALSE FOR UPDATE SKIP LOCKED`,
      );
      for (const row of existing.rows) {
        const eventId = randomUUID();
        const updated = await client.query(
          `UPDATE ${table}
           SET sync_source_machine_id = $2, sync_origin_event_id = $3
           WHERE id = $1 AND sync_origin_event_id IS NULL
           RETURNING *`,
          [row.id, machineId, eventId],
        );
        if (!updated.rows[0]) continue;
        const portableRow = { ...updated.rows[0] };
        for (const field of ["id", "submitted_by_user_id", "responded_by_user_id", "updated_by_user_id", "sync_is_cloud_managed"]) {
          delete portableRow[field];
        }
        await client.query(
          `INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [eventId, eventType, portableRow.sync_id, JSON.stringify({ ...portableRow, expectedVersion: 0 })],
        );
        enqueued += 1;

        let reviewEventType = null;
        let reviewPayload = null;
        if (table === "member_questions" && portableRow.status === "answered" &&
          portableRow.response_text && portableRow.responded_by_username) {
          reviewEventType = "member_question_response_updated";
          reviewPayload = {
            syncId: portableRow.sync_id,
            expectedVersion: 1,
            responseText: portableRow.response_text,
            respondedByUsername: portableRow.responded_by_username,
          };
        } else if (table === "suggestions" && portableRow.updated_by_username) {
          reviewEventType = "suggestion_status_updated";
          reviewPayload = {
            syncId: portableRow.sync_id,
            expectedVersion: 1,
            status: portableRow.status,
            resolutionNote: portableRow.resolution_note,
            updatedByUsername: portableRow.updated_by_username,
          };
        }
        if (reviewEventType) {
          await client.query(
            `INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
             VALUES ($1, $2, $3, $4::jsonb)`,
            [randomUUID(), reviewEventType, portableRow.sync_id, JSON.stringify(reviewPayload)],
          );
          enqueued += 1;
        }
        if (reviewEventType === "member_question_response_updated" && portableRow.member_seen_response) {
          await client.query(
            `INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
             VALUES ($1, 'member_question_seen', $2, $3::jsonb)`,
            [randomUUID(), portableRow.sync_id, JSON.stringify({
              syncId: portableRow.sync_id,
              expectedVersion: 2,
              submittedByUsername: portableRow.submitted_by_username,
            })],
          );
          enqueued += 1;
        }
      }
    }
    await client.query("COMMIT");
    return enqueued;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
