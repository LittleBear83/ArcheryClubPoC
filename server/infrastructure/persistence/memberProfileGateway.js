function normalizeLoanBowRow(row) {
  if (!row) {
    return null;
  }

  const numericKeys = [
    "has_loan_bow",
    "arrow_count",
    "returned_riser",
    "returned_limbs",
    "returned_arrows",
    "quiver",
    "returned_quiver",
    "finger_tab",
    "returned_finger_tab",
    "string_item",
    "returned_string_item",
    "arm_guard",
    "returned_arm_guard",
    "chest_guard",
    "returned_chest_guard",
    "sight",
    "returned_sight",
    "long_rod",
    "returned_long_rod",
    "pressure_button",
    "returned_pressure_button",
  ];

  const normalizedRow = { ...row };

  for (const key of numericKeys) {
    normalizedRow[key] = Number(normalizedRow[key] ?? 0);
  }

  return normalizedRow;
}

function buildLoanBowSqlPayload(username, loanBow) {
  return {
    username,
    hasLoanBow: loanBow.hasLoanBow ? 1 : 0,
    dateLoaned: loanBow.hasLoanBow ? loanBow.dateLoaned : null,
    returnedDate: loanBow.hasLoanBow ? loanBow.returnedDate || null : null,
    riserNumber: loanBow.hasLoanBow ? loanBow.riserNumber || null : null,
    limbsNumber: loanBow.hasLoanBow ? loanBow.limbsNumber || null : null,
    arrowCount: loanBow.arrowCount,
    returnedRiser: loanBow.returnedRiser ? 1 : 0,
    returnedLimbs: loanBow.returnedLimbs ? 1 : 0,
    returnedArrows: loanBow.returnedArrows ? 1 : 0,
    quiver: loanBow.quiver ? 1 : 0,
    returnedQuiver: loanBow.returnedQuiver ? 1 : 0,
    fingerTab: loanBow.fingerTab ? 1 : 0,
    returnedFingerTab: loanBow.returnedFingerTab ? 1 : 0,
    stringItem: loanBow.string ? 1 : 0,
    returnedStringItem: loanBow.returnedString ? 1 : 0,
    armGuard: loanBow.armGuard ? 1 : 0,
    returnedArmGuard: loanBow.returnedArmGuard ? 1 : 0,
    chestGuard: loanBow.chestGuard ? 1 : 0,
    returnedChestGuard: loanBow.returnedChestGuard ? 1 : 0,
    sight: loanBow.sight ? 1 : 0,
    returnedSight: loanBow.returnedSight ? 1 : 0,
    longRod: loanBow.longRod ? 1 : 0,
    returnedLongRod: loanBow.returnedLongRod ? 1 : 0,
    pressureButton: loanBow.pressureButton ? 1 : 0,
    returnedPressureButton: loanBow.returnedPressureButton ? 1 : 0,
  };
}

function createSqliteMemberProfileGateway({
  deleteUserDisciplines,
  findLoanBowByUsername,
  findRoleDefinitionByKey,
  insertUserDiscipline,
  upsertLoanBowByUsername,
  upsertUser,
  upsertUserType,
}) {
  return {
    async findLoanBowByUsername(username) {
      return normalizeLoanBowRow(findLoanBowByUsername.get(username));
    },
    async roleExists(roleKey) {
      return Boolean(findRoleDefinitionByKey.get(roleKey));
    },
    async saveLoanBowRecord(username, loanBow) {
      upsertLoanBowByUsername.run(buildLoanBowSqlPayload(username, loanBow));
    },
    async saveMemberProfile({ disciplines, loanBow, userPayload, userType }) {
      upsertUser.run(userPayload);
      upsertUserType.run({
        username: userPayload.username,
        userType,
      });
      deleteUserDisciplines.run(userPayload.username);

      for (const discipline of disciplines) {
        insertUserDiscipline.run(userPayload.username, discipline);
      }

      upsertLoanBowByUsername.run(
        buildLoanBowSqlPayload(userPayload.username, loanBow),
      );
    },
  };
}

