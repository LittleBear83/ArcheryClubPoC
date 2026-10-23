import { queryRows, querySingleValue } from "./localSyncQueryGateway.js";

export async function requireLocalTournamentId(client, tournamentSyncId) {
  const row = await querySingleValue(
    client,
    `SELECT id FROM tournaments WHERE sync_id = $1 LIMIT 1`,
    [tournamentSyncId],
  );
  if (!row?.id) {
    throw new Error(`Tournament sync parent not found: ${String(tournamentSyncId ?? "missing")}`);
  }
  return row.id;
}

export async function requireLocalHandicapTableId(client, tableKey) {
  const row = await querySingleValue(
    client,
    `SELECT id FROM tournament_handicap_tables WHERE table_key = $1 LIMIT 1`,
    [tableKey],
  );
  if (!row?.id) {
    throw new Error(`Tournament handicap table sync parent not found: ${String(tableKey ?? "missing")}`);
  }
  return row.id;
}

export async function upsertTournamentTemplates(client, rows = []) {
  for (const row of rows) {
    await client.query(`
      INSERT INTO tournament_templates (
        template_key, label, description, tournament_type, format, round_type,
        defaults_json, capabilities_json, eligibility_rules_json, created_by,
        created_at_date, created_at_time, created_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($10) LIMIT 1))
      ON CONFLICT (template_key) DO UPDATE SET
        label = EXCLUDED.label, description = EXCLUDED.description,
        tournament_type = EXCLUDED.tournament_type, format = EXCLUDED.format,
        round_type = EXCLUDED.round_type, defaults_json = EXCLUDED.defaults_json,
        capabilities_json = EXCLUDED.capabilities_json,
        eligibility_rules_json = EXCLUDED.eligibility_rules_json,
        created_by = EXCLUDED.created_by, created_at_date = EXCLUDED.created_at_date,
        created_at_time = EXCLUDED.created_at_time,
        created_by_user_id = EXCLUDED.created_by_user_id
    `, [row.template_key, row.label, row.description ?? "", row.tournament_type,
      row.format, row.round_type, row.defaults_json ?? "{}", row.capabilities_json ?? "{}",
      row.eligibility_rules_json ?? null, row.created_by, row.created_at_date, row.created_at_time]);
  }
}

export async function upsertTournamentHandicapTables(client, rows = []) {
  for (const row of rows) {
    await client.query(`
      INSERT INTO tournament_handicap_tables (
        table_key, title, description, allowance_percent, is_editable,
        updated_at_date, updated_at_time, updated_by_username
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (table_key) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description,
        allowance_percent = EXCLUDED.allowance_percent, is_editable = EXCLUDED.is_editable,
        updated_at_date = EXCLUDED.updated_at_date, updated_at_time = EXCLUDED.updated_at_time,
        updated_by_username = EXCLUDED.updated_by_username
    `, [row.table_key, row.title, row.description ?? null, row.allowance_percent ?? null,
      Number(row.is_editable ?? 0), row.updated_at_date ?? null, row.updated_at_time ?? null,
      row.updated_by_username ?? null]);
  }
}

export async function upsertTournamentHandicapTableRows(client, rows = []) {
  for (const row of rows) {
    const tableId = await requireLocalHandicapTableId(client, row.table_key);
    await client.query(`
      INSERT INTO tournament_handicap_table_rows (table_id, handicap_value, reference_score, display_order)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (table_id, handicap_value) DO UPDATE SET
        reference_score = EXCLUDED.reference_score, display_order = EXCLUDED.display_order
    `, [tableId, Number(row.handicap_value), row.reference_score ?? null, Number(row.display_order ?? 0)]);
  }
}

export async function upsertTournaments(client, rows = []) {
  for (const row of rows) {
    await client.query(`
      INSERT INTO tournaments (
        sync_id, sync_is_cloud_managed, name, tournament_type, template_key,
        template_definition_json, draw_date, round_schedule_json,
        registration_start_date, registration_end_date, score_submission_start_date,
        score_submission_end_date, created_by, created_at_date, created_at_time,
        created_by_user_id
      ) VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($12) LIMIT 1))
      ON CONFLICT (sync_id) DO UPDATE SET
        sync_is_cloud_managed = 1, name = EXCLUDED.name,
        tournament_type = EXCLUDED.tournament_type, template_key = EXCLUDED.template_key,
        template_definition_json = EXCLUDED.template_definition_json,
        draw_date = EXCLUDED.draw_date, round_schedule_json = EXCLUDED.round_schedule_json,
        registration_start_date = EXCLUDED.registration_start_date,
        registration_end_date = EXCLUDED.registration_end_date,
        score_submission_start_date = EXCLUDED.score_submission_start_date,
        score_submission_end_date = EXCLUDED.score_submission_end_date,
        created_by = EXCLUDED.created_by, created_at_date = EXCLUDED.created_at_date,
        created_at_time = EXCLUDED.created_at_time,
        created_by_user_id = EXCLUDED.created_by_user_id
    `, [row.sync_id, row.name, row.tournament_type, row.template_key ?? null,
      row.template_definition_json ?? null, row.draw_date ?? null, row.round_schedule_json ?? "[]",
      row.registration_start_date, row.registration_end_date, row.score_submission_start_date,
      row.score_submission_end_date, row.created_by, row.created_at_date, row.created_at_time]);
  }
}

