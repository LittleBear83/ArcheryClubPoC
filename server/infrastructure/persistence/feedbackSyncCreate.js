import { randomUUID } from "node:crypto";

export async function createFeedbackRecord({
  eventType,
  isLocalPiNode,
  pool,
  query,
  syncMachineId,
  values,
}) {
  if (isLocalPiNode && !syncMachineId) {
    throw new Error("A sync machine ID is required to create feedback on the Pi.");
  }

  const syncId = randomUUID();
  const eventId = isLocalPiNode ? randomUUID() : null;
  const client = isLocalPiNode ? await pool.connect() : pool;

  try {
    if (isLocalPiNode) await client.query("BEGIN");
    const result = await client.query(query, [
      ...values,
      syncId,
      isLocalPiNode ? syncMachineId : null,
      eventId,
    ]);
    const row = result.rows[0];

    if (isLocalPiNode) {
      const portableRow = { ...row };
      for (const field of ["id", "submitted_by_user_id", "responded_by_user_id", "updated_by_user_id", "sync_is_cloud_managed"]) {
        delete portableRow[field];
      }
      await client.query(
        `INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [eventId, eventType, syncId, JSON.stringify({ ...portableRow, expectedVersion: 0 })],
      );
      await client.query("COMMIT");
    }
    return row.id;
  } catch (error) {
    if (isLocalPiNode) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (isLocalPiNode) client.release();
  }
}
