import { queryRows, querySingleValue } from "./localSyncQueryGateway.js";

export async function mergeLoginEventHistoryRow(client, row) {
  const existing = await querySingleValue(
    client,
    `
      SELECT id
      FROM login_events
      WHERE sync_event_id = $1
      LIMIT 1
    `,
    [row.sync_event_id],
  );

  if (existing) {
    return;
  }

  await client.query(
    `
      INSERT INTO login_events (
        username,
        user_id,
        login_method,
        logged_in_date,
        logged_in_time,
        sync_event_id,
        sync_source_machine_id,
        sync_identity_origin
      )
      VALUES (
        $1,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1),
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      ON CONFLICT (sync_event_id) DO NOTHING
    `,
    [
      row.username,
      row.login_method,
      row.logged_in_date,
      row.logged_in_time,
      row.sync_event_id,
      row.sync_source_machine_id ?? null,
      row.sync_identity_origin ?? "native",
    ],
  );
}

export async function mergeGuestLoginEventHistoryRow(client, row) {
  const existing = await querySingleValue(
    client,
    `
      SELECT id
      FROM guest_login_events
      WHERE sync_event_id = $1
      LIMIT 1
    `,
    [row.sync_event_id],
  );

  if (existing) {
    return;
  }

  await client.query(
    `
      INSERT INTO guest_login_events (
        first_name,
        surname,
        archery_gb_membership_number,
        invited_by_username,
        invited_by_name,
        payment_method,
        invited_by_user_id,
        logged_in_date,
        logged_in_time,
        sync_event_id,
        sync_source_machine_id,
        sync_identity_origin
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1),
        $7,
        $8,
        $9,
        $10,
        $11
      )
      ON CONFLICT (sync_event_id) DO NOTHING
    `,
    [
      row.first_name,
      row.surname,
      row.archery_gb_membership_number,
      row.invited_by_username ?? null,
      row.invited_by_name ?? null,
      row.payment_method,
      row.logged_in_date,
      row.logged_in_time,
      row.sync_event_id,
      row.sync_source_machine_id ?? null,
      row.sync_identity_origin ?? "native",
    ],
  );
}

export function loginLegacyMatchKey(row) {
  return [
    String(row.username ?? "").trim().toLowerCase(),
    String(row.login_method ?? ""),
    String(row.logged_in_date ?? ""),
    String(row.logged_in_time ?? ""),
    String(row.sync_source_machine_id ?? ""),
  ].join("\u0001");
}

export function guestLegacyMatchKey(row) {
  return [
    String(row.first_name ?? "").trim().toLowerCase(),
    String(row.surname ?? "").trim().toLowerCase(),
    String(row.archery_gb_membership_number ?? "").trim().toLowerCase(),
    String(row.invited_by_username ?? "").trim().toLowerCase(),
    String(row.invited_by_name ?? "").trim().toLowerCase(),
    String(row.payment_method ?? ""),
    String(row.logged_in_date ?? ""),
    String(row.logged_in_time ?? ""),
    String(row.sync_source_machine_id ?? ""),
  ].join("\u0001");
}