export async function upsertTournamentRegistrations(client, rows = []) {
  for (const row of rows) {
    const tournamentId = await requireLocalTournamentId(client, row.tournament_sync_id);
    await client.query(`
      INSERT INTO tournament_registrations (
        tournament_id, member_username, bow_code, registered_at_date,
        registered_at_time, member_user_id
      ) VALUES ($1,$2,$3,$4,$5,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($2) LIMIT 1))
      ON CONFLICT (tournament_id, member_username) DO UPDATE SET
        bow_code = EXCLUDED.bow_code, registered_at_date = EXCLUDED.registered_at_date,
        registered_at_time = EXCLUDED.registered_at_time,
        member_user_id = EXCLUDED.member_user_id
    `, [tournamentId, row.member_username, row.bow_code ?? null,
      row.registered_at_date, row.registered_at_time]);
  }
}

export async function upsertTournamentRounds(client, rows = []) {
  for (const row of rows) {
    const tournamentId = await requireLocalTournamentId(client, row.tournament_sync_id);
    await client.query(`
      INSERT INTO tournament_rounds (
        tournament_id, round_number, title, publish_date, submission_deadline, status
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (tournament_id, round_number) DO UPDATE SET
        title = EXCLUDED.title, publish_date = EXCLUDED.publish_date,
        submission_deadline = EXCLUDED.submission_deadline, status = EXCLUDED.status
    `, [tournamentId, Number(row.round_number), row.title, row.publish_date ?? null,
      row.submission_deadline ?? null, row.status ?? "scheduled"]);
  }
}

export async function upsertTournamentScores(client, rows = []) {
  for (const row of rows) {
    const tournamentId = await requireLocalTournamentId(client, row.tournament_sync_id);
    await client.query(`
      INSERT INTO tournament_scores (
        tournament_id, round_number, member_username, score,
        submitted_at_date, submitted_at_time, member_user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($3) LIMIT 1))
      ON CONFLICT (tournament_id, round_number, member_username) DO UPDATE SET
        score = EXCLUDED.score, submitted_at_date = EXCLUDED.submitted_at_date,
        submitted_at_time = EXCLUDED.submitted_at_time,
        member_user_id = EXCLUDED.member_user_id
    `, [tournamentId, Number(row.round_number), row.member_username, Number(row.score),
      row.submitted_at_date, row.submitted_at_time]);
  }
}

const tournamentMatchColumns = [
  "round_number", "match_number", "left_member_username", "right_member_username",
  "left_score", "right_score", "winner_username", "submitted_by_username",
  "submitted_at_date", "submitted_at_time", "confirmed_by_username",
  "confirmed_at_date", "confirmed_at_time", "disputed_by_username",
  "disputed_at_date", "disputed_at_time", "dispute_reason",
  "handicap_allowance_percent", "left_handicap_value", "left_handicap_type",
  "left_handicap_bow_class", "left_handicap_discipline", "left_reference_score",
  "left_allowance_points", "left_adjusted_score", "left_handicap_table_key",
  "left_handicap_table_title", "right_handicap_value", "right_handicap_type",
  "right_handicap_bow_class", "right_handicap_discipline", "right_reference_score",
  "right_allowance_points", "right_adjusted_score", "right_handicap_table_key",
  "right_handicap_table_title", "status",
];

export async function upsertTournamentMatches(client, rows = []) {
  const placeholders = tournamentMatchColumns.map((_, index) => `$${index + 2}`).join(",");
  const updates = tournamentMatchColumns.slice(2)
    .map((column) => `${column} = EXCLUDED.${column}`).join(",");
  for (const row of rows) {
    const tournamentId = await requireLocalTournamentId(client, row.tournament_sync_id);
    await client.query(`
      INSERT INTO tournament_matches (tournament_id, ${tournamentMatchColumns.join(",")})
      VALUES ($1,${placeholders})
      ON CONFLICT (tournament_id, round_number, match_number) DO UPDATE SET ${updates}
    `, [tournamentId, ...tournamentMatchColumns.map((column) => row[column] ?? null)]);
  }
}

