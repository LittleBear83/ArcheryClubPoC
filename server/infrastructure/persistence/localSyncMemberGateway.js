import { normalizeIncomingUser } from "../../domain/services/localSyncMemberRules.js";

export async function upsertRoles(client, roles = []) {
  for (const role of roles) {
    await client.query(`
      INSERT INTO roles (role_key, title, is_system) VALUES ($1, $2, $3)
      ON CONFLICT (role_key) DO UPDATE SET title = EXCLUDED.title, is_system = EXCLUDED.is_system
    `, [role.role_key, role.title, Number(role.is_system ?? 0)]);
  }
}

export async function upsertPermissions(client, permissions = []) {
  for (const permission of permissions) {
    await client.query(`
      INSERT INTO permissions (permission_key, label, description) VALUES ($1, $2, $3)
      ON CONFLICT (permission_key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description
    `, [permission.permission_key, permission.label, permission.description]);
  }
}

export async function deleteMissingRolesAndPermissions(client, roles, permissions) {
  await client.query(`DELETE FROM roles WHERE role_key <> ALL($1::text[])`, [roles.map((row) => row.role_key)]);
  await client.query(`DELETE FROM permissions WHERE permission_key <> ALL($1::text[])`, [permissions.map((row) => row.permission_key)]);
}


export async function upsertUsers(client, users, deactivatedRfidSuffix) {
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
          password = COALESCE(EXCLUDED.password, users.password),
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

export async function replaceRolePermissions(client, rolePermissions) {
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

export async function replaceUserTypes(client, userTypes) {
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

export async function replaceUserDisciplines(client, userDisciplines) {
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

export async function tombstoneUser(client, username, rfidTag, deactivatedRfidSuffix) {
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

export async function tombstoneMissingUsers(client, incomingUsers, deactivatedRfidSuffix) {
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
