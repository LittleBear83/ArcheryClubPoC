import { normalizeMemberStatusWithFees } from "./memberPersistenceService.js";

const SYNC_STATE_KEY = "local_machine_sync";

function normalizeIncomingUser(user, deactivatedRfidSuffix) {
  const normalized = normalizeMemberStatusWithFees(
    {
      ...user,
      active_member: Number(user.active_member ?? 0),
      affiliate_member: Number(user.affiliate_member ?? 0),
      coaching_volunteer: Number(user.coaching_volunteer ?? 0),
      junior_member: Number(user.junior_member ?? 0),
    },
    {
      deactivatedRfidSuffix,
    },
  );
  const { requiresMembershipStatusSync: _ignored, ...nextUser } = normalized;

  return nextUser;
}

function collapseChanges(changes = []) {
  const latestByKey = new Map();

  for (const change of changes) {
    latestByKey.set(`${change.domain}:${change.recordKey}`, change);
  }

  const upsertOrder = new Map([
    ["roles", 1],
    ["permissions", 2],
    ["role_permissions", 3],
    ["users", 4],
    ["user_types", 5],
    ["user_disciplines", 6],
  ]);
  const deleteOrder = new Map([
    ["user_disciplines", 1],
    ["user_types", 2],
    ["role_permissions", 3],
    ["users", 4],
    ["roles", 5],
    ["permissions", 6],
  ]);

  return [...latestByKey.values()].sort((left, right) => {
    if (left.operation !== right.operation) {
      return left.operation === "upsert" ? -1 : 1;
    }

    const order = left.operation === "upsert" ? upsertOrder : deleteOrder;
    return (order.get(left.domain) ?? 99) - (order.get(right.domain) ?? 99);
  });
}

async function upsertUsers(client, users, deactivatedRfidSuffix) {
  for (const user of users) {
    const normalized = normalizeIncomingUser(user, deactivatedRfidSuffix);

    await client.query(
      `
        INSERT INTO users (
          username,
          first_name,
          surname,
          gr_id,
          archery_gb_membership_number,
          email_address,
          password,
          rfid_tag,
          active_member,
          affiliate_member,
          junior_member,
          membership_fees_due,
          coaching_volunteer,
          membership_status,
          programme_type
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (username) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          surname = EXCLUDED.surname,
          gr_id = EXCLUDED.gr_id,
          archery_gb_membership_number = EXCLUDED.archery_gb_membership_number,
          email_address = EXCLUDED.email_address,
          password = EXCLUDED.password,
          rfid_tag = EXCLUDED.rfid_tag,
          active_member = EXCLUDED.active_member,
          affiliate_member = EXCLUDED.affiliate_member,
          junior_member = EXCLUDED.junior_member,
          membership_fees_due = EXCLUDED.membership_fees_due,
          coaching_volunteer = EXCLUDED.coaching_volunteer,
          membership_status = EXCLUDED.membership_status,
          programme_type = EXCLUDED.programme_type
      `,
      [
        normalized.username,
        normalized.first_name,
        normalized.surname,
        normalized.gr_id ?? null,
        normalized.archery_gb_membership_number ?? null,
        normalized.email_address ?? null,
        normalized.password ?? null,
        normalized.rfid_tag ?? null,
        normalized.active_member,
        normalized.affiliate_member,
        normalized.junior_member,
        normalized.membership_fees_due ?? null,
        normalized.coaching_volunteer,
        normalized.membership_status ?? "member",
        normalized.programme_type ?? "none",
      ],
    );
  }
}

async function replaceRolePermissions(client, rolePermissions) {
  await client.query(`DELETE FROM role_permissions`);

  for (const entry of rolePermissions) {
    await client.query(
      `
        INSERT INTO role_permissions (role_key, permission_key)
        VALUES ($1, $2)
        ON CONFLICT (role_key, permission_key) DO NOTHING
      `,
      [entry.role_key, entry.permission_key],
    );
  }
}

