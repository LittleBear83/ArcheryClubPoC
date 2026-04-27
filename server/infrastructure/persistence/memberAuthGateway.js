function normalizeUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    active_member: Number(row.active_member ?? 0),
    coaching_volunteer: Number(row.coaching_volunteer ?? 0),
  };
}

function normalizeDisciplineRows(rows) {
  return rows.map((row) => ({
    discipline: row.discipline,
  }));
}

function mapUserPayloadToSqliteProfile(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    firstName: user.firstName,
    surname: user.surname,
    password: user.password,
    rfidTag: user.rfidTag,
    activeMember: user.activeMember,
    membershipFeesDue: user.membershipFeesDue,
    coachingVolunteer: user.coachingVolunteer,
  };
}

function createSqliteMemberAuthGateway({
  findDisciplinesByUsername,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  insertGuestLoginEvent,
  insertLoginEvent,
  listAllUsers,
  updateUserMembershipStatus,
  updateUserPassword,
}) {
  return {
    async findDisciplinesByUsername(username) {
      return normalizeDisciplineRows(findDisciplinesByUsername.all(username));
    },
    async findUserByCredentials(username) {
      return normalizeUserRow(findUserByCredentials.get(username));
    },
    async findUserByRfid(rfidTag) {
      return normalizeUserRow(findUserByRfid.get(rfidTag));
    },
    async findUserByUsername(username) {
      return normalizeUserRow(findUserByUsername.get(username));
    },
    async listAllUsers() {
      return listAllUsers.all().map(normalizeUserRow);
    },
    async recordGuestLoginEvent({
      archeryGbMembershipNumber,
      firstName,
      invitedByName,
      invitedByUsername,
      surname,
      timestampParts,
    }) {
      insertGuestLoginEvent.run(
        firstName,
        surname,
        archeryGbMembershipNumber,
        invitedByUsername,
        invitedByName,
        ...timestampParts,
      );
    },
    async recordLoginEvent({ method, timestampParts, username }) {
      insertLoginEvent.run(username, method, ...timestampParts);
    },
    async updateUserMembershipStatus(username, activeMember, rfidTag) {
      updateUserMembershipStatus.run(activeMember, rfidTag, username);
    },
    async updateUserPassword(username, passwordHash) {
      updateUserPassword.run(passwordHash, username);
    },
  };
}

function createPostgresMemberAuthGateway({ pool }) {
  return {
    async findDisciplinesByUsername(username) {
      const result = await pool.query(
        `
          SELECT discipline
          FROM user_disciplines
          WHERE username = $1
          ORDER BY discipline ASC
        `,
        [username],
      );

      return normalizeDisciplineRows(result.rows);
    },
    async findUserByCredentials(username) {
      const result = await pool.query(
        `
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
          WHERE LOWER(users.username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );

      return normalizeUserRow(result.rows[0] ?? null);
    },
    async findUserByRfid(rfidTag) {
      const result = await pool.query(
        `
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
          WHERE users.rfid_tag = $1
          LIMIT 1
        `,
        [rfidTag],
      );

      return normalizeUserRow(result.rows[0] ?? null);
    },
    async findUserByUsername(username) {
      const result = await pool.query(
        `
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
          WHERE LOWER(users.username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );

      return normalizeUserRow(result.rows[0] ?? null);
    },
    async listAllUsers() {
      const result = await pool.query(
        `
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
        `,
      );

      return result.rows.map(normalizeUserRow);
    },
    async recordGuestLoginEvent({
      archeryGbMembershipNumber,
      firstName,
      invitedByName,
      invitedByUsername,
      surname,
      timestampParts,
    }) {
      await pool.query(
        `
          INSERT INTO guest_login_events (
            first_name,
            surname,
            archery_gb_membership_number,
            invited_by_username,
            invited_by_name,
            invited_by_user_id,
            logged_in_date,
            logged_in_time
          )
          VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1), $6, $7)
        `,
        [
          firstName,
          surname,
          archeryGbMembershipNumber,
          invitedByUsername,
          invitedByName,
          ...timestampParts,
        ],
      );
    },
    async recordLoginEvent({ method, timestampParts, username }) {
      await pool.query(
        `
          INSERT INTO login_events (
            username,
            user_id,
            login_method,
            logged_in_date,
            logged_in_time
          )
          VALUES ($1, (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1), $2, $3, $4)
        `,
        [username, method, ...timestampParts],
      );
    },
    async updateUserMembershipStatus(username, activeMember, rfidTag) {
      await pool.query(
        `
          UPDATE users
          SET
            active_member = $1,
            rfid_tag = $2
          WHERE LOWER(username) = LOWER($3)
        `,
        [activeMember, rfidTag, username],
      );
    },
    async updateUserPassword(username, passwordHash) {
      await pool.query(
        `
          UPDATE users
          SET password = $1
          WHERE LOWER(username) = LOWER($2)
        `,
        [passwordHash, username],
      );
    },
  };
}

export function createMemberAuthGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresMemberAuthGateway(options);
  }

  return createSqliteMemberAuthGateway(options);
}

export function mapMemberProfileToGatewayPayload(user) {
  return mapUserPayloadToSqliteProfile(user);
}
