function buildInitialSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      password TEXT,
      rfid_tag TEXT UNIQUE,
      active_member INTEGER NOT NULL DEFAULT 1,
      membership_fees_due TEXT,
      coaching_volunteer INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY,
      actor_username TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      actor_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      role_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS permissions (
      permission_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL REFERENCES roles(role_key) ON DELETE CASCADE,
      permission_key TEXT NOT NULL REFERENCES permissions(permission_key) ON DELETE CASCADE,
      PRIMARY KEY (role_key, permission_key)
    );

    CREATE TABLE IF NOT EXISTS user_types (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      user_type TEXT NOT NULL REFERENCES roles(role_key),
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_disciplines (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      discipline TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (username, discipline)
    );

    CREATE TABLE IF NOT EXISTS member_distance_sign_offs (
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      discipline TEXT NOT NULL,
      distance_yards INTEGER NOT NULL,
      signed_off_by_username TEXT NOT NULL REFERENCES users(username),
      signed_off_at_date TEXT NOT NULL,
      signed_off_at_time TEXT NOT NULL,
      signed_off_by_user_id BIGINT REFERENCES users(id),
      user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (username, discipline, distance_yards)
    );

    CREATE TABLE IF NOT EXISTS member_loan_bows (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      has_loan_bow INTEGER NOT NULL DEFAULT 0,
      date_loaned TEXT,
      returned_date TEXT,
      riser_number TEXT,
      limbs_number TEXT,
      arrow_count INTEGER NOT NULL DEFAULT 6,
      returned_riser INTEGER NOT NULL DEFAULT 0,
      returned_limbs INTEGER NOT NULL DEFAULT 0,
      returned_arrows INTEGER NOT NULL DEFAULT 0,
      quiver INTEGER NOT NULL DEFAULT 0,
      returned_quiver INTEGER NOT NULL DEFAULT 0,
      finger_tab INTEGER NOT NULL DEFAULT 0,
      returned_finger_tab INTEGER NOT NULL DEFAULT 0,
      string_item INTEGER NOT NULL DEFAULT 0,
      returned_string_item INTEGER NOT NULL DEFAULT 0,
      arm_guard INTEGER NOT NULL DEFAULT 0,
      returned_arm_guard INTEGER NOT NULL DEFAULT 0,
      chest_guard INTEGER NOT NULL DEFAULT 0,
      returned_chest_guard INTEGER NOT NULL DEFAULT 0,
      sight INTEGER NOT NULL DEFAULT 0,
      returned_sight INTEGER NOT NULL DEFAULT 0,
      long_rod INTEGER NOT NULL DEFAULT 0,
      returned_long_rod INTEGER NOT NULL DEFAULT 0,
      pressure_button INTEGER NOT NULL DEFAULT 0,
      returned_pressure_button INTEGER NOT NULL DEFAULT 0,
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_events (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username),
      login_method TEXT NOT NULL,
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS guest_login_events (
      id BIGSERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      archery_gb_membership_number TEXT NOT NULL,
      invited_by_username TEXT REFERENCES users(username),
      invited_by_name TEXT,
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL,
      invited_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS coaching_sessions (
      id BIGSERIAL PRIMARY KEY,
      coach_username TEXT NOT NULL REFERENCES users(username),
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      available_slots INTEGER NOT NULL DEFAULT 1,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      venue TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'approved',
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      coach_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS coaching_session_bookings (
      coaching_session_id BIGINT NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      booked_at_date TEXT NOT NULL,
      booked_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (coaching_session_id, member_username)
    );

    CREATE TABLE IF NOT EXISTS club_events (
      id BIGSERIAL PRIMARY KEY,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      type TEXT NOT NULL,
      venue TEXT NOT NULL DEFAULT 'both',
      submitted_by_username TEXT REFERENCES users(username),
      approval_status TEXT NOT NULL DEFAULT 'approved',
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      submitted_by_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS event_bookings (
      club_event_id BIGINT NOT NULL REFERENCES club_events(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      booked_at_date TEXT NOT NULL,
      booked_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (club_event_id, member_username)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      tournament_type TEXT NOT NULL,
      registration_start_date TEXT NOT NULL,
      registration_end_date TEXT NOT NULL,
      score_submission_start_date TEXT NOT NULL,
      score_submission_end_date TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      created_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tournament_registrations (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      registered_at_date TEXT NOT NULL,
      registered_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (tournament_id, member_username)
    );

    CREATE TABLE IF NOT EXISTS tournament_scores (
      tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL,
      member_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      submitted_at_date TEXT NOT NULL,
      submitted_at_time TEXT NOT NULL,
      member_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (tournament_id, round_number, member_username)
    );

    CREATE TABLE IF NOT EXISTS committee_roles (
      id BIGSERIAL PRIMARY KEY,
      role_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      responsibilities TEXT,
      personal_blurb TEXT,
      photo_data_url TEXT,
      display_order INTEGER NOT NULL,
      assigned_username TEXT REFERENCES users(username),
      assigned_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS equipment_storage_locations (
      label TEXT PRIMARY KEY,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment_items (
      id BIGSERIAL PRIMARY KEY,
      equipment_type TEXT NOT NULL,
      item_number TEXT,
      size_category TEXT NOT NULL DEFAULT 'standard',
      arrow_length INTEGER,
      arrow_quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      location_type TEXT NOT NULL DEFAULT 'cupboard',
      location_label TEXT,
      location_case_id BIGINT REFERENCES equipment_items(id),
      location_member_username TEXT REFERENCES users(username),
      added_by_username TEXT NOT NULL REFERENCES users(username),
      added_at_date TEXT NOT NULL,
      added_at_time TEXT NOT NULL,
      decommissioned_by_username TEXT REFERENCES users(username),
      decommissioned_at_date TEXT,
      decommissioned_at_time TEXT,
      decommission_reason TEXT,
      last_assignment_by_username TEXT REFERENCES users(username),
      last_assignment_at_date TEXT,
      last_assignment_at_time TEXT,
      last_storage_updated_by_username TEXT REFERENCES users(username),
      last_storage_updated_at_date TEXT,
      last_storage_updated_at_time TEXT,
      location_member_user_id BIGINT REFERENCES users(id),
      added_by_user_id BIGINT REFERENCES users(id),
      decommissioned_by_user_id BIGINT REFERENCES users(id),
      last_assignment_by_user_id BIGINT REFERENCES users(id),
      last_storage_updated_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS equipment_loans (
      id BIGSERIAL PRIMARY KEY,
      equipment_item_id BIGINT NOT NULL REFERENCES equipment_items(id),
      member_username TEXT NOT NULL REFERENCES users(username),
      loaned_by_username TEXT NOT NULL REFERENCES users(username),
      loaned_at_date TEXT NOT NULL,
      loaned_at_time TEXT NOT NULL,
      loan_context_case_id BIGINT REFERENCES equipment_items(id),
      returned_by_username TEXT REFERENCES users(username),
      returned_at_date TEXT,
      returned_at_time TEXT,
      return_location_type TEXT,
      return_location_label TEXT,
      return_case_id BIGINT REFERENCES equipment_items(id),
      member_user_id BIGINT REFERENCES users(id),
      loaned_by_user_id BIGINT REFERENCES users(id),
      returned_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_courses (
      id BIGSERIAL PRIMARY KEY,
      course_type TEXT NOT NULL DEFAULT 'beginners',
      coordinator_username TEXT NOT NULL REFERENCES users(username),
      submitted_by_username TEXT NOT NULL REFERENCES users(username),
      first_lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lesson_count INTEGER NOT NULL,
      beginner_capacity INTEGER NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancellation_reason TEXT,
      cancelled_by_username TEXT REFERENCES users(username),
      cancelled_at_date TEXT,
      cancelled_at_time TEXT,
      rejection_reason TEXT,
      approved_by_username TEXT REFERENCES users(username),
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      coordinator_user_id BIGINT REFERENCES users(id),
      submitted_by_user_id BIGINT REFERENCES users(id),
      cancelled_by_user_id BIGINT REFERENCES users(id),
      approved_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_lessons (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES beginners_courses(id) ON DELETE CASCADE,
      lesson_number INTEGER NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      UNIQUE (course_id, lesson_number)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_participants (
      id BIGSERIAL PRIMARY KEY,
      course_id BIGINT NOT NULL REFERENCES beginners_courses(id) ON DELETE CASCADE,
      username TEXT NOT NULL UNIQUE REFERENCES users(username),
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      beginner_size_category TEXT NOT NULL,
      height_text TEXT,
      handedness TEXT,
      eye_dominance TEXT,
      initial_email_sent INTEGER NOT NULL DEFAULT 0,
      thirty_day_reminder_sent INTEGER NOT NULL DEFAULT 0,
      course_fee_paid INTEGER NOT NULL DEFAULT 0,
      converted_to_member INTEGER NOT NULL DEFAULT 0,
      assigned_case_id BIGINT REFERENCES equipment_items(id),
      assigned_case_by_username TEXT REFERENCES users(username),
      assigned_case_at_date TEXT,
      assigned_case_at_time TEXT,
      created_by_username TEXT NOT NULL REFERENCES users(username),
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      user_id BIGINT REFERENCES users(id),
      assigned_case_by_user_id BIGINT REFERENCES users(id),
      created_by_user_id BIGINT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS beginners_course_lesson_coaches (
      lesson_id BIGINT NOT NULL REFERENCES beginners_course_lessons(id) ON DELETE CASCADE,
      coach_username TEXT NOT NULL REFERENCES users(username),
      assigned_by_username TEXT NOT NULL REFERENCES users(username),
      assigned_at_date TEXT NOT NULL,
      assigned_at_time TEXT NOT NULL,
      coach_user_id BIGINT REFERENCES users(id),
      assigned_by_user_id BIGINT REFERENCES users(id),
      PRIMARY KEY (lesson_id, coach_username)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS equipment_items_unique_number
      ON equipment_items (equipment_type, size_category, item_number)
      WHERE item_number IS NOT NULL AND status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS equipment_loans_one_open_loan
      ON equipment_loans (equipment_item_id)
      WHERE returned_at_date IS NULL;
  `;
}

function buildRolePermissionSeedSql({
  committeeRoleSeed,
  defaultEquipmentCupboardLabel,
  permissionDefinitions,
  seedUsers,
  systemRoleDefinitions,
}) {
  const statements = [];

  for (const permission of permissionDefinitions) {
    statements.push({
      sql: `
        INSERT INTO permissions (permission_key, label, description)
        VALUES ($1, $2, $3)
        ON CONFLICT(permission_key) DO UPDATE SET
          label = EXCLUDED.label,
          description = EXCLUDED.description
      `,
      values: [permission.key, permission.label, permission.description],
    });
  }

  for (const role of systemRoleDefinitions) {
    statements.push({
      sql: `
        INSERT INTO roles (role_key, title, is_system)
        VALUES ($1, $2, 1)
        ON CONFLICT(role_key) DO UPDATE SET
          title = EXCLUDED.title,
          is_system = GREATEST(roles.is_system, EXCLUDED.is_system)
      `,
      values: [role.roleKey, role.title],
    });

    for (const permissionKey of role.permissions) {
      statements.push({
        sql: `
          INSERT INTO role_permissions (role_key, permission_key)
          VALUES ($1, $2)
          ON CONFLICT(role_key, permission_key) DO NOTHING
        `,
        values: [role.roleKey, permissionKey],
      });
    }
  }

  statements.push({
    sql: `
      INSERT INTO equipment_storage_locations (label, created_at_date, created_at_time)
      VALUES ($1, '1970-01-01', '00:00:00.000Z')
      ON CONFLICT(label) DO NOTHING
    `,
    values: [defaultEquipmentCupboardLabel],
  });

  for (const role of committeeRoleSeed) {
    statements.push({
      sql: `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
        ON CONFLICT(role_key) DO NOTHING
      `,
      values: [
        role.roleKey,
        role.title,
        role.summary,
        role.responsibilities ?? role.summary,
        role.personalBlurb ?? "",
        role.photoDataUrl ?? null,
        role.displayOrder,
      ],
    });
  }

  for (const user of seedUsers) {
    statements.push({
      sql: `
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
      values: [
        user.username,
        user.firstName,
        user.surname,
        user.password,
        user.rfidTag,
        user.activeMember ? 1 : 0,
        user.membershipFeesDue,
        user.coachingVolunteer ? 1 : 0,
      ],
    });
    statements.push({
      sql: `
        INSERT INTO user_types (username, user_type)
        VALUES ($1, $2)
        ON CONFLICT(username) DO UPDATE SET
          user_type = EXCLUDED.user_type
      `,
      values: [user.username, user.userType],
    });

    for (const discipline of user.disciplines) {
      statements.push({
        sql: `
          INSERT INTO user_disciplines (username, discipline)
          VALUES ($1, $2)
          ON CONFLICT(username, discipline) DO NOTHING
        `,
        values: [user.username, discipline],
      });
    }
  }

  return statements;
}

function buildUserReferenceSyncStatements() {
  const userReferenceMappings = [
    {
      tableName: "audit_events",
      references: [{ usernameColumn: "actor_username", userIdColumn: "actor_user_id" }],
    },
    {
      tableName: "user_types",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "user_disciplines",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "member_distance_sign_offs",
      references: [
        { usernameColumn: "username", userIdColumn: "user_id" },
        {
          usernameColumn: "signed_off_by_username",
          userIdColumn: "signed_off_by_user_id",
        },
      ],
    },
    {
      tableName: "member_loan_bows",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "login_events",
      references: [{ usernameColumn: "username", userIdColumn: "user_id" }],
    },
    {
      tableName: "guest_login_events",
      references: [
        {
          usernameColumn: "invited_by_username",
          userIdColumn: "invited_by_user_id",
        },
      ],
    },
    {
      tableName: "coaching_sessions",
      references: [
        { usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "coaching_session_bookings",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "club_events",
      references: [
        {
          usernameColumn: "submitted_by_username",
          userIdColumn: "submitted_by_user_id",
        },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "event_bookings",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "tournaments",
      references: [{ usernameColumn: "created_by", userIdColumn: "created_by_user_id" }],
    },
    {
      tableName: "tournament_registrations",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "tournament_scores",
      references: [{ usernameColumn: "member_username", userIdColumn: "member_user_id" }],
    },
    {
      tableName: "committee_roles",
      references: [{ usernameColumn: "assigned_username", userIdColumn: "assigned_user_id" }],
    },
    {
      tableName: "equipment_items",
      references: [
        {
          usernameColumn: "location_member_username",
          userIdColumn: "location_member_user_id",
        },
        { usernameColumn: "added_by_username", userIdColumn: "added_by_user_id" },
        {
          usernameColumn: "decommissioned_by_username",
          userIdColumn: "decommissioned_by_user_id",
        },
        {
          usernameColumn: "last_assignment_by_username",
          userIdColumn: "last_assignment_by_user_id",
        },
        {
          usernameColumn: "last_storage_updated_by_username",
          userIdColumn: "last_storage_updated_by_user_id",
        },
      ],
    },
    {
      tableName: "equipment_loans",
      references: [
        { usernameColumn: "member_username", userIdColumn: "member_user_id" },
        { usernameColumn: "loaned_by_username", userIdColumn: "loaned_by_user_id" },
        { usernameColumn: "returned_by_username", userIdColumn: "returned_by_user_id" },
      ],
    },
    {
      tableName: "beginners_courses",
      references: [
        {
          usernameColumn: "coordinator_username",
          userIdColumn: "coordinator_user_id",
        },
        {
          usernameColumn: "submitted_by_username",
          userIdColumn: "submitted_by_user_id",
        },
        {
          usernameColumn: "cancelled_by_username",
          userIdColumn: "cancelled_by_user_id",
        },
        {
          usernameColumn: "approved_by_username",
          userIdColumn: "approved_by_user_id",
        },
      ],
    },
    {
      tableName: "beginners_course_participants",
      references: [
        { usernameColumn: "username", userIdColumn: "user_id" },
        {
          usernameColumn: "assigned_case_by_username",
          userIdColumn: "assigned_case_by_user_id",
        },
        {
          usernameColumn: "created_by_username",
          userIdColumn: "created_by_user_id",
        },
      ],
    },
    {
      tableName: "beginners_course_lesson_coaches",
      references: [
        { usernameColumn: "coach_username", userIdColumn: "coach_user_id" },
        {
          usernameColumn: "assigned_by_username",
          userIdColumn: "assigned_by_user_id",
        },
      ],
    },
  ];

  return userReferenceMappings.flatMap(({ references, tableName }) => {
    const functionName = `sync_${tableName}_user_refs`;
    const triggerName = `${tableName}_user_refs_trigger`;
    const assignments = references
      .map(
        ({ usernameColumn, userIdColumn }) => `
          IF NEW.${usernameColumn} IS NULL OR BTRIM(NEW.${usernameColumn}) = '' THEN
            NEW.${userIdColumn} := NULL;
          ELSE
            SELECT id INTO NEW.${userIdColumn}
            FROM users
            WHERE LOWER(username) = LOWER(NEW.${usernameColumn})
            LIMIT 1;
          END IF;
        `,
      )
      .join("\n");
    const backfillAssignments = references
      .map(
        ({ usernameColumn, userIdColumn }) => `
          ${userIdColumn} = CASE
            WHEN ${usernameColumn} IS NULL OR BTRIM(${usernameColumn}) = '' THEN NULL
            ELSE (
              SELECT id
              FROM users
              WHERE LOWER(users.username) = LOWER(${tableName}.${usernameColumn})
              LIMIT 1
            )
          END
        `,
      )
      .join(",");

    return [
      {
        sql: `
          CREATE OR REPLACE FUNCTION ${functionName}()
          RETURNS TRIGGER
          LANGUAGE plpgsql
          AS $$
          BEGIN
            ${assignments}
            RETURN NEW;
          END;
          $$;
        `,
      },
      {
        sql: `
          DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};
          CREATE TRIGGER ${triggerName}
          BEFORE INSERT OR UPDATE ON ${tableName}
          FOR EACH ROW
          EXECUTE FUNCTION ${functionName}();
        `,
      },
      {
        sql: `
          UPDATE ${tableName}
          SET ${backfillAssignments};
        `,
      },
    ];
  });
}

export async function runPostgresMigrations({
  committeeRoleSeed,
  defaultEquipmentCupboardLabel,
  permissionDefinitions,
  pool,
  seedUsers = [],
  systemRoleDefinitions,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(buildInitialSchemaSql());

    const appliedResult = await client.query(
      `
        SELECT 1
        FROM schema_migrations
        WHERE version = $1
        LIMIT 1
      `,
      ["001_initial_schema"],
    );

    if (appliedResult.rowCount === 0) {
      const seedStatements = buildRolePermissionSeedSql({
        committeeRoleSeed,
        defaultEquipmentCupboardLabel,
        permissionDefinitions,
        seedUsers,
        systemRoleDefinitions,
      });

      for (const statement of seedStatements) {
        await client.query(statement.sql, statement.values);
      }

      await client.query(
        `
          INSERT INTO schema_migrations (version)
          VALUES ($1)
        `,
        ["001_initial_schema"],
      );
    }

    for (const statement of buildUserReferenceSyncStatements()) {
      await client.query(statement.sql, statement.values);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
