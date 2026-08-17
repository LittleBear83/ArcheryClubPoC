function parseJsonValue(value) {
  if (!value) {
    return null;
  }

  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function createSqliteGoldenRecordsIntegrationGateway(db) {
  const findStatusStatement = db.prepare(`
    SELECT status_json
    FROM golden_records_integration_status
    WHERE status_key = ?
    LIMIT 1
  `);
  const upsertStatusStatement = db.prepare(`
    INSERT INTO golden_records_integration_status (
      status_key,
      status_json,
      updated_at
    )
    VALUES (@statusKey, @statusJson, @updatedAt)
    ON CONFLICT(status_key) DO UPDATE SET
      status_json = excluded.status_json,
      updated_at = excluded.updated_at
  `);
  const replaceLookupStatement = db.prepare(`
    INSERT INTO golden_records_lookup_cache (
      lookup_type,
      item_count,
      payload_json,
      fetched_at,
      synced_at_date,
      synced_at_time,
      updated_by_username
    )
    VALUES (
      @lookupType,
      @itemCount,
      @payloadJson,
      @fetchedAt,
      @syncedAtDate,
      @syncedAtTime,
      @updatedByUsername
    )
    ON CONFLICT(lookup_type) DO UPDATE SET
      item_count = excluded.item_count,
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at,
      synced_at_date = excluded.synced_at_date,
      synced_at_time = excluded.synced_at_time,
      updated_by_username = excluded.updated_by_username
  `);
  const listLookupSummariesStatement = db.prepare(`
    SELECT
      lookup_type,
      item_count,
      fetched_at,
      synced_at_date,
      synced_at_time,
      updated_by_username
    FROM golden_records_lookup_cache
    ORDER BY lookup_type ASC
  `);

  return {
    async findStatus(statusKey) {
      return parseJsonValue(findStatusStatement.get(statusKey)?.status_json ?? null);
    },
    async listLookupSummaries() {
      return listLookupSummariesStatement.all().map((row) => ({
        fetchedAt: String(row.fetched_at ?? "").trim(),
        itemCount: Number(row.item_count ?? 0),
        lookupType: String(row.lookup_type ?? "").trim(),
        syncedAtDate: String(row.synced_at_date ?? "").trim(),
        syncedAtTime: String(row.synced_at_time ?? "").trim(),
        updatedByUsername: String(row.updated_by_username ?? "").trim(),
      }));
    },
    async replaceLookup({
      fetchedAt,
      itemCount,
      lookupType,
      payload,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
    }) {
      replaceLookupStatement.run({
        lookupType,
        itemCount,
        payloadJson: JSON.stringify(payload ?? []),
        fetchedAt: String(fetchedAt ?? "").trim(),
        syncedAtDate: String(syncedAtDate ?? "").trim(),
        syncedAtTime: String(syncedAtTime ?? "").trim(),
        updatedByUsername: updatedByUsername || null,
      });
    },
    async upsertStatus(statusKey, value) {
      upsertStatusStatement.run({
        statusKey,
        statusJson: JSON.stringify(value ?? {}),
        updatedAt: new Date().toISOString(),
      });
    },
  };
}

function createPostgresGoldenRecordsIntegrationGateway(pool) {
  return {
    async findStatus(statusKey) {
      const result = await pool.query(
        `
          SELECT status_json
          FROM golden_records_integration_status
          WHERE status_key = $1
          LIMIT 1
        `,
        [statusKey],
      );

      return parseJsonValue(result.rows[0]?.status_json ?? null);
    },
    async listLookupSummaries() {
      const result = await pool.query(`
        SELECT
          lookup_type,
          item_count,
          fetched_at,
          synced_at_date,
          synced_at_time,
          updated_by_username
        FROM golden_records_lookup_cache
        ORDER BY lookup_type ASC
      `);

      return result.rows.map((row) => ({
        fetchedAt: String(row.fetched_at ?? "").trim(),
        itemCount: Number(row.item_count ?? 0),
        lookupType: String(row.lookup_type ?? "").trim(),
        syncedAtDate: String(row.synced_at_date ?? "").trim(),
        syncedAtTime: String(row.synced_at_time ?? "").trim(),
        updatedByUsername: String(row.updated_by_username ?? "").trim(),
      }));
    },
    async replaceLookup({
      fetchedAt,
      itemCount,
      lookupType,
      payload,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
    }) {
      await pool.query(
        `
          INSERT INTO golden_records_lookup_cache (
            lookup_type,
            item_count,
            payload_json,
            fetched_at,
            synced_at_date,
            synced_at_time,
            updated_by_username
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
          ON CONFLICT(lookup_type) DO UPDATE SET
            item_count = EXCLUDED.item_count,
            payload_json = EXCLUDED.payload_json,
            fetched_at = EXCLUDED.fetched_at,
            synced_at_date = EXCLUDED.synced_at_date,
            synced_at_time = EXCLUDED.synced_at_time,
            updated_by_username = EXCLUDED.updated_by_username
        `,
        [
          lookupType,
          itemCount,
          JSON.stringify(payload ?? []),
          String(fetchedAt ?? "").trim(),
          String(syncedAtDate ?? "").trim(),
          String(syncedAtTime ?? "").trim(),
          updatedByUsername || null,
        ],
      );
    },
    async upsertStatus(statusKey, value) {
      await pool.query(
        `
          INSERT INTO golden_records_integration_status (
            status_key,
            status_json,
            updated_at
          )
          VALUES ($1, $2::jsonb, $3)
          ON CONFLICT(status_key) DO UPDATE SET
            status_json = EXCLUDED.status_json,
            updated_at = EXCLUDED.updated_at
        `,
        [statusKey, JSON.stringify(value ?? {}), new Date().toISOString()],
      );
    },
  };
}

export function createGoldenRecordsIntegrationGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresGoldenRecordsIntegrationGateway(pool);
  }

  return createSqliteGoldenRecordsIntegrationGateway(db);
}
