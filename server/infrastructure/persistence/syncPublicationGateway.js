import { createSyncGateway } from "./syncGateway.js";

// Publishers own a dedicated transaction and only lock publication state.
// Do not run publication inside a business-write transaction. No caller is
// wired into the v1 sync protocol: this is an additive foundation only.
async function assignVisiblePublications(client, limit) {
  const limitClause = limit === undefined ? "" : "LIMIT $1";
  const result = await client.query(`
    WITH candidates AS MATERIALIZED (
      SELECT c.change_id FROM sync_change_log c
      WHERE NOT EXISTS (SELECT 1 FROM sync_publication p WHERE p.change_id = c.change_id)
      ORDER BY c.change_id ${limitClause}
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
  `, limit === undefined ? [] : [limit]);
  return result.rows;
}

export function createSyncPublicationGateway({ pool, syncGateway = createSyncGateway({ pool }) }) {
  return {
    pool,
    async getPublicationHead() {
      const { rows } = await pool.query("SELECT last_cursor::text AS checkpoint FROM sync_publication_state WHERE singleton");
      if (rows.length !== 1) throw new Error("Sync publication state is missing; run PostgreSQL migrations.");
      return rows[0].checkpoint;
    },
    async listPublishedChanges({ checkpoint, limit }) {
      const { rows } = await pool.query(`
        SELECT p.publication_cursor::text AS "publicationCursor",
          c.change_id::text AS "changeId", c.domain, c.record_key AS "recordKey",
          c.operation, c.payload_json AS payload, c.changed_at AS "changedAt"
        FROM sync_publication p JOIN sync_change_log c ON c.change_id = p.change_id
        WHERE p.publication_cursor > $1
        ORDER BY p.publication_cursor LIMIT $2
      `, [checkpoint, limit]);
      return rows;
    },
    async createSnapshot({ maxAttempts = 3 } = {}) {
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new RangeError("Snapshot maxAttempts must be a positive integer.");
      }
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const client = await pool.connect();
        let discard = false;
        try {
          await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
          await client.query("SET LOCAL statement_timeout = '30s'");
          const state = await client.query(
            "SELECT last_cursor FROM sync_publication_state WHERE singleton FOR UPDATE",
          );
          if (state.rowCount !== 1) {
            throw new Error("Sync publication state is missing; run PostgreSQL migrations.");
          }
          await assignVisiblePublications(client);
          const { snapshot } = await syncGateway.getAuthSnapshot(client);
          const checkpointResult = await client.query(
            "SELECT last_cursor::text AS checkpoint FROM sync_publication_state WHERE singleton",
          );
          if (checkpointResult.rowCount !== 1) {
            throw new Error("Sync publication state is missing; run PostgreSQL migrations.");
          }
          await client.query("COMMIT");
          return { checkpoint: checkpointResult.rows[0].checkpoint, snapshot };
        } catch (error) {
          try { await client.query("ROLLBACK"); } catch { discard = true; }
          if (error?.code !== "40001" || attempt === maxAttempts) throw error;
        } finally {
          client.release(discard);
        }
      }
      throw new Error("Publication snapshot retry loop ended unexpectedly.");
    },
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
        const rows = await assignVisiblePublications(client, limit);
        await client.query("COMMIT");
        return rows;
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