async function replaceUserTypes(client, userTypes) {
  await client.query(`DELETE FROM user_types`);

  for (const entry of userTypes) {
    await client.query(
      `
        INSERT INTO user_types (username, user_type, user_id)
        VALUES (
          $1,
          $2,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
        )
        ON CONFLICT (username) DO UPDATE SET
          user_type = EXCLUDED.user_type,
          user_id = EXCLUDED.user_id
      `,
      [entry.username, entry.user_type],
    );
  }
}

async function replaceUserDisciplines(client, userDisciplines) {
  await client.query(`DELETE FROM user_disciplines`);

  for (const entry of userDisciplines) {
    await client.query(
      `
        INSERT INTO user_disciplines (username, discipline, user_id)
        VALUES (
          $1,
          $2,
          (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
        )
        ON CONFLICT (username, discipline) DO NOTHING
      `,
      [entry.username, entry.discipline],
    );
  }
}

async function tombstoneUser(client, username, rfidTag, deactivatedRfidSuffix) {
  const normalized = normalizeIncomingUser(
    {
      username,
      rfid_tag: rfidTag,
      active_member: 0,
    },
    deactivatedRfidSuffix,
  );

  await client.query(`DELETE FROM user_disciplines WHERE username = $1`, [username]);
  await client.query(`DELETE FROM user_types WHERE username = $1`, [username]);
  await client.query(
    `
      UPDATE users
      SET
        password = NULL,
        rfid_tag = $1,
        active_member = 0,
        membership_status = 'non-member',
        programme_type = 'none'
      WHERE username = $2
    `,
    [normalized.rfid_tag ?? null, username],
  );
}

async function tombstoneMissingUsers(client, incomingUsers, deactivatedRfidSuffix) {
  const incomingUsernames = incomingUsers.map((entry) => entry.username);

  await client.query(
    `
      DELETE FROM user_disciplines
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );
  await client.query(
    `
      DELETE FROM user_types
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );
  const missingUsersResult = await client.query(
    `
      SELECT username, rfid_tag
      FROM users
      WHERE username <> ALL($1::text[])
    `,
    [incomingUsernames],
  );

  for (const user of missingUsersResult.rows) {
    await tombstoneUser(
      client,
      user.username,
      user.rfid_tag,
      deactivatedRfidSuffix,
    );
  }
}

export async function applyAuthSnapshot({
  client,
  deactivatedRfidSuffix,
  snapshot,
}) {
  await upsertUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);

  for (const role of snapshot.roles ?? []) {
    await client.query(
      `
        INSERT INTO roles (role_key, title, is_system)
        VALUES ($1, $2, $3)
        ON CONFLICT (role_key) DO UPDATE SET
          title = EXCLUDED.title,
          is_system = EXCLUDED.is_system
      `,
      [role.role_key, role.title, Number(role.is_system ?? 0)],
    );
  }

  for (const permission of snapshot.permissions ?? []) {
    await client.query(
      `
        INSERT INTO permissions (permission_key, label, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (permission_key) DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description
      `,
      [permission.permission_key, permission.label, permission.description],
    );
  }

  await replaceRolePermissions(client, snapshot.rolePermissions ?? []);
  await replaceUserTypes(client, snapshot.userTypes ?? []);
  await replaceUserDisciplines(client, snapshot.userDisciplines ?? []);

  const roleKeys = (snapshot.roles ?? []).map((entry) => entry.role_key);
  const permissionKeys = (snapshot.permissions ?? []).map((entry) => entry.permission_key);

  await client.query(`DELETE FROM roles WHERE role_key <> ALL($1::text[])`, [roleKeys]);
  await client.query(
    `DELETE FROM permissions WHERE permission_key <> ALL($1::text[])`,
    [permissionKeys],
  );
  await tombstoneMissingUsers(client, snapshot.users ?? [], deactivatedRfidSuffix);
}

