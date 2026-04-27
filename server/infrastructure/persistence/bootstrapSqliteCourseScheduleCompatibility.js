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
