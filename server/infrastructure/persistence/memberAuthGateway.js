import { randomUUID } from "node:crypto";

function normalizeUserRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    gr_id: row.gr_id ?? null,
    active_member: Number(row.active_member ?? 0),
    affiliate_member: Number(row.affiliate_member ?? 0),
    junior_member: Number(row.junior_member ?? 0),
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
    goldenRecordsId: user.goldenRecordsId ?? user.gr_id ?? null,
    archeryGbMembershipNumber: user.archeryGbMembershipNumber,
    emailAddress: user.emailAddress,
    password: user.password,
    rfidTag: user.rfidTag,
    activeMember: user.activeMember,
    affiliateMember: user.affiliateMember,
    juniorMember: user.juniorMember,
    membershipFeesDue: user.membershipFeesDue,
    coachingVolunteer: user.coachingVolunteer,
    membershipStatus: user.membershipStatus ?? user.membership_status ?? null,
    programmeType: user.programmeType ?? user.programme_type ?? null,
  };
}

function createSqliteMemberAuthGateway({
  findDisciplinesByUsername,
  findRangePresenceExtensionByUsername,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  insertGuestLoginEvent,
  insertLoginEvent,
  listAllUsers,
  upsertRangePresenceExtension,
  updateUserMembershipStatus,
  updateGoldenRecordsId,
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
    async findRangePresenceExtensionByUsername(username) {
      const row = findRangePresenceExtensionByUsername.get(username);

      if (!row) {
        return null;
      }

      return {
        username: row.username,
        active_until_at: `${row.active_until_date}T${row.active_until_time}`,
        updated_by_username: row.updated_by_username,
        updated_at: `${row.updated_at_date}T${row.updated_at_time}`,
      };
    },
    async listAllUsers() {
      return listAllUsers.all().map(normalizeUserRow);
    },
    async recordGuestLoginEvent({
      archeryGbMembershipNumber,
      firstName,
      invitedByName,
      invitedByUsername,
      paymentMethod,
      surname,
      timestampParts,
    }) {
      insertGuestLoginEvent.run(
        firstName,
        surname,
        archeryGbMembershipNumber,
        invitedByUsername,
        invitedByName,
        paymentMethod,
        ...timestampParts,
      );
    },
    async recordLoginEvent({ method, timestampParts, username }) {
      insertLoginEvent.run(username, method, ...timestampParts);
    },
    async upsertRangePresenceExtension({
      activeUntilParts,
      timestampParts,
      updatedByUsername,
      username,
    }) {
      upsertRangePresenceExtension.run(
        username,
        ...activeUntilParts,
        updatedByUsername,
        ...timestampParts,
      );
    },
    async updateUserMembershipStatus(username, activeMember, rfidTag) {
      updateUserMembershipStatus.run(activeMember, rfidTag, username);
    },
    async updateGoldenRecordsId(username, goldenRecordsId) {
      updateGoldenRecordsId.run(goldenRecordsId, username);
    },
    async updateUserPassword(username, passwordHash) {
      updateUserPassword.run(passwordHash, username);
    },
  };
}

function createPostgresMemberAuthGateway({
  pool,
  syncGateway,
  syncMachineId,
  syncNodeMode,
}) {
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
            users.gr_id,
            users.archery_gb_membership_number,
            users.email_address,
            users.password,
            users.rfid_tag,
            users.active_member,
            users.affiliate_member,
            users.junior_member,
            users.membership_fees_due,
            users.coaching_volunteer,
            users.membership_status,
            users.programme_type,
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
            users.gr_id,
            users.archery_gb_membership_number,
            users.email_address,
            users.password,
            users.rfid_tag,
            users.active_member,
            users.affiliate_member,
            users.junior_member,
            users.membership_fees_due,
            users.coaching_volunteer,
            users.membership_status,
            users.programme_type,
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
            users.gr_id,
            users.archery_gb_membership_number,
            users.email_address,
            users.password,
            users.rfid_tag,
            users.active_member,
            users.affiliate_member,
            users.junior_member,
            users.membership_fees_due,
            users.coaching_volunteer,
            users.membership_status,
            users.programme_type,
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
    async findRangePresenceExtensionByUsername(username) {
      const result = await pool.query(
        `
          SELECT
            username,
            active_until_date,
            active_until_time,
            updated_by_username,
            updated_at_date,
            updated_at_time
          FROM range_presence_extensions
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );
      const row = result.rows[0] ?? null;

      if (!row) {
        return null;
      }

      return {
        username: row.username,
        active_until_at: `${row.active_until_date}T${row.active_until_time}`,
        updated_by_username: row.updated_by_username,
        updated_at: `${row.updated_at_date}T${row.updated_at_time}`,
      };
    },
    async listAllUsers() {
      const result = await pool.query(
        `
          SELECT
            users.id,
            users.username,
            users.first_name,
            users.surname,
            users.gr_id,
            users.archery_gb_membership_number,
            users.email_address,
            users.rfid_tag,
            users.active_member,
            users.affiliate_member,
            users.junior_member,
            users.membership_fees_due,
            users.coaching_volunteer,
            users.membership_status,
            users.programme_type,
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
      paymentMethod,
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
            payment_method,
            invited_by_user_id,
            logged_in_date,
            logged_in_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1), $7, $8)
        `,
        [
          firstName,
          surname,
          archeryGbMembershipNumber,
          invitedByUsername,
          invitedByName,
          paymentMethod,
          ...timestampParts,
        ],
      );
    },
    async recordLoginEvent({ method, timestampParts, username }) {
      if (syncGateway && syncNodeMode === "local-pi" && syncMachineId) {
        await syncGateway.enqueueLoginEvent({
          client: pool,
          eventId: randomUUID(),
          loggedInDate: timestampParts[0],
          loggedInTime: timestampParts[1],
          loginMethod: method,
          machineId: syncMachineId,
          sourceNodeMode: syncNodeMode,
          username,
        });
        return;
      }

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
    async upsertRangePresenceExtension({
      activeUntilParts,
      timestampParts,
      updatedByUsername,
      username,
    }) {
      await pool.query(
        `
          INSERT INTO range_presence_extensions (
            username,
            active_until_date,
            active_until_time,
            updated_by_username,
            updated_at_date,
            updated_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (username) DO UPDATE SET
            active_until_date = EXCLUDED.active_until_date,
            active_until_time = EXCLUDED.active_until_time,
            updated_by_username = EXCLUDED.updated_by_username,
            updated_at_date = EXCLUDED.updated_at_date,
            updated_at_time = EXCLUDED.updated_at_time
        `,
        [username, ...activeUntilParts, updatedByUsername, ...timestampParts],
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
    async updateGoldenRecordsId(username, goldenRecordsId) {
      await pool.query(
        `
          UPDATE users
          SET gr_id = $1
          WHERE LOWER(username) = LOWER($2)
        `,
        [goldenRecordsId, username],
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
