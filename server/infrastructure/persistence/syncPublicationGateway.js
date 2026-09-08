// Publishers own a dedicated transaction and only lock publication state.
// Do not run publication inside a business-write transaction. No caller is
// wired into the v1 sync protocol: this is an additive foundation only.
export function createSyncPublicationGateway({ pool }) {
  return {
    async publishBatch({ limit = 500 } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
        throw new RangeError("Publication batch limit must be an integer between 1 and 5000.");
      }
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        await client.query("SET LOCAL statement_timeout = '10s'");
        const state = await client.query(
          "SELECT last_cursor FROM sync_publication_state WHERE singleton FOR UPDATE",
        );
        if (state.rowCount !== 1) {
          throw new Error("Sync publication state is missing; run PostgreSQL migrations.");
        }
        // Separate statement after locking: a waiting publisher must discover
        // against a fresh READ COMMITTED snapshot, including its predecessor.
        // Never replace this anti-join with a source change-ID high-water mark.
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
          SELECT publication_cursor::text AS "publicationCursor", change_id::text AS "changeId"
          FROM assigned ORDER BY publication_cursor
        `, [limit]);
        await client.query("COMMIT");
        return result.rows;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { discard = true; }
        // If COMMIT succeeded but its acknowledgement was lost, retrying is
        // safe: durable unique mappings are discovered rather than reassigned.
        throw error;
      } finally {
        client.release(discard);
      }
    },
  };
}