async function applyCollapsedChange(client, change, deactivatedRfidSuffix) {
  switch (change.domain) {
    case "users":
      if (change.operation === "delete") {
        await tombstoneUser(
          client,
          change.payload.username,
          change.payload.rfid_tag,
          deactivatedRfidSuffix,
        );
        return;
      }
      await upsertUsers(client, [change.payload], deactivatedRfidSuffix);
      return;
    case "roles":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM role_permissions WHERE role_key = $1`, [change.payload.role_key]);
        await client.query(`DELETE FROM roles WHERE role_key = $1`, [change.payload.role_key]);
        return;
      }
      await client.query(
        `
          INSERT INTO roles (role_key, title, is_system)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_key) DO UPDATE SET
            title = EXCLUDED.title,
            is_system = EXCLUDED.is_system
        `,
        [
          change.payload.role_key,
          change.payload.title,
          Number(change.payload.is_system ?? 0),
        ],
      );
      return;
    case "permissions":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM permissions WHERE permission_key = $1`, [
          change.payload.permission_key,
        ]);
        return;
      }
      await client.query(
        `
          INSERT INTO permissions (permission_key, label, description)
          VALUES ($1, $2, $3)
          ON CONFLICT (permission_key) DO UPDATE SET
            label = EXCLUDED.label,
            description = EXCLUDED.description
        `,
        [
          change.payload.permission_key,
          change.payload.label,
          change.payload.description,
        ],
      );
      return;
    case "role_permissions":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM role_permissions
            WHERE role_key = $1 AND permission_key = $2
          `,
          [change.payload.role_key, change.payload.permission_key],
        );
        return;
      }
      await client.query(
        `
          INSERT INTO role_permissions (role_key, permission_key)
          VALUES ($1, $2)
          ON CONFLICT (role_key, permission_key) DO NOTHING
        `,
        [change.payload.role_key, change.payload.permission_key],
      );
      return;
    case "user_types":
      if (change.operation === "delete") {
        await client.query(`DELETE FROM user_types WHERE username = $1`, [change.payload.username]);
        return;
      }
      await client.query(
        `
          INSERT INTO user_types (username, user_type, user_id)
          VALUES (
            $1,
            $2,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
          ON CONFLICT (username) DO UPDATE SET
            user_type = EXCLUDED.user_type,
            user_id = EXCLUDED.user_id
        `,
        [change.payload.username, change.payload.user_type],
      );
      return;
    case "user_disciplines":
      if (change.operation === "delete") {
        await client.query(
          `
            DELETE FROM user_disciplines
            WHERE username = $1 AND discipline = $2
          `,
          [change.payload.username, change.payload.discipline],
        );
        return;
      }
      await client.query(
        `
          INSERT INTO user_disciplines (username, discipline, user_id)
          VALUES (
            $1,
            $2,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
          ON CONFLICT (username, discipline) DO NOTHING
        `,
        [change.payload.username, change.payload.discipline],
      );
      return;
    default:
      return;
  }
}

export async function applyAuthChanges({
  changes,
  client,
  deactivatedRfidSuffix,
}) {
  for (const change of collapseChanges(changes)) {
    await applyCollapsedChange(client, change, deactivatedRfidSuffix);
  }
}

export async function readSyncStatus({ syncGateway }) {
  const stateEntry = await syncGateway.readLocalState(SYNC_STATE_KEY);
  const pendingOutboxCount = await syncGateway.countPendingOutboxEvents();

  return {
    currentCheckpoint: Number(stateEntry?.state?.currentCheckpoint ?? 0),
    lastAttemptedAt: stateEntry?.state?.lastAttemptedAt ?? null,
    lastError: stateEntry?.state?.lastError ?? null,
    lastSuccessfulAt: stateEntry?.state?.lastSuccessfulAt ?? null,
    pendingOutboxCount,
    syncClientVersion: stateEntry?.state?.syncClientVersion ?? "sync-v1",
    syncServerVersion: stateEntry?.state?.syncServerVersion ?? null,
  };
}

export async function writeSyncAttemptState({
  client,
  syncGateway,
  values,
}) {
  const current = (await syncGateway.readLocalState(SYNC_STATE_KEY, client))?.state ?? {};
  await syncGateway.writeLocalState({
    client,
    state: {
      ...current,
      ...values,
    },
    stateKey: SYNC_STATE_KEY,
  });
}
