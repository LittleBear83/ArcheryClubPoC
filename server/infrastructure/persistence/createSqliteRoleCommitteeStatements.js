export function createSqliteRoleCommitteeStatements(db) {
  const upsertRole = db.prepare(`
    INSERT INTO roles (role_key, title, is_system)
    VALUES (@roleKey, @title, @isSystem)
    ON CONFLICT(role_key) DO UPDATE SET
      title = excluded.title,
      is_system = MAX(roles.is_system, excluded.is_system)
  `);

  const insertRolePermission = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
    VALUES (?, ?)
  `);

  const listRoleDefinitions = db.prepare(`
    SELECT
      role_key,
      title,
      is_system
    FROM roles
    ORDER BY is_system DESC, title ASC, role_key ASC
  `);

  const findRoleDefinitionByKey = db.prepare(`
    SELECT
      role_key,
      title,
      is_system
    FROM roles
    WHERE role_key = ?
  `);

  const listPermissionDefinitions = db.prepare(`
    SELECT
      permission_key,
      label,
      description
    FROM permissions
    ORDER BY label ASC, permission_key ASC
  `);

  const listRolePermissionKeysByRoleKey = db.prepare(`
    SELECT
      permission_key
    FROM role_permissions
    WHERE role_key = ?
    ORDER BY permission_key ASC
  `);

  const deleteRolePermissionsByRoleKey = db.prepare(`
    DELETE FROM role_permissions
    WHERE role_key = ?
  `);

  const updateRoleDefinition = db.prepare(`
    UPDATE roles
    SET title = ?
    WHERE role_key = ?
  `);

  const deleteRoleDefinition = db.prepare(`
    DELETE FROM roles
    WHERE role_key = ?
  `);

  const countUsersByRoleKey = db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_types
    WHERE user_type = ?
  `);

  const listCommitteeRoles = db.prepare(`
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
  `);

  const findCommitteeRoleById = db.prepare(`
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
    WHERE id = ?
  `);

  const findCommitteeRoleByKey = db.prepare(`
    SELECT
      id,
      role_key,
      title
    FROM committee_roles
    WHERE role_key = ?
  `);

  const updateCommitteeRoleDetails = db.prepare(`
    UPDATE committee_roles
    SET
      title = @title,
      summary = @summary,
      responsibilities = @responsibilities,
      personal_blurb = @personalBlurb,
      photo_data_url = @photoDataUrl,
      assigned_username = @assignedUsername
    WHERE id = @id
  `);

  const insertCommitteeRole = db.prepare(`
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
    VALUES (
      @roleKey,
      @title,
      @summary,
      @responsibilities,
      @personalBlurb,
      @photoDataUrl,
      @displayOrder,
      @assignedUsername
    )
  `);

  const deleteCommitteeRoleById = db.prepare(`
    DELETE FROM committee_roles
    WHERE id = ?
  `);

  const findMaxCommitteeRoleDisplayOrder = db.prepare(`
    SELECT COALESCE(MAX(display_order), 0) AS maxDisplayOrder
    FROM committee_roles
  `);

  return {
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
  };
}
