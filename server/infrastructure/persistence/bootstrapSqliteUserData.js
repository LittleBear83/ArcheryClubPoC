import { getSeedUsers } from "./seedUsers.js";

export function bootstrapSqliteUserData({
  committeeRoleSeed,
  db,
  hashPassword,
  isLive,
  isPasswordHash,
}) {
  const seedUsers = getSeedUsers({ hashPassword, isLive });

  const upsertUser = db.prepare(`
    INSERT INTO users (
      username,
      first_name,
      surname,
      password,
      rfid_tag,
      active_member,
      membership_fees_due,
      coaching_volunteer
    )
    VALUES (
      @username,
      @firstName,
      @surname,
      @password,
      @rfidTag,
      @activeMember,
      @membershipFeesDue,
      @coachingVolunteer
    )
    ON CONFLICT(username) DO UPDATE SET
      first_name = excluded.first_name,
      surname = excluded.surname,
      password = excluded.password,
      rfid_tag = excluded.rfid_tag,
      active_member = excluded.active_member,
      membership_fees_due = excluded.membership_fees_due,
      coaching_volunteer = excluded.coaching_volunteer
  `);

  const updateUserMembershipStatus = db.prepare(`
    UPDATE users
    SET
      active_member = ?,
      rfid_tag = ?
    WHERE username = ?
  `);

  const upsertUserType = db.prepare(`
    INSERT INTO user_types (username, user_type)
    VALUES (@username, @userType)
    ON CONFLICT(username) DO UPDATE SET
      user_type = excluded.user_type
  `);

  const deleteUserDisciplines = db.prepare(`
    DELETE FROM user_disciplines
    WHERE username = ?
  `);

  const insertUserDiscipline = db.prepare(`
    INSERT OR IGNORE INTO user_disciplines (username, discipline)
    VALUES (?, ?)
  `);

  const upsertCommitteeRole = db.prepare(`
    INSERT OR IGNORE INTO committee_roles (
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
      NULL
    )
  `);

  const existingCommitteeRoleCount = db
    .prepare(`SELECT COUNT(*) AS count FROM committee_roles`)
    .get().count;

  const existingUserCount = db
    .prepare(`SELECT COUNT(*) AS count FROM users`)
    .get().count;

  if (existingUserCount === 0) {
    for (const user of seedUsers) {
      upsertUser.run({
        ...user,
        activeMember: user.activeMember ? 1 : 0,
        coachingVolunteer: user.coachingVolunteer ? 1 : 0,
      });
      upsertUserType.run(user);
      deleteUserDisciplines.run(user.username);

      for (const discipline of user.disciplines) {
        insertUserDiscipline.run(user.username, discipline);
      }
    }
  }

  if (existingCommitteeRoleCount === 0) {
    for (const role of committeeRoleSeed) {
      upsertCommitteeRole.run({
        ...role,
        responsibilities: role.responsibilities ?? role.summary,
        personalBlurb: role.personalBlurb ?? "",
        photoDataUrl: role.photoDataUrl ?? null,
      });
    }
  }

  const findUserByCredentials = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.first_name,
      users.surname,
      users.password,
      users.rfid_tag,
      users.active_member,
      users.membership_fees_due,
      users.coaching_volunteer,
      user_types.user_type
    FROM users
    INNER JOIN user_types ON user_types.user_id = users.id
    WHERE users.username = ? COLLATE NOCASE
  `);

  const updateUserPassword = db.prepare(`
    UPDATE users
    SET password = ?
    WHERE username = ?
  `);

  const migrateLegacyPlaintextPasswords = db.transaction(() => {
    const usersWithPasswords = db
      .prepare(`
        SELECT username, password
        FROM users
        WHERE password IS NOT NULL AND password <> ''
      `)
      .all();

    for (const user of usersWithPasswords) {
      if (!isPasswordHash(user.password)) {
        updateUserPassword.run(hashPassword(user.password), user.username);
      }
    }
  });

  migrateLegacyPlaintextPasswords();

  const findUserByRfid = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.first_name,
      users.surname,
      users.rfid_tag,
      users.active_member,
      users.membership_fees_due,
      users.coaching_volunteer,
      user_types.user_type
    FROM users
    INNER JOIN user_types ON user_types.user_id = users.id
    WHERE users.rfid_tag = ?
  `);

  const findUserByUsername = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.first_name,
      users.surname,
      users.password,
      users.rfid_tag,
      users.active_member,
      users.membership_fees_due,
      users.coaching_volunteer,
      user_types.user_type
    FROM users
    INNER JOIN user_types ON user_types.user_id = users.id
    WHERE users.username = ? COLLATE NOCASE
  `);

  const listAllUsers = db.prepare(`
    SELECT
      users.id,
      users.username,
      users.first_name,
      users.surname,
      users.rfid_tag,
      users.active_member,
      users.membership_fees_due,
      users.coaching_volunteer,
      user_types.user_type
    FROM users
    INNER JOIN user_types ON user_types.user_id = users.id
    ORDER BY users.surname ASC, users.first_name ASC
  `);

  return {
    deleteUserDisciplines,
    findUserByCredentials,
    findUserByRfid,
    findUserByUsername,
    insertUserDiscipline,
    listAllUsers,
    updateUserMembershipStatus,
    updateUserPassword,
    upsertUser,
    upsertUserType,
  };
}
