

const OUTDOOR_TABLE_REPLICATED_COLUMNS = [
  "season_year",
  "archer_username",
  "bow_type",
  "handicap",
  "archer_3rd",
  "archer_2nd",
  "archer_1st",
  "bowman_3rd",
  "bowman_2nd",
  "bowman_1st",
  "master_bowman",
  "grand_master_bowman",
  "elite_master_bowman",
  "archer_3rd_date",
  "archer_2nd_date",
  "archer_1st_date",
  "bowman_3rd_date",
  "bowman_2nd_date",
  "bowman_1st_date",
  "master_bowman_date",
  "grand_master_bowman_date",
  "elite_master_bowman_date",
  "award_252_20",
  "award_252_30",
  "award_252_40",
  "award_252_50",
  "award_252_60",
  "award_252_80",
  "award_252_100",
  "award_252_20_sign_off_dates",
  "award_252_30_sign_off_dates",
  "award_252_40_sign_off_dates",
  "award_252_50_sign_off_dates",
  "award_252_60_sign_off_dates",
  "award_252_80_sign_off_dates",
  "award_252_100_sign_off_dates",
  "clout_white_20",
  "clout_white_30",
  "clout_white_40",
  "clout_white_50",
  "clout_white_60",
  "clout_white_70_80",
  "clout_white_90_100",
  "created_at_date",
  "created_at_time",
  "updated_at_date",
  "updated_at_time",
  "updated_by_username",
];

const OUTDOOR_TABLE_JSON_COLUMNS = new Set([
  "award_252_20_sign_off_dates",
  "award_252_30_sign_off_dates",
  "award_252_40_sign_off_dates",
  "award_252_50_sign_off_dates",
  "award_252_60_sign_off_dates",
  "award_252_80_sign_off_dates",
  "award_252_100_sign_off_dates",
]);

export async function upsertOutdoorTableRows(client, rows = []) {
  const keyColumns = new Set(["season_year", "archer_username", "bow_type"]);

  const placeholders = OUTDOOR_TABLE_REPLICATED_COLUMNS.map((column, index) =>
    OUTDOOR_TABLE_JSON_COLUMNS.has(column)
      ? `$${index + 1}::jsonb`
      : `$${index + 1}`,
  );

  const updateColumns = OUTDOOR_TABLE_REPLICATED_COLUMNS
    .filter((column) => !keyColumns.has(column))
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(",\n          ");

  const updatedByUsernameIndex =
    OUTDOOR_TABLE_REPLICATED_COLUMNS.indexOf("updated_by_username") + 1;

  for (const row of rows) {
    const values = OUTDOOR_TABLE_REPLICATED_COLUMNS.map((column) => {
      const value = row[column];

      if (OUTDOOR_TABLE_JSON_COLUMNS.has(column)) {
        return JSON.stringify(value ?? ["", "", ""]);
      }

      return value ?? null;
    });

    await client.query(
      `
        INSERT INTO outdoor_table_entries (
          ${OUTDOOR_TABLE_REPLICATED_COLUMNS.join(",\n          ")},
          updated_by_user_id
        )
        VALUES (
          ${placeholders.join(",\n          ")},
          (
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER($${updatedByUsernameIndex})
            LIMIT 1
          )
        )
        ON CONFLICT (season_year, archer_username, bow_type) DO UPDATE SET
          ${updateColumns},
          updated_by_user_id = EXCLUDED.updated_by_user_id
      `,
      values,
    );
  }
}


export async function deleteMissingOutdoorTableRows(client, rows = []) {
  const keys = rows.map((row) =>
    [
      row.season_year,
      String(row.archer_username ?? "").toLowerCase(),
      String(row.bow_type ?? "").toLowerCase(),
    ].join(":"),
  );

  if (keys.length === 0) {
    await client.query(`DELETE FROM outdoor_table_entries`);
    return;
  }

  await client.query(
    `
      DELETE FROM outdoor_table_entries
      WHERE concat_ws(
        ':',
        season_year::text,
        LOWER(COALESCE(archer_username, '')),
        LOWER(COALESCE(bow_type, ''))
      ) <> ALL($1::text[])
    `,
    [keys],
  );
}

