function normalizeRoleRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    is_system: Number(row.is_system ?? 0),
  };
}

function normalizeCommitteeRoleRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    display_order: Number(row.display_order ?? 0),
  };
}

function normalizeCountRow(row, key = "count") {
  return {
    [key]: Number(row?.[key] ?? 0),
  };
}

function createSqliteRoleCommitteeGateway({
  countUsersByRoleKey,
  deleteCommitteeRoleById,
  deleteRoleDefinition,
  deleteRolePermissionsByRoleKey,
  findCommitteeRoleById,
  findCommitteeRoleByKey,
  findMaxCommitteeRoleDisplayOrder,
  findRoleDefinitionByKey,
  insertCommitteeRole,
  insertRolePermission,
  listCommitteeRoles,
  listPermissionDefinitions,
  listRoleDefinitions,
  listRolePermissionKeysByRoleKey,
  updateCommitteeRoleDetails,
  updateRoleDefinition,
  upsertRole,
}) {
  return {
    async countUsersByRoleKey(roleKey) {
      return normalizeCountRow(countUsersByRoleKey.get(roleKey));
    },
    async createRole({ permissions, roleKey, title }) {
      upsertRole.run({
        roleKey,
        title,
        isSystem: 0,
      });
      deleteRolePermissionsByRoleKey.run(roleKey);

      for (const permissionKey of permissions) {
        insertRolePermission.run(roleKey, permissionKey);
      }

      return normalizeRoleRow(findRoleDefinitionByKey.get(roleKey));
    },
    async deleteCommitteeRoleById(id) {
      deleteCommitteeRoleById.run(id);
    },
    async deleteRole(roleKey) {
      deleteRolePermissionsByRoleKey.run(roleKey);
      deleteRoleDefinition.run(roleKey);
    },
    async findCommitteeRoleById(id) {
      return normalizeCommitteeRoleRow(findCommitteeRoleById.get(id));
    },
    async findCommitteeRoleByKey(roleKey) {
      return normalizeCommitteeRoleRow(findCommitteeRoleByKey.get(roleKey));
    },
    async findMaxCommitteeRoleDisplayOrder() {
      return normalizeCountRow(findMaxCommitteeRoleDisplayOrder.get(), "maxDisplayOrder");
    },
    async findRoleDefinitionByKey(roleKey) {
      return normalizeRoleRow(findRoleDefinitionByKey.get(roleKey));
    },
    async insertCommitteeRole(payload) {
      insertCommitteeRole.run(payload);
    },
    async listCommitteeRoles() {
      return listCommitteeRoles.all().map(normalizeCommitteeRoleRow);
    },
    async listPermissionDefinitions() {
      return listPermissionDefinitions.all();
    },
    async listRoleDefinitions() {
      return listRoleDefinitions.all().map(normalizeRoleRow);
    },
    async listRolePermissionKeysByRoleKey(roleKey) {
      return listRolePermissionKeysByRoleKey
        .all(roleKey)
        .map((permission) => permission.permission_key);
    },
    async updateCommitteeRoleDetails(payload) {
      updateCommitteeRoleDetails.run(payload);
    },
    async updateRole({ permissions, roleKey, title }) {
      updateRoleDefinition.run(title, roleKey);
      deleteRolePermissionsByRoleKey.run(roleKey);

      for (const permissionKey of permissions) {
        insertRolePermission.run(roleKey, permissionKey);
      }

      return normalizeRoleRow(findRoleDefinitionByKey.get(roleKey));
    },
  };
}

