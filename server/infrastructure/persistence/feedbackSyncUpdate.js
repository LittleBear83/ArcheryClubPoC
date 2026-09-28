import { randomUUID } from "node:crypto";

export async function updateFeedbackWithOutbox({
  eventType,
  id,
  isLocalPiNode,
  payload,
  pool,
  table,
  updateQuery,
  updateValues,
}) {
  if (!isLocalPiNode) {
    await pool.query(updateQuery, updateValues);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT sync_id, sync_version, submitted_by_username FROM ${table} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!current.rows[0]) {
      await client.query("COMMIT");
      return;
    }
    await client.query(updateQuery, updateValues);
    const eventId = randomUUID();
    await client.query(
      `INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        eventId,
        eventType,
        current.rows[0].sync_id,
        JSON.stringify({
          ...payload,
          syncId: current.rows[0].sync_id,
          expectedVersion: Number(current.rows[0].sync_version),
          submittedByUsername: current.rows[0].submitted_by_username,
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
