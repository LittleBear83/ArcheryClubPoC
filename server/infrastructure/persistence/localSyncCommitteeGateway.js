import { queryRows } from "./localSyncQueryGateway.js";

export function memberDistanceSignOffKey(row) {
  return [
    String(row.username ?? "").trim().toLowerCase(),
    String(row.discipline ?? "").trim().toLowerCase(),
    Number(row.distance_yards ?? 0),
  ].join("\u0001");
}

export async function upsertMemberDistanceSignOffRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO member_distance_sign_offs (
          username,
          discipline,
          distance_yards,
          signed_off_by_username,
          source,
          signed_off_at_date,
          signed_off_at_time,
          user_id,
          signed_off_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
          (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1)
        )
        ON CONFLICT (username, discipline, distance_yards) DO UPDATE SET
          signed_off_by_username = EXCLUDED.signed_off_by_username,
          source = EXCLUDED.source,
          signed_off_at_date = EXCLUDED.signed_off_at_date,
          signed_off_at_time = EXCLUDED.signed_off_at_time,
          user_id = EXCLUDED.user_id,
          signed_off_by_user_id = EXCLUDED.signed_off_by_user_id
      `,
      [
        row.username,
        row.discipline,
        Number(row.distance_yards),
        row.signed_off_by_username,
        row.source ?? "manual",
        row.signed_off_at_date,
        row.signed_off_at_time,
      ],
    );
  }
}

export async function deleteMissingMemberDistanceSignOffRows(client, rows = []) {
  const incomingKeys = new Set(rows.map(memberDistanceSignOffKey));
  const currentRows = await queryRows(
    client,
    `
      SELECT username, discipline, distance_yards
      FROM member_distance_sign_offs
    `,
  );

  for (const row of currentRows) {
    if (incomingKeys.has(memberDistanceSignOffKey(row))) {
      continue;
    }

    await client.query(
      `
        DELETE FROM member_distance_sign_offs
        WHERE LOWER(username) = LOWER($1)
          AND LOWER(discipline) = LOWER($2)
          AND distance_yards = $3
      `,
      [row.username, row.discipline, Number(row.distance_yards)],
    );
  }
}

export async function upsertCommitteeRoleRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO committee_roles (
          role_key,
          title,
          summary,
          responsibilities,
          personal_blurb,
          photo_data_url,
          display_order,
          assigned_username
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (role_key) DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          responsibilities = EXCLUDED.responsibilities,
          personal_blurb = EXCLUDED.personal_blurb,
          photo_data_url = EXCLUDED.photo_data_url,
          display_order = EXCLUDED.display_order,
          assigned_username = EXCLUDED.assigned_username
      `,
      [
        row.role_key,
        row.title,
        row.summary,
        row.responsibilities,
        row.personal_blurb,
        row.photo_data_url,
        Number(row.display_order ?? 0),
        row.assigned_username ?? null,
      ],
    );
  }
}

export async function upsertCommitteeMeetingMinuteRows(client, rows = []) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO committee_meeting_minutes (
          sync_id,
          meeting_date,
          title,
          sections_json,
          actions_json,
          created_at_date,
          created_at_time,
          updated_at_date,
          updated_at_time,
          updated_by_username,
          updated_by_user_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5::jsonb,
          $6,
          $7,
          $8,
          $9,
          $10,
          (
            SELECT id
            FROM users
            WHERE LOWER(username) = LOWER($10)
            LIMIT 1
          )
        )
        ON CONFLICT (sync_id) DO UPDATE SET
          meeting_date = EXCLUDED.meeting_date,
          title = EXCLUDED.title,
          sections_json = EXCLUDED.sections_json,
          actions_json = EXCLUDED.actions_json,
          created_at_date = EXCLUDED.created_at_date,
          created_at_time = EXCLUDED.created_at_time,
          updated_at_date = EXCLUDED.updated_at_date,
          updated_at_time = EXCLUDED.updated_at_time,
          updated_by_username = EXCLUDED.updated_by_username,
          updated_by_user_id = EXCLUDED.updated_by_user_id
      `,
      [
        row.sync_id,
        row.meeting_date,
        row.title,
        JSON.stringify(row.sections_json ?? []),
        JSON.stringify(row.actions_json ?? []),
        row.created_at_date,
        row.created_at_time,
        row.updated_at_date,
        row.updated_at_time,
        row.updated_by_username ?? null,
      ],
    );
  }
}
