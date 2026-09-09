import { createSyncPublicationGateway } from "./syncPublicationGateway.js";

// Test-only snapshot/pull helpers; production v1 readers remain unchanged.
// Only publishers lock this private row. Never call this from a business-write
// transaction. Discovery is a separate statement AFTER acquiring the mutex, so
// READ COMMITTED sees the preceding publisher's committed mappings.
export async function beginPublication(client, { snapshot = false } = {}) {
  await client.query(snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN ISOLATION LEVEL READ COMMITTED");
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query("SELECT last_cursor FROM sync_publication_state WHERE singleton FOR UPDATE");
}

export async function assignPublications(client, limit = 500) {
  const result = await client.query(`
    WITH candidates AS MATERIALIZED (
      SELECT c.change_id FROM sync_change_log c
      WHERE NOT EXISTS (SELECT 1 FROM sync_publication p WHERE p.change_id = c.change_id)
      ORDER BY c.change_id LIMIT $1
    ), assigned AS (
      INSERT INTO sync_publication (publication_cursor, change_id)
      SELECT s.last_cursor + row_number() OVER (ORDER BY c.change_id), c.change_id
      FROM candidates c CROSS JOIN sync_publication_state s
      WHERE s.singleton
      RETURNING publication_cursor, change_id
    ), advanced AS (
      UPDATE sync_publication_state
      SET last_cursor = (SELECT MAX(publication_cursor) FROM assigned)
      WHERE singleton AND EXISTS (SELECT 1 FROM assigned)
      RETURNING last_cursor
    )
    SELECT publication_cursor, change_id FROM assigned ORDER BY publication_cursor
  `, [limit]);
  return result.rows;
}

export async function publish(pool, limit = 500) {
  const rows = await createSyncPublicationGateway({ pool }).publishBatch({ limit });
  return rows.map((row) => ({ publication_cursor: row.publicationCursor, change_id: row.changeId }));
}

// Publication order, not original change-ID order. Empty pages retain the
// supplied checkpoint. Decimal strings avoid losing BIGINT precision in JSON.
export async function pullPublications(pool, checkpoint = "0", limit = 500) {
  const { rows } = await pool.query(`
    SELECT p.publication_cursor, c.change_id, c.domain, c.record_key, c.operation, c.payload_json
    FROM sync_publication p JOIN sync_change_log c ON c.change_id = p.change_id
    WHERE p.publication_cursor > $1 ORDER BY p.publication_cursor LIMIT $2
  `, [checkpoint, limit]);
  return { checkpoint: rows.at(-1)?.publication_cursor ?? checkpoint, changes: rows };
}

export async function waitForDatabaseBlock(pool, blocker, waiter) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const { rows } = await pool.query("SELECT $1::int = ANY(pg_blocking_pids($2)) AS blocked", [blocker.processID, waiter.processID]);
    if (rows[0].blocked) return;
    if (Date.now() >= deadline) throw new Error("Expected PostgreSQL lock barrier was not reached");
  }
}
