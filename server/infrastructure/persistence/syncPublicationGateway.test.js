import assert from "node:assert/strict";
import { test } from "node:test";
import { createSyncPublicationGateway } from "./syncPublicationGateway.js";
import { createSyncGateway } from "./syncGateway.js";

test("publication snapshot retries 40001 with a fresh repeatable-read transaction", async () => {
  const attempts = [];
  let connects = 0;
  const pool = {
    async connect() {
      connects += 1;
      const attempt = { queries: [], releases: [] };
      attempts.push(attempt);
      return {
        async query(sql) {
          const normalized = String(sql).replace(/\s+/g, " ").trim();
          attempt.queries.push(normalized);
          if (connects === 1 && normalized.endsWith("FOR UPDATE")) {
            const error = new Error("serialization failure");
            error.code = "40001";
            throw error;
          }
          if (normalized.endsWith("FOR UPDATE")) return { rowCount: 1, rows: [{ last_cursor: "0" }] };
          if (normalized.startsWith("WITH candidates AS MATERIALIZED")) {
            assert.equal(normalized.includes("LIMIT $1"), false, "snapshot publication is unbounded");
            return { rowCount: 1, rows: [{ publicationCursor: "9007199254740993", changeId: "8" }] };
          }
          if (normalized.startsWith("SELECT last_cursor::text AS checkpoint")) {
            return { rowCount: 1, rows: [{ checkpoint: "9007199254740993" }] };
          }
          return { rowCount: 0, rows: [] };
        },
        release(discard) { attempt.releases.push(discard); },
      };
    },
  };
  const gateway = createSyncPublicationGateway({
    pool,
    syncGateway: { async getAuthSnapshot() { return { snapshot: { roles: [] } }; } },
  });

  assert.deepEqual(await gateway.createSnapshot(), {
    checkpoint: "9007199254740993",
    snapshot: { roles: [] },
  });
  assert.equal(connects, 2);
  assert.equal(attempts[0].queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ");
  assert.equal(attempts[0].queries.at(-1), "ROLLBACK");
  assert.equal(attempts[1].queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ");
  assert.equal(attempts[1].queries.at(-1), "COMMIT");
  assert.deepEqual(attempts.map((attempt) => attempt.releases), [[false], [false]]);
});

test("publication snapshot does not retry a non-serialization failure", async () => {
  const failure = new Error("snapshot read failed");
  let connects = 0;
  const queries = [];
  const gateway = createSyncPublicationGateway({
    pool: {
      async connect() {
        connects += 1;
        return {
          async query(sql) {
            const normalized = String(sql).replace(/\s+/g, " ").trim();
            queries.push(normalized);
            if (normalized.endsWith("FOR UPDATE")) return { rowCount: 1, rows: [{ last_cursor: "0" }] };
            return { rowCount: 0, rows: [] };
          },
          release() {},
        };
      },
    },
    syncGateway: { async getAuthSnapshot() { throw failure; } },
  });

  await assert.rejects(gateway.createSnapshot(), (error) => error === failure);
  assert.equal(connects, 1);
  assert.equal(queries.at(-1), "ROLLBACK");
});

test("auth snapshot includes the extended SSE domain datasets", async () => {
  const rowsByTable = {
    golden_records_member_sync: [{ username: "robin" }],
    golden_records_integration_status: [{ status_key: "integration" }],
    golden_records_lookup_cache: [{ lookup_type: "bows" }],
    outdoor_table_entries: [{
      season_year: 2026,
      archer_username: "robin",
      bow_type: "Recurve",
    }],
  };

  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();

      if (normalized.includes("MAX(change_id)")) {
        return { rowCount: 1, rows: [{ checkpoint: "42" }] };
      }

      for (const [table, rows] of Object.entries(rowsByTable)) {
        if (normalized.includes(`FROM ${table}`)) {
          return { rowCount: rows.length, rows };
        }
      }

      return { rowCount: 0, rows: [] };
    },
  };

  const result = await createSyncGateway({ pool: client })
    .getAuthSnapshot(client);

  assert.equal(result.checkpoint, 42);
  assert.deepEqual(
    result.snapshot.goldenRecordsMemberSync,
    rowsByTable.golden_records_member_sync,
  );
  assert.deepEqual(
    result.snapshot.goldenRecordsIntegrationStatus,
    rowsByTable.golden_records_integration_status,
  );
  assert.deepEqual(
    result.snapshot.goldenRecordsLookupCache,
    rowsByTable.golden_records_lookup_cache,
  );
  assert.deepEqual(
    result.snapshot.outdoorTableEntries,
    rowsByTable.outdoor_table_entries,
  );
});
