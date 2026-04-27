export function bootstrapSqliteUserCompatibility({ db }) {
  const usersTableSchema = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get();

  if (!usersTableSchema?.sql?.includes("id INTEGER PRIMARY KEY AUTOINCREMENT")) {
    const applicationTables = db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name <> 'users'
          AND name NOT LIKE 'sqlite_%'
      `)
      .all()
      .map((row) => row.name);
    db.exec(`PRAGMA foreign_keys = OFF`);

    try {
      db.exec(`BEGIN`);
      db.exec(`ALTER TABLE users RENAME TO users_old`);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          first_name TEXT NOT NULL,
          surname TEXT NOT NULL,
          password TEXT,
          rfid_tag TEXT UNIQUE,
          active_member INTEGER NOT NULL DEFAULT 1,
          membership_fees_due TEXT,
          coaching_volunteer INTEGER NOT NULL DEFAULT 0
        )
      `);
      db.exec(`
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
        SELECT
          username,
          first_name,
          surname,
          password,
          rfid_tag,
          COALESCE(active_member, 1),
          membership_fees_due,
          COALESCE(coaching_volunteer, 0)
        FROM users_old
      `);

      for (const tableName of applicationTables) {
        const tableSchema = db
          .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
          .get(tableName);

        if (!tableSchema?.sql) {
          continue;
        }

        const temporaryTableName = `${tableName}_users_pk_old`;
        const rebuiltTableSql = tableSchema.sql
          .replace(
            /REFERENCES\s+["`]?users_old["`]?\s*\(\s*username\s*\)/g,
            "REFERENCES users(username)",
          )
          .replace(
            /REFERENCES\s+["`]?([A-Za-z0-9_]+)_users_pk_old["`]?\s*\(/g,
            "REFERENCES $1(",
          );

        db.exec(`ALTER TABLE ${tableName} RENAME TO ${temporaryTableName}`);
        db.exec(rebuiltTableSql);
        db.exec(`INSERT INTO ${tableName} SELECT * FROM ${temporaryTableName}`);
        db.exec(`DROP TABLE ${temporaryTableName}`);
      }

      db.exec(`DROP TABLE users_old`);
      db.exec(`COMMIT`);
    } catch (error) {
      db.exec(`ROLLBACK`);
      throw error;
    } finally {
      db.exec(`PRAGMA foreign_keys = ON`);
    }
  }

  let userColumns = db.prepare(`PRAGMA table_info(users)`).all();
  const userRelationColumns = [
    { table: "login_events", usernameColumn: "username", userIdColumn: "user_id" },
    {
      table: "guest_login_events",
      usernameColumn: "invited_by_username",
      userIdColumn: "invited_by_user_id",
    },
    { table: "coaching_sessions", usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
    {
      table: "coaching_sessions",
      usernameColumn: "approved_by_username",
      userIdColumn: "approved_by_user_id",
    },
    {
      table: "coaching_session_bookings",
      usernameColumn: "member_username",
      userIdColumn: "member_user_id",
    },
    { table: "club_events", usernameColumn: "submitted_by_username", userIdColumn: "submitted_by_user_id" },
    { table: "club_events", usernameColumn: "approved_by_username", userIdColumn: "approved_by_user_id" },
    { table: "event_bookings", usernameColumn: "member_username", userIdColumn: "member_user_id" },
    { table: "tournaments", usernameColumn: "created_by", userIdColumn: "created_by_user_id" },
    { table: "tournament_registrations", usernameColumn: "member_username", userIdColumn: "member_user_id" },
    { table: "tournament_scores", usernameColumn: "member_username", userIdColumn: "member_user_id" },
    { table: "user_types", usernameColumn: "username", userIdColumn: "user_id" },
    { table: "user_disciplines", usernameColumn: "username", userIdColumn: "user_id" },
    { table: "member_loan_bows", usernameColumn: "username", userIdColumn: "user_id" },
    { table: "committee_roles", usernameColumn: "assigned_username", userIdColumn: "assigned_user_id" },
    { table: "equipment_items", usernameColumn: "location_member_username", userIdColumn: "location_member_user_id" },
    { table: "equipment_items", usernameColumn: "added_by_username", userIdColumn: "added_by_user_id" },
    { table: "equipment_items", usernameColumn: "decommissioned_by_username", userIdColumn: "decommissioned_by_user_id" },
    { table: "equipment_items", usernameColumn: "last_assignment_by_username", userIdColumn: "last_assignment_by_user_id" },
    { table: "equipment_items", usernameColumn: "last_storage_updated_by_username", userIdColumn: "last_storage_updated_by_user_id" },
    { table: "equipment_loans", usernameColumn: "member_username", userIdColumn: "member_user_id" },
    { table: "equipment_loans", usernameColumn: "loaned_by_username", userIdColumn: "loaned_by_user_id" },
    { table: "equipment_loans", usernameColumn: "returned_by_username", userIdColumn: "returned_by_user_id" },
    { table: "beginners_courses", usernameColumn: "coordinator_username", userIdColumn: "coordinator_user_id" },
    { table: "beginners_courses", usernameColumn: "submitted_by_username", userIdColumn: "submitted_by_user_id" },
    { table: "beginners_courses", usernameColumn: "cancelled_by_username", userIdColumn: "cancelled_by_user_id" },
    { table: "beginners_courses", usernameColumn: "approved_by_username", userIdColumn: "approved_by_user_id" },
    { table: "beginners_course_participants", usernameColumn: "username", userIdColumn: "user_id" },
    { table: "beginners_course_participants", usernameColumn: "assigned_case_by_username", userIdColumn: "assigned_case_by_user_id" },
    { table: "beginners_course_participants", usernameColumn: "created_by_username", userIdColumn: "created_by_user_id" },
    { table: "beginners_course_lesson_coaches", usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
    { table: "beginners_course_lesson_coaches", usernameColumn: "assigned_by_username", userIdColumn: "assigned_by_user_id" },
  ];
  const memberLoanBowColumns = db
    .prepare(`PRAGMA table_info(member_loan_bows)`)
    .all();

  const memberLoanBowColumnDefinitions = [
    ["returned_date", "TEXT"],
    ["returned_riser", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_limbs", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_arrows", "INTEGER NOT NULL DEFAULT 0"],
    ["quiver", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_quiver", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_finger_tab", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_string_item", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_arm_guard", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_chest_guard", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_sight", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_long_rod", "INTEGER NOT NULL DEFAULT 0"],
    ["returned_pressure_button", "INTEGER NOT NULL DEFAULT 0"],
  ];

  for (const { table, usernameColumn, userIdColumn } of userRelationColumns) {
    const relationColumns = db.prepare(`PRAGMA table_info(${table})`).all();

    if (!relationColumns.some((column) => column.name === userIdColumn)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${userIdColumn} INTEGER`);
    }

    db.exec(`
      UPDATE ${table}
      SET ${userIdColumn} = (
        SELECT id
        FROM users
        WHERE users.username = ${table}.${usernameColumn}
      )
      WHERE ${usernameColumn} IS NOT NULL
        AND (
          ${userIdColumn} IS NULL
          OR ${userIdColumn} <> (
            SELECT id
            FROM users
            WHERE users.username = ${table}.${usernameColumn}
          )
        )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS ${table}_${userIdColumn}_idx
      ON ${table} (${userIdColumn})
    `);

    db.exec(`DROP TRIGGER IF EXISTS ${table}_${userIdColumn}_on_insert`);
    db.exec(`
      CREATE TRIGGER ${table}_${userIdColumn}_on_insert
      AFTER INSERT ON ${table}
      FOR EACH ROW
      WHEN NEW.${usernameColumn} IS NOT NULL
      BEGIN
        UPDATE ${table}
        SET ${userIdColumn} = (
          SELECT id
          FROM users
          WHERE users.username = NEW.${usernameColumn}
        )
        WHERE rowid = NEW.rowid;
      END
    `);

    db.exec(`DROP TRIGGER IF EXISTS ${table}_${userIdColumn}_on_update`);
    db.exec(`
      CREATE TRIGGER ${table}_${userIdColumn}_on_update
      AFTER UPDATE OF ${usernameColumn} ON ${table}
      FOR EACH ROW
      WHEN NEW.${usernameColumn} IS NOT NULL
      BEGIN
        UPDATE ${table}
        SET ${userIdColumn} = (
          SELECT id
          FROM users
          WHERE users.username = NEW.${usernameColumn}
        )
        WHERE rowid = NEW.rowid;
      END
    `);
  }

  for (const [columnName, columnDefinition] of memberLoanBowColumnDefinitions) {
    if (!memberLoanBowColumns.some((column) => column.name === columnName)) {
      db.exec(
        `ALTER TABLE member_loan_bows ADD COLUMN ${columnName} ${columnDefinition}`,
      );
    }
  }

  if (!userColumns.some((column) => column.name === "active_member")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN active_member INTEGER NOT NULL DEFAULT 1`,
    );
  }

  if (!userColumns.some((column) => column.name === "membership_fees_due")) {
    db.exec(`ALTER TABLE users ADD COLUMN membership_fees_due TEXT`);
  }

  if (!userColumns.some((column) => column.name === "coaching_volunteer")) {
    db.exec(
      `ALTER TABLE users ADD COLUMN coaching_volunteer INTEGER NOT NULL DEFAULT 0`,
    );
  }

  userColumns = db.prepare(`PRAGMA table_info(users)`).all();

  return { userColumns };
}
