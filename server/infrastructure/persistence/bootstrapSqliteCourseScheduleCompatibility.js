function migrateCombinedDateTimeColumn({
  createTableSql,
  db,
  insertColumns,
  legacyColumnName,
  selectColumns,
  tableName,
}) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();

  if (!columns.some((column) => column.name === legacyColumnName)) {
    return false;
  }

  const temporaryTableName = `${tableName}_old`;

  db.exec(`
    PRAGMA foreign_keys = OFF;

    BEGIN TRANSACTION;

    ALTER TABLE ${tableName} RENAME TO ${temporaryTableName};

    ${createTableSql};

    INSERT INTO ${tableName} (${insertColumns.join(", ")})
    SELECT
      ${selectColumns.join(",\n      ")}
    FROM ${temporaryTableName};

    DROP TABLE ${temporaryTableName};

    COMMIT;

    PRAGMA foreign_keys = ON;
  `);

  return true;
}

function rebuildBeginnersCourseLessonsTable(db) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    ALTER TABLE beginners_course_lessons RENAME TO beginners_course_lessons_old;
    CREATE TABLE beginners_course_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      UNIQUE (course_id, lesson_number),
      FOREIGN KEY (course_id) REFERENCES beginners_courses(id)
    );
    INSERT INTO beginners_course_lessons (
      id,
      course_id,
      lesson_number,
      lesson_date,
      start_time,
      end_time
    )
    SELECT
      id,
      course_id,
      lesson_number,
      lesson_date,
      start_time,
      end_time
    FROM beginners_course_lessons_old;
    DROP TABLE beginners_course_lessons_old;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function rebuildBeginnersCourseParticipantsTable(db) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    ALTER TABLE beginners_course_participants RENAME TO beginners_course_participants_old;
    CREATE TABLE beginners_course_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      beginner_size_category TEXT NOT NULL CHECK (
        beginner_size_category IN ('senior', 'junior')
      ),
      height_text TEXT,
      handedness TEXT CHECK (handedness IN ('left', 'right')),
      eye_dominance TEXT CHECK (eye_dominance IN ('left', 'right')),
      initial_email_sent INTEGER NOT NULL DEFAULT 0,
      thirty_day_reminder_sent INTEGER NOT NULL DEFAULT 0,
      course_fee_paid INTEGER NOT NULL DEFAULT 0,
      converted_to_member INTEGER NOT NULL DEFAULT 0,
      assigned_case_id INTEGER,
      assigned_case_by_username TEXT,
      assigned_case_at_date TEXT,
      assigned_case_at_time TEXT,
      created_by_username TEXT NOT NULL,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      user_id INTEGER,
      assigned_case_by_user_id INTEGER,
      created_by_user_id INTEGER,
      FOREIGN KEY (course_id) REFERENCES beginners_courses(id),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (assigned_case_id) REFERENCES equipment_items(id),
      FOREIGN KEY (assigned_case_by_username) REFERENCES users(username),
      FOREIGN KEY (created_by_username) REFERENCES users(username)
    );
    INSERT INTO beginners_course_participants (
      id,
      course_id,
      username,
      first_name,
      surname,
      beginner_size_category,
      height_text,
      handedness,
      eye_dominance,
      initial_email_sent,
      thirty_day_reminder_sent,
      course_fee_paid,
      converted_to_member,
      assigned_case_id,
      assigned_case_by_username,
      assigned_case_at_date,
      assigned_case_at_time,
      created_by_username,
      created_at_date,
      created_at_time,
      user_id,
      assigned_case_by_user_id,
      created_by_user_id
    )
    SELECT
      id,
      course_id,
      username,
      first_name,
      surname,
      beginner_size_category,
      height_text,
      handedness,
      eye_dominance,
      initial_email_sent,
      thirty_day_reminder_sent,
      course_fee_paid,
      COALESCE(converted_to_member, 0),
      assigned_case_id,
      assigned_case_by_username,
      assigned_case_at_date,
      assigned_case_at_time,
      created_by_username,
      created_at_date,
      created_at_time,
      user_id,
      assigned_case_by_user_id,
      created_by_user_id
    FROM beginners_course_participants_old;
    DROP TABLE beginners_course_participants_old;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function rebuildBeginnersCourseLessonCoachesTable(db) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;
    ALTER TABLE beginners_course_lesson_coaches RENAME TO beginners_course_lesson_coaches_old;
    CREATE TABLE beginners_course_lesson_coaches (
      lesson_id INTEGER NOT NULL,
      coach_username TEXT NOT NULL,
      assigned_by_username TEXT NOT NULL,
      assigned_at_date TEXT NOT NULL,
      assigned_at_time TEXT NOT NULL,
      coach_user_id INTEGER,
      assigned_by_user_id INTEGER,
      PRIMARY KEY (lesson_id, coach_username),
      FOREIGN KEY (lesson_id) REFERENCES beginners_course_lessons(id),
      FOREIGN KEY (coach_username) REFERENCES users(username),
      FOREIGN KEY (assigned_by_username) REFERENCES users(username)
    );
    INSERT INTO beginners_course_lesson_coaches (
      lesson_id,
      coach_username,
      assigned_by_username,
      assigned_at_date,
      assigned_at_time,
      coach_user_id,
      assigned_by_user_id
    )
    SELECT
      lesson_id,
      coach_username,
      assigned_by_username,
      assigned_at_date,
      assigned_at_time,
      coach_user_id,
      assigned_by_user_id
    FROM beginners_course_lesson_coaches_old;
    DROP TABLE beginners_course_lesson_coaches_old;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export function bootstrapSqliteCourseScheduleCompatibility({
  clubEventsTableSql,
  coachingSessionBookingsTableSql,
  coachingSessionsTableSql,
  db,
  eventBookingsTableSql,
  tournamentsTableSql,
  tournamentRegistrationsTableSql,
  tournamentScoresTableSql,
}) {
  const memberDistanceSignOffColumns = db
    .prepare(`PRAGMA table_info(member_distance_sign_offs)`)
    .all();

  if (!memberDistanceSignOffColumns.some((column) => column.name === "source")) {
    db.exec(
      `ALTER TABLE member_distance_sign_offs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`,
    );
  }

  const beginnersCourseParticipantColumns = db
    .prepare(`PRAGMA table_info(beginners_course_participants)`)
    .all();

  if (
    !beginnersCourseParticipantColumns.some(
      (column) => column.name === "converted_to_member",
    )
  ) {
    db.exec(
      `ALTER TABLE beginners_course_participants ADD COLUMN converted_to_member INTEGER NOT NULL DEFAULT 0`,
    );
  }

  const coachingSessionApprovalColumns = [
    ["approval_status", "TEXT NOT NULL DEFAULT 'approved'"],
    ["rejection_reason", "TEXT"],
    ["approved_by_username", "TEXT"],
    ["approved_at_date", "TEXT"],
    ["approved_at_time", "TEXT"],
  ];

  const beginnersCoursesColumns = db
    .prepare(`PRAGMA table_info(beginners_courses)`)
    .all();

  if (!beginnersCoursesColumns.some((column) => column.name === "course_type")) {
    db.exec(
      `ALTER TABLE beginners_courses ADD COLUMN course_type TEXT NOT NULL DEFAULT 'beginners'`,
    );
  }

  const beginnersCoursesTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_courses'`,
    )
    .get();

  if (
    beginnersCoursesTable?.sql &&
    !beginnersCoursesTable.sql.includes("'taster-session'")
  ) {
    db.exec(`
      ALTER TABLE beginners_courses RENAME TO beginners_courses_old;
      CREATE TABLE beginners_courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_type TEXT NOT NULL DEFAULT 'beginners' CHECK (
          course_type IN ('beginners', 'have-a-go', 'taster-session')
        ),
        coordinator_username TEXT NOT NULL,
        submitted_by_username TEXT NOT NULL,
        first_lesson_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        lesson_count INTEGER NOT NULL,
        beginner_capacity INTEGER NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        approved_by_username TEXT,
        approved_at_date TEXT,
        approved_at_time TEXT,
        created_at_date TEXT NOT NULL,
        created_at_time TEXT NOT NULL,
        is_cancelled INTEGER NOT NULL DEFAULT 0,
        cancellation_reason TEXT,
        cancelled_by_username TEXT,
        cancelled_at_date TEXT,
        cancelled_at_time TEXT,
        FOREIGN KEY (coordinator_username) REFERENCES users(username),
        FOREIGN KEY (submitted_by_username) REFERENCES users(username),
        FOREIGN KEY (approved_by_username) REFERENCES users(username),
        FOREIGN KEY (cancelled_by_username) REFERENCES users(username)
      );
      INSERT INTO beginners_courses (
        id,
        course_type,
        coordinator_username,
        submitted_by_username,
        first_lesson_date,
        start_time,
        end_time,
        lesson_count,
        beginner_capacity,
        approval_status,
        rejection_reason,
        approved_by_username,
        approved_at_date,
        approved_at_time,
        created_at_date,
        created_at_time,
        is_cancelled,
        cancellation_reason,
        cancelled_by_username,
        cancelled_at_date,
        cancelled_at_time
      )
      SELECT
        id,
        course_type,
        coordinator_username,
        submitted_by_username,
        first_lesson_date,
        start_time,
        end_time,
        lesson_count,
        beginner_capacity,
        approval_status,
        rejection_reason,
        approved_by_username,
        approved_at_date,
        approved_at_time,
        created_at_date,
        created_at_time,
        is_cancelled,
        cancellation_reason,
        cancelled_by_username,
        cancelled_at_date,
        cancelled_at_time
      FROM beginners_courses_old;
      DROP TABLE beginners_courses_old;
    `);
  }

  const beginnersCourseLessonsTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_course_lessons'`,
    )
    .get();

  if (beginnersCourseLessonsTable?.sql?.includes("beginners_courses_old")) {
    rebuildBeginnersCourseLessonsTable(db);
  }

  const beginnersCourseParticipantsTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_course_participants'`,
    )
    .get();

  if (beginnersCourseParticipantsTable?.sql?.includes("beginners_courses_old")) {
    rebuildBeginnersCourseParticipantsTable(db);
  }

  const beginnersCourseLessonCoachesTable = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_course_lesson_coaches'`,
    )
    .get();

  if (beginnersCourseLessonCoachesTable?.sql?.includes("beginners_course_lessons_old")) {
    rebuildBeginnersCourseLessonCoachesTable(db);
  }

  const beginnersCourseCancellationColumns = [
    ["is_cancelled", "INTEGER NOT NULL DEFAULT 0"],
    ["cancellation_reason", "TEXT"],
    ["cancelled_by_username", "TEXT"],
    ["cancelled_at_date", "TEXT"],
    ["cancelled_at_time", "TEXT"],
  ];

  for (const [columnName, columnDefinition] of beginnersCourseCancellationColumns) {
    if (!beginnersCoursesColumns.some((column) => column.name === columnName)) {
      db.exec(
        `ALTER TABLE beginners_courses ADD COLUMN ${columnName} ${columnDefinition}`,
      );
    }
  }

  const coachingSessionsColumns = db
    .prepare(`PRAGMA table_info(coaching_sessions)`)
    .all();
  const coachingSessionBookingsColumns = db
    .prepare(`PRAGMA table_info(coaching_session_bookings)`)
    .all();
  const coachingSessionsAvailableSlotsSelect = coachingSessionsColumns.some(
    (column) => column.name === "available_slots",
  )
    ? "available_slots"
    : "1";
  const coachingSessionsVenueSelect = coachingSessionsColumns.some(
    (column) => column.name === "venue",
  )
    ? "CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'both' THEN 'both' ELSE 'indoor' END"
    : "CASE WHEN lower(COALESCE(location, '')) = 'outdoor' THEN 'outdoor' ELSE 'indoor' END";
  const clubEventsColumns = db.prepare(`PRAGMA table_info(club_events)`).all();
  const clubEventsVenueSelect = clubEventsColumns.some(
    (column) => column.name === "venue",
  )
    ? "CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor' ELSE 'both' END"
    : "'both'";

  for (const [columnName, columnDefinition] of coachingSessionApprovalColumns) {
    if (!coachingSessionsColumns.some((column) => column.name === columnName)) {
      db.exec(
        `ALTER TABLE coaching_sessions ADD COLUMN ${columnName} ${columnDefinition}`,
      );
    }
  }

  const clubEventApprovalColumns = [
    ["details", "TEXT"],
    ["types", "TEXT"],
    ["venue", "TEXT NOT NULL DEFAULT 'both'"],
    ["submitted_by_username", "TEXT"],
    ["approval_status", "TEXT NOT NULL DEFAULT 'approved'"],
    ["rejection_reason", "TEXT"],
    ["approved_by_username", "TEXT"],
    ["approved_at_date", "TEXT"],
    ["approved_at_time", "TEXT"],
  ];

  for (const [columnName, columnDefinition] of clubEventApprovalColumns) {
    if (!clubEventsColumns.some((column) => column.name === columnName)) {
      db.exec(`ALTER TABLE club_events ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  if (
    coachingSessionsColumns.length > 0 &&
    (coachingSessionsColumns.some((column) => column.name === "created_at") ||
      !coachingSessionsColumns.some(
        (column) => column.name === "available_slots",
      ) ||
      !coachingSessionsColumns.some((column) => column.name === "created_at_date") ||
      !coachingSessionsColumns.some((column) => column.name === "created_at_time"))
  ) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE coaching_sessions RENAME TO coaching_sessions_old;

      ${coachingSessionsTableSql.trim()};

      INSERT INTO coaching_sessions (
        id,
        coach_username,
        session_date,
        start_time,
        end_time,
        available_slots,
        topic,
        summary,
        venue,
        approval_status,
        approved_by_username,
        approved_at_date,
        approved_at_time,
        created_at_date,
        created_at_time
      )
      SELECT
        id,
        coach_username,
        session_date,
        start_time,
        end_time,
        ${coachingSessionsAvailableSlotsSelect},
        topic,
        summary,
        ${coachingSessionsVenueSelect},
        COALESCE(approval_status, 'approved'),
        approved_by_username,
        approved_at_date,
        approved_at_time,
        substr(created_at, 1, 10),
        substr(created_at, 12)
      FROM coaching_sessions_old;

      DROP TABLE coaching_sessions_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);
  }

  const coachingBookingForeignKeys = db
    .prepare(`PRAGMA foreign_key_list(coaching_session_bookings)`)
    .all();

  if (
    coachingSessionBookingsColumns.some(
      (column) => column.name === "booked_at",
    ) ||
    coachingBookingForeignKeys.some(
      (foreignKey) => foreignKey.table === "coaching_sessions_old",
    )
  ) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE coaching_session_bookings RENAME TO coaching_session_bookings_old;

      ${coachingSessionBookingsTableSql.trim()};

      INSERT INTO coaching_session_bookings (
        coaching_session_id,
        member_username,
        booked_at_date,
        booked_at_time
      )
      SELECT
        coaching_session_id,
        member_username,
        substr(booked_at, 1, 10),
        substr(booked_at, 12)
      FROM coaching_session_bookings_old;

      DROP TABLE coaching_session_bookings_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);
  }

  const eventBookingsColumns = db
    .prepare(`PRAGMA table_info(event_bookings)`)
    .all();
  const eventBookingForeignKeys = db
    .prepare(`PRAGMA foreign_key_list(event_bookings)`)
    .all();

  if (
    migrateCombinedDateTimeColumn({
      createTableSql: clubEventsTableSql.trim(),
      db,
      insertColumns: [
        "id",
        "event_date",
        "start_time",
        "end_time",
        "title",
        "type",
        "venue",
        "submitted_by_username",
        "approval_status",
        "approved_by_username",
        "approved_at_date",
        "approved_at_time",
        "created_at_date",
        "created_at_time",
      ],
      legacyColumnName: "created_at",
      selectColumns: [
        "id",
        "event_date",
        "start_time",
        "end_time",
        "title",
        "type",
        clubEventsVenueSelect,
        "submitted_by_username",
        "COALESCE(approval_status, 'approved')",
        "approved_by_username",
        "approved_at_date",
        "approved_at_time",
        "substr(created_at, 1, 10)",
        "substr(created_at, 12)",
      ],
      tableName: "club_events",
    }) ||
    !db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'club_events'`,
      )
      .get()
      ?.sql?.includes("venue TEXT NOT NULL DEFAULT 'both'") ||
    eventBookingForeignKeys.some(
      (foreignKey) => foreignKey.table === "club_events_old",
    ) ||
    eventBookingsColumns.some((column) => column.name === "booked_at")
  ) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE event_bookings RENAME TO event_bookings_old;

      ${eventBookingsTableSql.trim()};

      INSERT INTO event_bookings (
        club_event_id,
        member_username,
        booked_at_date,
        booked_at_time
      )
      SELECT
        club_event_id,
        member_username,
        substr(booked_at, 1, 10),
        substr(booked_at, 12)
      FROM event_bookings_old;

      DROP TABLE event_bookings_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);
  }

  const tournamentRegistrationsColumns = db
    .prepare(`PRAGMA table_info(tournament_registrations)`)
    .all();
  const tournamentRegistrationsForeignKeys = db
    .prepare(`PRAGMA foreign_key_list(tournament_registrations)`)
    .all();
  const tournamentScoresColumns = db
    .prepare(`PRAGMA table_info(tournament_scores)`)
    .all();
  const tournamentScoresForeignKeys = db
    .prepare(`PRAGMA foreign_key_list(tournament_scores)`)
    .all();
  const tournamentMatchesColumns = db
    .prepare(`PRAGMA table_info(tournament_matches)`)
    .all();
  const tournamentsColumns = db.prepare(`PRAGMA table_info(tournaments)`).all();

  if (!tournamentsColumns.some((column) => column.name === "template_key")) {
    db.exec(`
      ALTER TABLE tournaments
      ADD COLUMN template_key TEXT;
    `);
  }

  if (!tournamentsColumns.some((column) => column.name === "draw_date")) {
    db.exec(`
      ALTER TABLE tournaments
      ADD COLUMN draw_date TEXT;
    `);
  }

  if (!tournamentsColumns.some((column) => column.name === "round_schedule_json")) {
    db.exec(`
      ALTER TABLE tournaments
      ADD COLUMN round_schedule_json TEXT NOT NULL DEFAULT '[]';
    `);
  }

  const tournamentMatchColumnsToAdd = [
    ["submitted_by_username", "TEXT REFERENCES users(username)"],
    ["submitted_at_date", "TEXT"],
    ["submitted_at_time", "TEXT"],
    ["confirmed_by_username", "TEXT REFERENCES users(username)"],
    ["confirmed_at_date", "TEXT"],
    ["confirmed_at_time", "TEXT"],
    ["disputed_by_username", "TEXT REFERENCES users(username)"],
    ["disputed_at_date", "TEXT"],
    ["disputed_at_time", "TEXT"],
    ["dispute_reason", "TEXT"],
  ];

  for (const [columnName, columnType] of tournamentMatchColumnsToAdd) {
    if (!tournamentMatchesColumns.some((column) => column.name === columnName)) {
      db.exec(`
        ALTER TABLE tournament_matches
        ADD COLUMN ${columnName} ${columnType};
      `);
    }
  }

  if (
    migrateCombinedDateTimeColumn({
      createTableSql: tournamentsTableSql.trim(),
      db,
      insertColumns: [
        "id",
        "name",
        "tournament_type",
        "registration_start_date",
        "registration_end_date",
        "score_submission_start_date",
        "score_submission_end_date",
        "created_by",
        "created_at_date",
        "created_at_time",
      ],
      legacyColumnName: "created_at",
      selectColumns: [
        "id",
        "name",
        "tournament_type",
        "registration_start_date",
        "registration_end_date",
        "score_submission_start_date",
        "score_submission_end_date",
        "created_by",
        "substr(created_at, 1, 10)",
        "substr(created_at, 12)",
      ],
      tableName: "tournaments",
    }) ||
    tournamentRegistrationsForeignKeys.some(
      (foreignKey) => foreignKey.table === "tournaments_old",
    ) ||
    tournamentRegistrationsColumns.some(
      (column) => column.name === "registered_at",
    ) ||
    tournamentScoresForeignKeys.some(
      (foreignKey) => foreignKey.table === "tournaments_old",
    ) ||
    tournamentScoresColumns.some((column) => column.name === "submitted_at")
  ) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE tournament_registrations RENAME TO tournament_registrations_old;

      ${tournamentRegistrationsTableSql.trim()};

      INSERT INTO tournament_registrations (
        tournament_id,
        member_username,
        registered_at_date,
        registered_at_time
      )
      SELECT
        tournament_id,
        member_username,
        substr(registered_at, 1, 10),
        substr(registered_at, 12)
      FROM tournament_registrations_old;

      DROP TABLE tournament_registrations_old;

      ALTER TABLE tournament_scores RENAME TO tournament_scores_old;

      ${tournamentScoresTableSql.trim()};

      INSERT INTO tournament_scores (
        tournament_id,
        round_number,
        member_username,
        score,
        submitted_at_date,
        submitted_at_time
      )
      SELECT
        tournament_id,
        round_number,
        member_username,
        score,
        substr(submitted_at, 1, 10),
        substr(submitted_at, 12)
      FROM tournament_scores_old;

      DROP TABLE tournament_scores_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);
  }
}