function createPostgresRoleCommitteeGateway({ pool }) {
  return {
    async countUsersByRoleKey(roleKey) {
      const result = await pool.query(
        `
          SELECT COUNT(*) AS count
          FROM user_types
          WHERE user_type = $1
        `,
        [roleKey],
      );

      return normalizeCountRow(result.rows[0]);
    },
    async createRole({ permissions, roleKey, title }) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            INSERT INTO roles (role_key, title, is_system)
            VALUES ($1, $2, 0)
            ON CONFLICT(role_key) DO UPDATE SET
              title = EXCLUDED.title,
              is_system = GREATEST(roles.is_system, EXCLUDED.is_system)
          `,
          [roleKey, title],
        );
        await client.query(
          `
            DELETE FROM role_permissions
            WHERE role_key = $1
          `,
          [roleKey],
        );

        for (const permissionKey of permissions) {
          await client.query(
            `
              INSERT INTO role_permissions (role_key, permission_key)
              VALUES ($1, $2)
              ON CONFLICT(role_key, permission_key) DO NOTHING
            `,
            [roleKey, permissionKey],
          );
        }

        const roleResult = await client.query(
          `
            SELECT role_key, title, is_system
            FROM roles
            WHERE role_key = $1
            LIMIT 1
          `,
          [roleKey],
        );
        await client.query("COMMIT");

        return normalizeRoleRow(roleResult.rows[0] ?? null);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async deleteCommitteeRoleById(id) {
      await pool.query(
        `
          DELETE FROM committee_roles
          WHERE id = $1
        `,
        [id],
      );
    },
    async deleteRole(roleKey) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            DELETE FROM role_permissions
            WHERE role_key = $1
          `,
          [roleKey],
        );
        await client.query(
          `
            DELETE FROM roles
            WHERE role_key = $1
          `,
          [roleKey],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async findCommitteeRoleById(id) {
      const result = await pool.query(
        `
          SELECT
            id,
            role_key,
            title,
            summary,
            responsibilities,
            personal_blurb,
            photo_data_url,
            display_order,
            assigned_username
          FROM committee_roles
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeCommitteeRoleRow(result.rows[0] ?? null);
    },
    async findCommitteeRoleByKey(roleKey) {
      const result = await pool.query(
        `
          SELECT
            id,
            role_key,
            title
          FROM committee_roles
          WHERE role_key = $1
          LIMIT 1
        `,
        [roleKey],
      );

      return normalizeCommitteeRoleRow(result.rows[0] ?? null);
    },
    async findMaxCommitteeRoleDisplayOrder() {
      const result = await pool.query(
        `
          SELECT COALESCE(MAX(display_order), 0) AS "maxDisplayOrder"
          FROM committee_roles
        `,
      );

      return normalizeCountRow(result.rows[0], "maxDisplayOrder");
    },
    async findRoleDefinitionByKey(roleKey) {
      const result = await pool.query(
        `
          SELECT role_key, title, is_system
          FROM roles
          WHERE role_key = $1
          LIMIT 1
        `,
        [roleKey],
      );

      return normalizeRoleRow(result.rows[0] ?? null);
    },
    async insertCommitteeRole(payload) {
      await pool.query(
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
        `,
        [
          payload.roleKey,
          payload.title,
          payload.summary,
          payload.responsibilities,
          payload.personalBlurb,
          payload.photoDataUrl,
          payload.displayOrder,
          payload.assignedUsername,
        ],
      );
    },
    async listCommitteeRoles() {
      const result = await pool.query(
        `
          SELECT
            committee_roles.id,
            committee_roles.role_key,
            committee_roles.title,
            committee_roles.summary,
            committee_roles.responsibilities,
            committee_roles.personal_blurb,
            committee_roles.photo_data_url,
            committee_roles.display_order,
            committee_roles.assigned_username,
            users.first_name AS assigned_first_name,
            users.surname AS assigned_surname,
            user_types.user_type AS assigned_user_type
          FROM committee_roles
          LEFT JOIN users ON users.username = committee_roles.assigned_username
          LEFT JOIN user_types ON user_types.user_id = users.id
          ORDER BY committee_roles.display_order ASC, committee_roles.title ASC
        `,
      );

      return result.rows.map(normalizeCommitteeRoleRow);
    },
    async listPermissionDefinitions() {
      const result = await pool.query(
        `
          SELECT
            permission_key,
            label,
            description
          FROM permissions
          ORDER BY label ASC, permission_key ASC
        `,
      );

      return result.rows;
    },
    async listRoleDefinitions() {
      const result = await pool.query(
        `
          SELECT role_key, title, is_system
          FROM roles
          ORDER BY is_system DESC, title ASC, role_key ASC
        `,
      );

      return result.rows.map(normalizeRoleRow);
    },
    async listRolePermissionKeysByRoleKey(roleKey) {
      const result = await pool.query(
        `
          SELECT permission_key
          FROM role_permissions
          WHERE role_key = $1
          ORDER BY permission_key ASC
        `,
        [roleKey],
      );

      return result.rows.map((permission) => permission.permission_key);
    },
    async updateCommitteeRoleDetails(payload) {
      await pool.query(
        `
          UPDATE committee_roles
          SET
            title = $1,
            summary = $2,
            responsibilities = $3,
            personal_blurb = $4,
            photo_data_url = $5,
            assigned_username = $6
          WHERE id = $7
        `,
        [
          payload.title,
          payload.summary,
          payload.responsibilities,
          payload.personalBlurb,
          payload.photoDataUrl,
          payload.assignedUsername,
          payload.id,
        ],
      );
    },
    async updateRole({ permissions, roleKey, title }) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            UPDATE roles
            SET title = $1
            WHERE role_key = $2
          `,
          [title, roleKey],
        );
        await client.query(
          `
            DELETE FROM role_permissions
            WHERE role_key = $1
          `,
          [roleKey],
        );

        for (const permissionKey of permissions) {
          await client.query(
            `
              INSERT INTO role_permissions (role_key, permission_key)
              VALUES ($1, $2)
              ON CONFLICT(role_key, permission_key) DO NOTHING
            `,
            [roleKey, permissionKey],
          );
        }

        const roleResult = await client.query(
          `
            SELECT role_key, title, is_system
            FROM roles
            WHERE role_key = $1
            LIMIT 1
          `,
          [roleKey],
        );
        await client.query("COMMIT");

        return normalizeRoleRow(roleResult.rows[0] ?? null);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createRoleCommitteeGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresRoleCommitteeGateway(options);
  }

  return createSqliteRoleCommitteeGateway(options);
}