export async function upsertIndoorTableRows(client, rows = []) {
  for (const row of rows) {
    await client.query(`
      INSERT INTO indoor_table_entries (season_year, archer_username, bow_type, handicap,
        classifications_json, scores_json, created_at_date, created_at_time,
        updated_at_date, updated_at_time, updated_by_username)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)
      ON CONFLICT (season_year, archer_username, bow_type) DO UPDATE SET
        handicap=EXCLUDED.handicap, classifications_json=EXCLUDED.classifications_json,
        scores_json=EXCLUDED.scores_json, updated_at_date=EXCLUDED.updated_at_date,
        updated_at_time=EXCLUDED.updated_at_time, updated_by_username=EXCLUDED.updated_by_username
    `, [row.season_year, row.archer_username, row.bow_type, row.handicap,
      JSON.stringify(typeof row.classifications_json === "string" ? JSON.parse(row.classifications_json) : row.classifications_json ?? {}),
      JSON.stringify(typeof row.scores_json === "string" ? JSON.parse(row.scores_json) : row.scores_json ?? {}),
      row.created_at_date, row.created_at_time, row.updated_at_date,
      row.updated_at_time, row.updated_by_username]);
  }
}

export async function deleteMissingIndoorTableRows(client, rows = []) {
  const keys = rows.map((row) => [row.season_year,
    String(row.archer_username ?? "").toLowerCase(),
    String(row.bow_type ?? "").toLowerCase()].join(":"));
  if (keys.length === 0) { await client.query("DELETE FROM indoor_table_entries"); return; }
  await client.query(`DELETE FROM indoor_table_entries WHERE concat_ws(':', season_year::text,
    LOWER(archer_username), LOWER(bow_type)) <> ALL($1::text[])`, [keys]);
}

export async function upsertGoldenRecordsMemberSyncRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
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
        ON CONFLICT (username) DO UPDATE SET
          snapshot_json = EXCLUDED.snapshot_json,
          fetched_at = EXCLUDED.fetched_at,
          synced_at_date = EXCLUDED.synced_at_date,
          synced_at_time = EXCLUDED.synced_at_time,
          updated_by_username = EXCLUDED.updated_by_username,
          user_id = EXCLUDED.user_id,
          updated_by_user_id = EXCLUDED.updated_by_user_id
      `,
      [
        row.username,
        JSON.stringify(row.snapshot_json ?? {}),
        row.fetched_at ?? "",
        row.synced_at_date,
        row.synced_at_time,
        row.updated_by_username ?? null,
      ],
    );
  }
}

export async function upsertGoldenRecordsIntegrationStatusRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO golden_records_integration_status (
          status_key,
          status_json,
          updated_at
        )
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (status_key) DO UPDATE SET
          status_json = EXCLUDED.status_json,
          updated_at = EXCLUDED.updated_at
      `,
      [
        row.status_key,
        JSON.stringify(row.status_json ?? {}),
        row.updated_at ?? "",
      ],
    );
  }
}

export async function upsertGoldenRecordsLookupCacheRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
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
        ON CONFLICT (lookup_type) DO UPDATE SET
          item_count = EXCLUDED.item_count,
          payload_json = EXCLUDED.payload_json,
          fetched_at = EXCLUDED.fetched_at,
          synced_at_date = EXCLUDED.synced_at_date,
          synced_at_time = EXCLUDED.synced_at_time,
          updated_by_username = EXCLUDED.updated_by_username
      `,
      [
        row.lookup_type,
        Number(row.item_count ?? 0),
        JSON.stringify(row.payload_json ?? []),
        row.fetched_at ?? "",
        row.synced_at_date ?? "",
        row.synced_at_time ?? "",
        row.updated_by_username ?? null,
      ],
    );
  }
}