export function tournamentChildKey(row, kind) {
  const parent = String(row.tournament_sync_id);
  if (kind === "registrations") return `${parent}:${String(row.member_username).toLowerCase()}`;
  if (kind === "rounds") return `${parent}:${Number(row.round_number)}`;
  if (kind === "scores") return `${parent}:${Number(row.round_number)}:${String(row.member_username).toLowerCase()}`;
  return `${parent}:${Number(row.round_number)}:${Number(row.match_number)}`;
}

export async function reconcileTournamentSnapshotDeletes(client, snapshot) {
  const cloudTournamentIds = snapshot.tournaments.map((row) => row.sync_id);
  const unknown = await queryRows(client, `
    SELECT sync_id, name FROM tournaments
    WHERE sync_is_cloud_managed = 0 AND sync_id <> ALL($1::text[])
    ORDER BY id
  `, [cloudTournamentIds]);
  if (unknown.length > 0) {
    throw new Error(
      `Tournament rebaseline refused: ${unknown.length} pre-existing local tournament(s) are not Cloud-managed. Back up and explicitly reconcile them before retrying.`,
    );
  }

  const childConfigs = [
    ["tournament_matches", "matches", snapshot.tournamentMatches],
    ["tournament_scores", "scores", snapshot.tournamentScores],
    ["tournament_rounds", "rounds", snapshot.tournamentRounds],
    ["tournament_registrations", "registrations", snapshot.tournamentRegistrations],
  ];
  for (const [tableName, kind, rows] of childConfigs) {
    const incoming = [...new Set(rows.map((row) => tournamentChildKey(row, kind)))];
    const existing = await queryRows(client, `
      SELECT tournaments.sync_id AS tournament_sync_id, child.*
      FROM ${tableName} AS child
      INNER JOIN tournaments ON tournaments.id = child.tournament_id
      WHERE tournaments.sync_is_cloud_managed = 1
    `);
    for (const row of existing) {
      if (!incoming.includes(tournamentChildKey(row, kind))) {
        const tournamentId = await requireLocalTournamentId(client, row.tournament_sync_id);
        if (kind === "matches") await client.query(`DELETE FROM tournament_matches WHERE tournament_id=$1 AND round_number=$2 AND match_number=$3`, [tournamentId, row.round_number, row.match_number]);
        else if (kind === "scores") await client.query(`DELETE FROM tournament_scores WHERE tournament_id=$1 AND round_number=$2 AND LOWER(member_username)=LOWER($3)`, [tournamentId, row.round_number, row.member_username]);
        else if (kind === "rounds") await client.query(`DELETE FROM tournament_rounds WHERE tournament_id=$1 AND round_number=$2`, [tournamentId, row.round_number]);
        else await client.query(`DELETE FROM tournament_registrations WHERE tournament_id=$1 AND LOWER(member_username)=LOWER($2)`, [tournamentId, row.member_username]);
      }
    }
  }
  await client.query(`DELETE FROM tournaments WHERE sync_is_cloud_managed = 1 AND sync_id <> ALL($1::text[])`, [cloudTournamentIds]);

  const handicapRowKeys = snapshot.tournamentHandicapTableRows.map((row) => `${row.table_key}:${row.handicap_value}`);
  const existingHandicapRows = await queryRows(client, `
    SELECT tables.table_key, rows.handicap_value FROM tournament_handicap_table_rows AS rows
    INNER JOIN tournament_handicap_tables AS tables ON tables.id = rows.table_id
  `);
  for (const row of existingHandicapRows) {
    if (!handicapRowKeys.includes(`${row.table_key}:${row.handicap_value}`)) {
      const tableId = await requireLocalHandicapTableId(client, row.table_key);
      await client.query(`DELETE FROM tournament_handicap_table_rows WHERE table_id=$1 AND handicap_value=$2`, [tableId, row.handicap_value]);
    }
  }
  await client.query(`DELETE FROM tournament_handicap_tables WHERE table_key <> ALL($1::text[])`, [snapshot.tournamentHandicapTables.map((row) => row.table_key)]);
  await client.query(`DELETE FROM tournament_templates WHERE template_key <> ALL($1::text[])`, [snapshot.tournamentTemplates.map((row) => row.template_key)]);
}