export function groupRowsBy(rows, getKey) {
  const groups = new Map();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

export async function queueLegacyHistoryConsolidation(client, kind, row) {
  const payload = kind === "login"
    ? {
      eventId: row.sync_event_id,
      loggedInDate: row.logged_in_date,
      loggedInTime: row.logged_in_time,
      loginMethod: row.login_method,
      username: row.username,
    }
    : {
      archeryGbMembershipNumber: row.archery_gb_membership_number,
      eventId: row.sync_event_id,
      firstName: row.first_name,
      invitedByName: row.invited_by_name,
      invitedByUsername: row.invited_by_username,
      loggedInDate: row.logged_in_date,
      loggedInTime: row.logged_in_time,
      paymentMethod: row.payment_method,
      surname: row.surname,
    };

  await client.query(
    `
      INSERT INTO sync_local_outbox (event_id, event_type, aggregate_key, payload_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (event_id) DO NOTHING
    `,
    [
      row.sync_event_id,
      kind === "login" ? "login_event" : "guest_login_event",
      kind === "login" ? String(row.username).toLowerCase() : "legacy-guest-history",
      JSON.stringify(payload),
    ],
  );
}

export async function reconcileLegacyHistorySnapshot(client, kind, cloudRows) {
  const config = kind === "login"
    ? {
      getKey: loginLegacyMatchKey,
      merge: mergeLoginEventHistoryRow,
      tableName: "login_events",
      whereSql: `
        LOWER(username) = LOWER($1) AND login_method = $2 AND logged_in_date = $3
        AND logged_in_time = $4 AND COALESCE(sync_source_machine_id, '') = COALESCE($5, '')
      `,
      values: (row) => [row.username, row.login_method, row.logged_in_date, row.logged_in_time, row.sync_source_machine_id ?? ""],
    }
    : {
      getKey: guestLegacyMatchKey,
      merge: mergeGuestLoginEventHistoryRow,
      tableName: "guest_login_events",
      whereSql: `
        LOWER(first_name) = LOWER($1) AND LOWER(surname) = LOWER($2)
        AND LOWER(archery_gb_membership_number) = LOWER($3)
        AND LOWER(COALESCE(invited_by_username, '')) = LOWER(COALESCE($4, ''))
        AND LOWER(COALESCE(invited_by_name, '')) = LOWER(COALESCE($5, ''))
        AND payment_method = $6 AND logged_in_date = $7 AND logged_in_time = $8
        AND COALESCE(sync_source_machine_id, '') = COALESCE($9, '')
      `,
      values: (row) => [row.first_name, row.surname, row.archery_gb_membership_number, row.invited_by_username ?? "", row.invited_by_name ?? "", row.payment_method, row.logged_in_date, row.logged_in_time, row.sync_source_machine_id ?? ""],
    };
  const groups = groupRowsBy(cloudRows, config.getKey);

  for (const cloudGroup of groups.values()) {
    const localRows = await queryRows(
      client,
      `SELECT id, sync_event_id, sync_identity_origin, * FROM ${config.tableName} WHERE ${config.whereSql} ORDER BY id ASC`,
      config.values(cloudGroup[0]),
    );
    const cloudIds = new Set(cloudGroup.map((row) => row.sync_event_id));
    const localById = new Map(localRows.map((row) => [row.sync_event_id, row]));
    const cloudUnmatched = cloudGroup.filter((row) => !localById.has(row.sync_event_id));
    const localUnmatched = localRows.filter((row) =>
      row.sync_identity_origin === "legacy" && !cloudIds.has(row.sync_event_id),
    );
    const pairCount = Math.min(
      cloudUnmatched.filter((row) => row.sync_identity_origin === "legacy").length,
      localUnmatched.length,
    );
    let paired = 0;

    for (const cloudRow of cloudUnmatched) {
      if (cloudRow.sync_identity_origin === "legacy" && paired < pairCount) {
        const localRow = localUnmatched[paired++];
        await client.query(
          `UPDATE ${config.tableName} SET sync_event_id = $1 WHERE id = $2`,
          [cloudRow.sync_event_id, localRow.id],
        );
      } else {
        await config.merge(client, cloudRow);
      }
    }

    for (const localRow of localUnmatched.slice(paired)) {
      await queueLegacyHistoryConsolidation(client, kind, localRow);
    }
  }

  const legacyLocalRows = await queryRows(
    client,
    `SELECT * FROM ${config.tableName} WHERE sync_identity_origin = 'legacy' ORDER BY id ASC`,
  );
  for (const localRow of legacyLocalRows) {
    if (!groups.has(config.getKey(localRow))) {
      await queueLegacyHistoryConsolidation(client, kind, localRow);
    }
  }
}