function createPostgresMemberProfileGateway({
  pool,
}) {
  async function saveLoanBowWithClient(client, username, loanBow) {
    const payload = buildLoanBowSqlPayload(username, loanBow);

    await client.query(
      `
        INSERT INTO member_loan_bows (
          username,
          has_loan_bow,
          date_loaned,
          returned_date,
          riser_number,
          limbs_number,
          arrow_count,
          returned_riser,
          returned_limbs,
          returned_arrows,
          quiver,
          returned_quiver,
          finger_tab,
          returned_finger_tab,
          string_item,
          returned_string_item,
          arm_guard,
          returned_arm_guard,
          chest_guard,
          returned_chest_guard,
          sight,
          returned_sight,
          long_rod,
          returned_long_rod,
          pressure_button,
          returned_pressure_button
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26
        )
        ON CONFLICT(username) DO UPDATE SET
          has_loan_bow = EXCLUDED.has_loan_bow,
          date_loaned = EXCLUDED.date_loaned,
          returned_date = EXCLUDED.returned_date,
          riser_number = EXCLUDED.riser_number,
          limbs_number = EXCLUDED.limbs_number,
          arrow_count = EXCLUDED.arrow_count,
          returned_riser = EXCLUDED.returned_riser,
          returned_limbs = EXCLUDED.returned_limbs,
          returned_arrows = EXCLUDED.returned_arrows,
          quiver = EXCLUDED.quiver,
          returned_quiver = EXCLUDED.returned_quiver,
          finger_tab = EXCLUDED.finger_tab,
          returned_finger_tab = EXCLUDED.returned_finger_tab,
          string_item = EXCLUDED.string_item,
          returned_string_item = EXCLUDED.returned_string_item,
          arm_guard = EXCLUDED.arm_guard,
          returned_arm_guard = EXCLUDED.returned_arm_guard,
          chest_guard = EXCLUDED.chest_guard,
          returned_chest_guard = EXCLUDED.returned_chest_guard,
          sight = EXCLUDED.sight,
          returned_sight = EXCLUDED.returned_sight,
          long_rod = EXCLUDED.long_rod,
          returned_long_rod = EXCLUDED.returned_long_rod,
          pressure_button = EXCLUDED.pressure_button,
          returned_pressure_button = EXCLUDED.returned_pressure_button
      `,
      [
        payload.username,
        payload.hasLoanBow,
        payload.dateLoaned,
        payload.returnedDate,
        payload.riserNumber,
        payload.limbsNumber,
        payload.arrowCount,
        payload.returnedRiser,
        payload.returnedLimbs,
        payload.returnedArrows,
        payload.quiver,
        payload.returnedQuiver,
        payload.fingerTab,
        payload.returnedFingerTab,
        payload.stringItem,
        payload.returnedStringItem,
        payload.armGuard,
        payload.returnedArmGuard,
        payload.chestGuard,
        payload.returnedChestGuard,
        payload.sight,
        payload.returnedSight,
        payload.longRod,
        payload.returnedLongRod,
        payload.pressureButton,
        payload.returnedPressureButton,
      ],
    );
  }

  return {
    async findLoanBowByUsername(username) {
      const result = await pool.query(
        `
          SELECT
            username,
            has_loan_bow,
            date_loaned,
            returned_date,
            riser_number,
            limbs_number,
            arrow_count,
            returned_riser,
            returned_limbs,
            returned_arrows,
            quiver,
            returned_quiver,
            finger_tab,
            returned_finger_tab,
            string_item,
            returned_string_item,
            arm_guard,
            returned_arm_guard,
            chest_guard,
            returned_chest_guard,
            sight,
            returned_sight,
            long_rod,
            returned_long_rod,
            pressure_button,
            returned_pressure_button
          FROM member_loan_bows
          WHERE LOWER(username) = LOWER($1)
          LIMIT 1
        `,
        [username],
      );

      return normalizeLoanBowRow(result.rows[0] ?? null);
    },
    async roleExists(roleKey) {
      const result = await pool.query(
        `
          SELECT 1
          FROM roles
          WHERE role_key = $1
          LIMIT 1
        `,
        [roleKey],
      );

      return result.rowCount > 0;
    },
    async saveLoanBowRecord(username, loanBow) {
      await saveLoanBowWithClient(pool, username, loanBow);
    },
    async saveMemberProfile({ disciplines, loanBow, userPayload, userType }) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT(username) DO UPDATE SET
              first_name = EXCLUDED.first_name,
              surname = EXCLUDED.surname,
              password = EXCLUDED.password,
              rfid_tag = EXCLUDED.rfid_tag,
              active_member = EXCLUDED.active_member,
              membership_fees_due = EXCLUDED.membership_fees_due,
              coaching_volunteer = EXCLUDED.coaching_volunteer
          `,
          [
            userPayload.username,
            userPayload.firstName,
            userPayload.surname,
            userPayload.password,
            userPayload.rfidTag,
            userPayload.activeMember,
            userPayload.membershipFeesDue,
            userPayload.coachingVolunteer,
          ],
        );
        await client.query(
          `
            INSERT INTO user_types (username, user_type)
            VALUES ($1, $2)
            ON CONFLICT(username) DO UPDATE SET
              user_type = EXCLUDED.user_type
          `,
          [userPayload.username, userType],
        );
        await client.query(
          `
            DELETE FROM user_disciplines
            WHERE username = $1
          `,
          [userPayload.username],
        );

        for (const discipline of disciplines) {
          await client.query(
            `
              INSERT INTO user_disciplines (username, discipline)
              VALUES ($1, $2)
              ON CONFLICT(username, discipline) DO NOTHING
            `,
            [userPayload.username, discipline],
          );
        }

        await saveLoanBowWithClient(client, userPayload.username, loanBow);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function createMemberProfileGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresMemberProfileGateway(options);
  }

  return createSqliteMemberProfileGateway(options);
}
