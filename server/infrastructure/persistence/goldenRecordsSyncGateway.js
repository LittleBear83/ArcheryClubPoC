function normalizeGoldenRecordsSnapshotRow(row) {
  if (!row) {
    return null;
  }

  let snapshot = null;

  try {
    if (typeof row.snapshot_json === "string") {
      snapshot = JSON.parse(row.snapshot_json);
    } else if (row.snapshot_json && typeof row.snapshot_json === "object") {
      snapshot = row.snapshot_json;
    }
  } catch {
    snapshot = null;
  }

  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  return snapshot;
}

function createSqliteGoldenRecordsSyncGateway(db) {
  const findByUsernameStatement = db.prepare(`
    SELECT snapshot_json
    FROM golden_records_member_sync
    WHERE username = ?
    LIMIT 1
  `);
  const upsertStatement = db.prepare(`
    INSERT INTO golden_records_member_sync (
      username,
      snapshot_json,
      fetched_at,
      synced_at_date,
      synced_at_time,
      updated_by_username
    )
    VALUES (
      @username,
      @snapshotJson,
      @fetchedAt,
      @syncedAtDate,
      @syncedAtTime,
      @updatedByUsername
    )
    ON CONFLICT(username) DO UPDATE SET
      snapshot_json = excluded.snapshot_json,
      fetched_at = excluded.fetched_at,
      synced_at_date = excluded.synced_at_date,
      synced_at_time = excluded.synced_at_time,
      updated_by_username = excluded.updated_by_username
  `);

  return {
    async findByUsername(username) {
      return normalizeGoldenRecordsSnapshotRow(findByUsernameStatement.get(username));
    },
    async upsertSnapshot({
      fetchedAt,
      snapshot,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
      username,
    }) {
      upsertStatement.run({
        username,
        snapshotJson: JSON.stringify(snapshot ?? {}),
        fetchedAt: String(fetchedAt ?? "").trim(),
        syncedAtDate,
        syncedAtTime,
        updatedByUsername: updatedByUsername || null,
      });
    },
  };
}

function createPostgresGoldenRecordsSyncGateway(pool) {
  return {
    async findByUsername(username) {
      const result = await pool.query(
        `
          SELECT snapshot_json
          FROM golden_records_member_sync
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );

      return normalizeGoldenRecordsSnapshotRow(result.rows[0] ?? null);
    },
    async upsertSnapshot({
      fetchedAt,
      snapshot,
      syncedAtDate,
      syncedAtTime,
      updatedByUsername,
      username,
    }) {
      await pool.query(
        `
          INSERT INTO golden_records_member_sync (
            username,
            snapshot_json,
            fetched_at,
            synced_at_date,
            synced_at_time,
            updated_by_username,
            user_id,
            updated_by_user_id
          )
          VALUES (
            $1,
            $2::jsonb,
            $3,
            $4,
            $5,
            $6,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
            (SELECT id FROM users WHERE LOWER(username) = LOWER($6) LIMIT 1)
          )
          ON CONFLICT(username) DO UPDATE SET
            snapshot_json = EXCLUDED.snapshot_json,
            fetched_at = EXCLUDED.fetched_at,
            synced_at_date = EXCLUDED.synced_at_date,
            synced_at_time = EXCLUDED.synced_at_time,
            updated_by_username = EXCLUDED.updated_by_username,
            user_id = EXCLUDED.user_id,
            updated_by_user_id = EXCLUDED.updated_by_user_id
        `,
        [
          username,
          JSON.stringify(snapshot ?? {}),
          String(fetchedAt ?? "").trim(),
          syncedAtDate,
          syncedAtTime,
          updatedByUsername || null,
        ],
      );
    },
  };
}

export function createGoldenRecordsSyncGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresGoldenRecordsSyncGateway(pool);
  }

  return createSqliteGoldenRecordsSyncGateway(db);
}
