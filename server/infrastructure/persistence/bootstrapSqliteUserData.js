export function bootstrapSqliteUserData({
  committeeRoleSeed,
  db,
  hashPassword,
  isLive,
  isPasswordHash,
}) {
  const seedUsers = [
    {
      username: "CLikley",
      firstName: "Chris",
      surname: "Likley",
      password: "qwe",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: true,
      userType: "coach",
      disciplines: ["Recurve Bow"],
    },
    {
      username: "Cfleetham",
      firstName: "Craig",
      surname: "Fleetham",
      password: "abc",
      rfidTag: "7673CF3D",
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: true,
      userType: "developer",
      disciplines: ["Recurve Bow"],
    },
    {
      username: "DStevens",
      firstName: "Kamala",
      surname: "Khan",
      password: "marvel",
      rfidTag: "D9DBCF3D-deactivated",
      activeMember: false,
      membershipFeesDue: "2026-01-01",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Recurve Bow"],
    },
    {
      username: "LTaylor",
      firstName: "Les",
      surname: "Taylor",
      password: "123",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: true,
      userType: "admin",
      disciplines: [
        "Bare Bow",
        "Compound Bow",
        "Flat Bow",
        "Long Bow",
        "Recurve Bow",
      ],
    },
    {
      username: "MJones",
      firstName: "Jessica",
      surname: "Jones",
      password: "marvel",
      rfidTag: null,
      activeMember: false,
      membershipFeesDue: "2026-04-03",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Flat Bow"],
    },
    {
      username: "MMurdock",
      firstName: "Matt",
      surname: "Murdock",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Bare Bow"],
    },
    {
      username: "NOdinson",
      firstName: "Thor",
      surname: "Odinson",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Long Bow"],
    },
    {
      username: "PParker",
      firstName: "Peter",
      surname: "Parker",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-05-08",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Bare Bow", "Recurve Bow"],
    },
    {
      username: "RWilliams",
      firstName: "Riri",
      surname: "Williams",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      coachingVolunteer: false,
      userType: "general",
      disciplines: ["Recurve Bow", "Compound Bow"],
    },
    {
      username: "SMaximoff",
      firstName: "Wanda",
      surname: "Maximoff",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      userType: "general",
      disciplines: ["Recurve Bow"],
    },
    {
      username: "TBarnes",
      firstName: "Bucky",
      surname: "Barnes",
      password: "marvel",
      rfidTag: null,
      activeMember: true,
      membershipFeesDue: "2026-12-31",
      userType: "general",
      disciplines: ["Compound Bow"],
    },
    {
      username: "TProfile",
      firstName: "Temp",
      surname: "ProfileUpdated",
      password: "tmp",
      rfidTag: "RFID-TPROFILE-001",
      activeMember: true,
      membershipFeesDue: "2026-04-17",
      userType: "coach",
      disciplines: ["Bare Bow", "Recurve Bow"],
    },
  ];
  const liveSeedUsers = seedUsers.filter((user) => user.username === "Cfleetham");

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
    for (const user of isLive ? liveSeedUsers : seedUsers) {
      upsertUser.run({
        ...user,
        password: hashPassword(user.password),
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
