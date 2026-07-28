import { getDefaultGeneralInfoContent } from "../../../shared/generalInfoDefaults.js";
import { getDefaultRangeRulesContent } from "../../../shared/rangeRulesDefaults.js";

export const LOGIN_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    login_method TEXT NOT NULL CHECK (login_method IN ('password', 'password-mobile', 'rfid', 'mobile-app')),
    logged_in_date TEXT NOT NULL,
    logged_in_time TEXT NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username)
  )
`;

export const GUEST_LOGIN_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS guest_login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    archery_gb_membership_number TEXT NOT NULL,
    invited_by_username TEXT,
    invited_by_name TEXT,
    logged_in_date TEXT NOT NULL,
    logged_in_time TEXT NOT NULL,
    FOREIGN KEY (invited_by_username) REFERENCES users(username)
  )
`;

export const COACHING_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS coaching_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_username TEXT NOT NULL,
    session_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    available_slots INTEGER NOT NULL DEFAULT 1,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    venue TEXT NOT NULL CHECK (venue IN ('indoor', 'outdoor', 'both')),
    approval_status TEXT NOT NULL DEFAULT 'approved',
    rejection_reason TEXT,
    approved_by_username TEXT,
    approved_at_date TEXT,
    approved_at_time TEXT,
    created_at_date TEXT NOT NULL,
    created_at_time TEXT NOT NULL,
    FOREIGN KEY (coach_username) REFERENCES users(username),
    FOREIGN KEY (approved_by_username) REFERENCES users(username)
  )
`;

export const COACHING_SESSION_BOOKINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS coaching_session_bookings (
    coaching_session_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    booked_at_date TEXT NOT NULL,
    booked_at_time TEXT NOT NULL,
    PRIMARY KEY (coaching_session_id, member_username),
    FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`;

export const CLUB_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS club_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    type TEXT NOT NULL CHECK (type IN ('competition', 'social', 'range-closed')),
    types TEXT,
    venue TEXT NOT NULL DEFAULT 'both' CHECK (venue IN ('indoor', 'outdoor', 'both')),
    submitted_by_username TEXT,
    approval_status TEXT NOT NULL DEFAULT 'approved',
    rejection_reason TEXT,
    approved_by_username TEXT,
    approved_at_date TEXT,
    approved_at_time TEXT,
    created_at_date TEXT NOT NULL,
    created_at_time TEXT NOT NULL,
    FOREIGN KEY (submitted_by_username) REFERENCES users(username),
    FOREIGN KEY (approved_by_username) REFERENCES users(username)
  )
`;

export const EVENT_BOOKINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS event_bookings (
    club_event_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    booked_at_date TEXT NOT NULL,
    booked_at_time TEXT NOT NULL,
    PRIMARY KEY (club_event_id, member_username),
    FOREIGN KEY (club_event_id) REFERENCES club_events(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`;

export const GENERAL_INFO_CONTENT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS general_info_content (
    content_key TEXT PRIMARY KEY,
    intro_paragraphs_json TEXT NOT NULL,
    quick_facts_json TEXT NOT NULL,
    facilities_json TEXT NOT NULL,
    beginners_json TEXT NOT NULL,
    club_life_json TEXT NOT NULL,
    updated_at_date TEXT NOT NULL,
    updated_at_time TEXT NOT NULL,
    updated_by_username TEXT,
    FOREIGN KEY (updated_by_username) REFERENCES users(username)
  )
`;

export const TOURNAMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tournament_type TEXT NOT NULL,
    registration_start_date TEXT NOT NULL,
    registration_end_date TEXT NOT NULL,
    score_submission_start_date TEXT NOT NULL,
    score_submission_end_date TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at_date TEXT NOT NULL,
    created_at_time TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(username)
  )
`;

export const TOURNAMENT_REGISTRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tournament_registrations (
    tournament_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    registered_at_date TEXT NOT NULL,
    registered_at_time TEXT NOT NULL,
    PRIMARY KEY (tournament_id, member_username),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`;

export const TOURNAMENT_SCORES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tournament_scores (
    tournament_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    score INTEGER NOT NULL,
    submitted_at_date TEXT NOT NULL,
    submitted_at_time TEXT NOT NULL,
    PRIMARY KEY (tournament_id, round_number, member_username),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`;

export function bootstrapSqliteBaseSchema({
  db,
  defaultEquipmentCupboardLabel,
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      gr_id TEXT,
      archery_gb_membership_number TEXT,
      email_address TEXT,
      password TEXT,
      rfid_tag TEXT UNIQUE,
      active_member INTEGER NOT NULL DEFAULT 1,
      affiliate_member INTEGER NOT NULL DEFAULT 0,
      junior_member INTEGER NOT NULL DEFAULT 0,
      membership_fees_due TEXT,
      coaching_volunteer INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(LOGIN_EVENTS_TABLE_SQL);

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_username TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      metadata_json TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      FOREIGN KEY (actor_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      role_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      permission_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_key TEXT NOT NULL,
      permission_key TEXT NOT NULL,
      PRIMARY KEY (role_key, permission_key),
      FOREIGN KEY (role_key) REFERENCES roles(role_key),
      FOREIGN KEY (permission_key) REFERENCES permissions(permission_key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      active_from_date TEXT NOT NULL,
      active_till_date TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (
        severity IN ('information', 'urgent', 'urgent_important')
      ),
      message TEXT NOT NULL,
      escalate_severity INTEGER NOT NULL DEFAULT 0,
      created_by_username TEXT NOT NULL,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      FOREIGN KEY (created_by_username) REFERENCES users(username)
    )
  `);

  const announcementColumns = db.prepare(`PRAGMA table_info(announcements)`).all();

  if (!announcementColumns.some((column) => column.name === "amended_by_username")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN amended_by_username TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "amended_at_date")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN amended_at_date TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "amended_at_time")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN amended_at_time TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "deleted_by_username")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN deleted_by_username TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "deleted_at_date")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN deleted_at_date TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "deleted_at_time")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN deleted_at_time TEXT`);
  }

  if (!announcementColumns.some((column) => column.name === "is_deleted")) {
    db.exec(`ALTER TABLE announcements ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_seen_members (
      announcement_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      seen_at_date TEXT NOT NULL,
      seen_at_time TEXT NOT NULL,
      PRIMARY KEY (announcement_id, username),
      FOREIGN KEY (announcement_id) REFERENCES announcements(id),
      FOREIGN KEY (username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submitted_by_username TEXT,
      submitted_by_name TEXT NOT NULL DEFAULT 'Anonymous',
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      suggestion_title TEXT NOT NULL,
      improvement_text TEXT NOT NULL,
      suggestion_details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT,
      FOREIGN KEY (submitted_by_username) REFERENCES users(username),
      FOREIGN KEY (updated_by_username) REFERENCES users(username)
    )
  `);

  const suggestionColumns = db.prepare(`PRAGMA table_info(suggestions)`).all();

  if (!suggestionColumns.some((column) => column.name === "resolution_note")) {
    db.exec(`ALTER TABLE suggestions ADD COLUMN resolution_note TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS range_rules_content (
      content_key TEXT PRIMARY KEY,
      indoor_rules_json TEXT NOT NULL,
      outdoor_rules_json TEXT NOT NULL,
      outdoor_lane_rules_json TEXT NOT NULL,
      updated_at_date TEXT NOT NULL,
      updated_at_time TEXT NOT NULL,
      updated_by_username TEXT,
      FOREIGN KEY (updated_by_username) REFERENCES users(username)
    )
  `);

  db.exec(GENERAL_INFO_CONTENT_TABLE_SQL);

  const defaultRangeRulesContent = getDefaultRangeRulesContent();

  db.prepare(`
    INSERT OR IGNORE INTO range_rules_content (
      content_key,
      indoor_rules_json,
      outdoor_rules_json,
      outdoor_lane_rules_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "default",
    JSON.stringify(defaultRangeRulesContent.indoorRules),
    JSON.stringify(defaultRangeRulesContent.outdoorRules),
    JSON.stringify(defaultRangeRulesContent.outdoorLaneRules),
    "1970-01-01",
    "00:00:00.000Z",
    null,
  );

  db.prepare(`
    UPDATE range_rules_content
    SET
      indoor_rules_json = ?,
      outdoor_rules_json = ?,
      outdoor_lane_rules_json = ?
    WHERE content_key = ?
      AND updated_at_date = ?
      AND updated_at_time = ?
      AND updated_by_username IS NULL
  `).run(
    JSON.stringify(defaultRangeRulesContent.indoorRules),
    JSON.stringify(defaultRangeRulesContent.outdoorRules),
    JSON.stringify(defaultRangeRulesContent.outdoorLaneRules),
    "default",
    "1970-01-01",
    "00:00:00.000Z",
  );

  const defaultGeneralInfoContent = getDefaultGeneralInfoContent();

  db.prepare(`
    INSERT OR IGNORE INTO general_info_content (
      content_key,
      intro_paragraphs_json,
      quick_facts_json,
      facilities_json,
      beginners_json,
      club_life_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "default",
    JSON.stringify(defaultGeneralInfoContent.introParagraphs),
    JSON.stringify(defaultGeneralInfoContent.quickFacts),
    JSON.stringify(defaultGeneralInfoContent.facilities),
    JSON.stringify(defaultGeneralInfoContent.beginners),
    JSON.stringify(defaultGeneralInfoContent.clubLife),
    "1970-01-01",
    "00:00:00.000Z",
    null,
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_types (
      username TEXT PRIMARY KEY,
      user_type TEXT NOT NULL,
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (user_type) REFERENCES roles(role_key)
    )
  `);

  db.exec(GUEST_LOGIN_EVENTS_TABLE_SQL);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_disciplines (
      username TEXT NOT NULL,
      discipline TEXT NOT NULL CHECK (
        discipline IN (
          'Long Bow',
          'Bare Bow',
          'Recurve Bow',
          'Compound Bow'
        )
      ),
      PRIMARY KEY (username, discipline),
      FOREIGN KEY (username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS member_distance_sign_offs (
      username TEXT NOT NULL,
      discipline TEXT NOT NULL CHECK (
        discipline IN (
          'Long Bow',
          'Bare Bow',
          'Recurve Bow',
          'Compound Bow'
        )
      ),
      distance_yards INTEGER NOT NULL CHECK (
        distance_yards IN (20, 30, 40, 50, 60, 80, 100)
      ),
      signed_off_by_username TEXT NOT NULL,
      signed_off_at_date TEXT NOT NULL,
      signed_off_at_time TEXT NOT NULL,
      PRIMARY KEY (username, discipline, distance_yards),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (signed_off_by_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS member_loan_bows (
      username TEXT PRIMARY KEY,
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
      FOREIGN KEY (username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lost_arrows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archer_username TEXT NOT NULL,
      date_lost TEXT NOT NULL,
      arrow_material TEXT NOT NULL CHECK (
        arrow_material IN ('aluminium', 'carbon', 'wood')
      ),
      arrow_colour TEXT NOT NULL,
      arrow_identifier TEXT NOT NULL,
      fletching_colour_1 TEXT NOT NULL,
      fletching_colour_2 TEXT NOT NULL,
      fletching_colour_3 TEXT,
      nock_colour TEXT NOT NULL,
      target_distance TEXT NOT NULL,
      lane_number INTEGER NOT NULL CHECK (lane_number BETWEEN 1 AND 11),
      other_details TEXT,
      date_found TEXT,
      found_by_username TEXT,
      found_seen_at_date TEXT,
      found_seen_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      FOREIGN KEY (archer_username) REFERENCES users(username),
      FOREIGN KEY (found_by_username) REFERENCES users(username)
    )
  `);

  let lostArrowColumns = db.prepare(`PRAGMA table_info(lost_arrows)`).all();
  const lostArrowTableSchema = db
    .prepare(
      `
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'lost_arrows'
      `,
    )
    .get();

  const lostArrowsRequiresMigration =
    !lostArrowColumns.some((column) => column.name === "fletching_colour_3") ||
    !String(lostArrowTableSchema?.sql ?? "").includes(
      "arrow_material IN ('aluminium', 'carbon', 'wood')",
    );

  if (lostArrowsRequiresMigration) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE lost_arrows RENAME TO lost_arrows_old;

      CREATE TABLE lost_arrows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archer_username TEXT NOT NULL,
        date_lost TEXT NOT NULL,
        arrow_material TEXT NOT NULL CHECK (
          arrow_material IN ('aluminium', 'carbon', 'wood')
        ),
        arrow_colour TEXT NOT NULL,
        arrow_identifier TEXT NOT NULL,
        fletching_colour_1 TEXT NOT NULL,
        fletching_colour_2 TEXT NOT NULL,
        fletching_colour_3 TEXT,
        nock_colour TEXT NOT NULL,
        target_distance TEXT NOT NULL,
        lane_number INTEGER NOT NULL CHECK (lane_number BETWEEN 1 AND 11),
        other_details TEXT,
        date_found TEXT,
        found_by_username TEXT,
        found_seen_at_date TEXT,
        found_seen_at_time TEXT,
        created_at_date TEXT NOT NULL,
        created_at_time TEXT NOT NULL,
        FOREIGN KEY (archer_username) REFERENCES users(username),
        FOREIGN KEY (found_by_username) REFERENCES users(username)
      );

      INSERT INTO lost_arrows (
        id,
        archer_username,
        date_lost,
        arrow_material,
        arrow_colour,
        arrow_identifier,
        fletching_colour_1,
        fletching_colour_2,
        fletching_colour_3,
        nock_colour,
        target_distance,
        lane_number,
        other_details,
        date_found,
        found_by_username,
        found_seen_at_date,
        found_seen_at_time,
        created_at_date,
        created_at_time
      )
      SELECT
        id,
        archer_username,
        date_lost,
        arrow_material,
        arrow_colour,
        arrow_identifier,
        fletching_colour_1,
        fletching_colour_2,
        NULL,
        nock_colour,
        target_distance,
        lane_number,
        other_details,
        date_found,
        found_by_username,
        found_seen_at_date,
        found_seen_at_time,
        created_at_date,
        created_at_time
      FROM lost_arrows_old;

      DROP TABLE lost_arrows_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);

    lostArrowColumns = db.prepare(`PRAGMA table_info(lost_arrows)`).all();
  }

  if (!lostArrowColumns.some((column) => column.name === "found_seen_at_date")) {
    db.exec(`ALTER TABLE lost_arrows ADD COLUMN found_seen_at_date TEXT`);
  }

  if (!lostArrowColumns.some((column) => column.name === "found_seen_at_time")) {
    db.exec(`ALTER TABLE lost_arrows ADD COLUMN found_seen_at_time TEXT`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS outdoor_table_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season_year INTEGER NOT NULL,
      archer_username TEXT NOT NULL,
      bow_type TEXT NOT NULL,
      handicap INTEGER,
      archer_3rd INTEGER NOT NULL DEFAULT 0,
      archer_2nd INTEGER NOT NULL DEFAULT 0,
      archer_1st INTEGER NOT NULL DEFAULT 0,
      bowman_3rd INTEGER NOT NULL DEFAULT 0,
      bowman_2nd INTEGER NOT NULL DEFAULT 0,
      bowman_1st INTEGER NOT NULL DEFAULT 0,
      master_bowman INTEGER NOT NULL DEFAULT 0,
      grand_master_bowman INTEGER NOT NULL DEFAULT 0,
      elite_master_bowman INTEGER NOT NULL DEFAULT 0,
      archer_3rd_date TEXT NOT NULL DEFAULT '',
      archer_2nd_date TEXT NOT NULL DEFAULT '',
      archer_1st_date TEXT NOT NULL DEFAULT '',
      bowman_3rd_date TEXT NOT NULL DEFAULT '',
      bowman_2nd_date TEXT NOT NULL DEFAULT '',
      bowman_1st_date TEXT NOT NULL DEFAULT '',
      master_bowman_date TEXT NOT NULL DEFAULT '',
      grand_master_bowman_date TEXT NOT NULL DEFAULT '',
      elite_master_bowman_date TEXT NOT NULL DEFAULT '',
      award_252_20 INTEGER NOT NULL DEFAULT 0,
      award_252_30 INTEGER NOT NULL DEFAULT 0,
      award_252_40 INTEGER NOT NULL DEFAULT 0,
      award_252_50 INTEGER NOT NULL DEFAULT 0,
      award_252_60 INTEGER NOT NULL DEFAULT 0,
      award_252_80 INTEGER NOT NULL DEFAULT 0,
      award_252_100 INTEGER NOT NULL DEFAULT 0,
      award_252_20_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_30_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_40_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_50_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_60_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_80_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      award_252_100_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]',
      clout_white_20 INTEGER NOT NULL DEFAULT 0,
      clout_white_30 INTEGER NOT NULL DEFAULT 0,
      clout_white_40 INTEGER NOT NULL DEFAULT 0,
      clout_white_50 INTEGER NOT NULL DEFAULT 0,
      clout_white_60 INTEGER NOT NULL DEFAULT 0,
      clout_white_70_80 INTEGER NOT NULL DEFAULT 0,
      clout_white_90_100 INTEGER NOT NULL DEFAULT 0,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT,
      UNIQUE (season_year, archer_username, bow_type),
      FOREIGN KEY (archer_username) REFERENCES users(username),
      FOREIGN KEY (updated_by_username) REFERENCES users(username)
    )
  `);

  const outdoorTableColumns = db.prepare(`PRAGMA table_info(outdoor_table_entries)`).all();

  if (!outdoorTableColumns.some((column) => column.name === "award_252_20_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_20_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_30_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_30_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_40_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_40_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_50_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_50_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_60_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_60_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_80_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_80_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "award_252_100_sign_off_dates")) {
    db.exec(
      `ALTER TABLE outdoor_table_entries ADD COLUMN award_252_100_sign_off_dates TEXT NOT NULL DEFAULT '["","",""]'`,
    );
  }

  if (!outdoorTableColumns.some((column) => column.name === "archer_3rd_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN archer_3rd_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "archer_2nd_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN archer_2nd_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "archer_1st_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN archer_1st_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "bowman_3rd_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN bowman_3rd_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "bowman_2nd_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN bowman_2nd_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "bowman_1st_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN bowman_1st_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "master_bowman_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN master_bowman_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "grand_master_bowman_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN grand_master_bowman_date TEXT NOT NULL DEFAULT ''`);
  }
  if (!outdoorTableColumns.some((column) => column.name === "elite_master_bowman_date")) {
    db.exec(`ALTER TABLE outdoor_table_entries ADD COLUMN elite_master_bowman_date TEXT NOT NULL DEFAULT ''`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS golden_records_member_sync (
      username TEXT PRIMARY KEY REFERENCES users(username),
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      fetched_at TEXT NOT NULL DEFAULT '',
      synced_at_date TEXT NOT NULL,
      synced_at_time TEXT NOT NULL,
      updated_by_username TEXT REFERENCES users(username)
    )
  `);

  db.exec(COACHING_SESSIONS_TABLE_SQL);
  db.exec(COACHING_SESSION_BOOKINGS_TABLE_SQL);
  db.exec(CLUB_EVENTS_TABLE_SQL);
  db.exec(EVENT_BOOKINGS_TABLE_SQL);
  db.exec(TOURNAMENTS_TABLE_SQL);
  db.exec(TOURNAMENT_REGISTRATIONS_TABLE_SQL);
  db.exec(TOURNAMENT_SCORES_TABLE_SQL);

  db.exec(`
    CREATE TABLE IF NOT EXISTS committee_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      assigned_username TEXT,
      FOREIGN KEY (assigned_username) REFERENCES users(username)
    )
  `);

  const committeeRoleColumns = db.prepare(`PRAGMA table_info(committee_roles)`).all();

  if (!committeeRoleColumns.some((column) => column.name === "responsibilities")) {
    db.exec(`ALTER TABLE committee_roles ADD COLUMN responsibilities TEXT`);
  }

  if (!committeeRoleColumns.some((column) => column.name === "personal_blurb")) {
    db.exec(`ALTER TABLE committee_roles ADD COLUMN personal_blurb TEXT`);
  }

  if (!committeeRoleColumns.some((column) => column.name === "photo_data_url")) {
    db.exec(`ALTER TABLE committee_roles ADD COLUMN photo_data_url TEXT`);
  }

  db.exec(`
    UPDATE committee_roles
    SET responsibilities = summary
    WHERE responsibilities IS NULL OR trim(responsibilities) = ''
  `);

  db.exec(`
    UPDATE committee_roles
    SET personal_blurb = ''
    WHERE personal_blurb IS NULL
  `);

  db.exec(`
    UPDATE committee_roles
    SET photo_data_url = NULL
    WHERE photo_data_url IS NOT NULL AND trim(photo_data_url) = ''
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_type TEXT NOT NULL CHECK (
        equipment_type IN (
          'case',
          'riser',
          'limb',
          'quiver',
          'sight',
          'long_rod',
          'arm_guard',
          'chest_guard',
          'finger_tab',
          'arrows'
        )
      ),
      item_number TEXT,
      size_category TEXT NOT NULL DEFAULT 'standard' CHECK (
        size_category IN ('standard', 'junior')
      ),
      arrow_length INTEGER,
      arrow_quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'decommissioned')
      ),
      location_type TEXT NOT NULL DEFAULT 'cupboard' CHECK (
        location_type IN ('cupboard', 'case', 'member')
      ),
      location_label TEXT,
      location_case_id INTEGER,
      location_member_username TEXT,
      added_by_username TEXT NOT NULL,
      added_at_date TEXT NOT NULL,
      added_at_time TEXT NOT NULL,
      decommissioned_by_username TEXT,
      decommissioned_at_date TEXT,
      decommissioned_at_time TEXT,
      decommission_reason TEXT,
      last_assignment_by_username TEXT,
      last_assignment_at_date TEXT,
      last_assignment_at_time TEXT,
      last_storage_updated_by_username TEXT,
      last_storage_updated_at_date TEXT,
      last_storage_updated_at_time TEXT,
      FOREIGN KEY (location_case_id) REFERENCES equipment_items(id),
      FOREIGN KEY (location_member_username) REFERENCES users(username),
      FOREIGN KEY (added_by_username) REFERENCES users(username),
      FOREIGN KEY (decommissioned_by_username) REFERENCES users(username),
      FOREIGN KEY (last_assignment_by_username) REFERENCES users(username),
      FOREIGN KEY (last_storage_updated_by_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_item_id INTEGER NOT NULL,
      member_username TEXT NOT NULL,
      loaned_by_username TEXT NOT NULL,
      loaned_at_date TEXT NOT NULL,
      loaned_at_time TEXT NOT NULL,
      loan_context_case_id INTEGER,
      returned_by_username TEXT,
      returned_at_date TEXT,
      returned_at_time TEXT,
      return_location_type TEXT CHECK (
        return_location_type IN ('cupboard', 'case')
      ),
      return_location_label TEXT,
      return_case_id INTEGER,
      FOREIGN KEY (equipment_item_id) REFERENCES equipment_items(id),
      FOREIGN KEY (member_username) REFERENCES users(username),
      FOREIGN KEY (loaned_by_username) REFERENCES users(username),
      FOREIGN KEY (loan_context_case_id) REFERENCES equipment_items(id),
      FOREIGN KEY (returned_by_username) REFERENCES users(username),
      FOREIGN KEY (return_case_id) REFERENCES equipment_items(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS equipment_storage_locations (
      label TEXT PRIMARY KEY,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL
    )
  `);

  db.prepare(`
    INSERT OR IGNORE INTO equipment_storage_locations (
      label,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?)
  `).run(defaultEquipmentCupboardLabel, "1970-01-01", "00:00:00.000Z");

  db.prepare(`
    INSERT OR IGNORE INTO equipment_storage_locations (
      label,
      created_at_date,
      created_at_time
    )
    SELECT DISTINCT
      trim(location_label),
      '1970-01-01',
      '00:00:00.000Z'
    FROM equipment_items
    WHERE location_type = 'cupboard'
      AND location_label IS NOT NULL
      AND trim(location_label) <> ''
  `).run();

  db.exec(`
    CREATE TABLE IF NOT EXISTS beginners_courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_type TEXT NOT NULL DEFAULT 'beginners' CHECK (
        course_type IN ('beginners', 'have-a-go')
      ),
      coordinator_username TEXT NOT NULL,
      submitted_by_username TEXT NOT NULL,
      first_lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      lesson_count INTEGER NOT NULL,
      beginner_capacity INTEGER NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        approval_status IN ('pending', 'approved', 'rejected')
      ),
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      cancellation_reason TEXT,
      cancelled_by_username TEXT,
      cancelled_at_date TEXT,
      cancelled_at_time TEXT,
      rejection_reason TEXT,
      approved_by_username TEXT,
      approved_at_date TEXT,
      approved_at_time TEXT,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      FOREIGN KEY (coordinator_username) REFERENCES users(username),
      FOREIGN KEY (submitted_by_username) REFERENCES users(username),
      FOREIGN KEY (approved_by_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS beginners_course_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      lesson_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      UNIQUE (course_id, lesson_number),
      FOREIGN KEY (course_id) REFERENCES beginners_courses(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS beginners_course_participants (
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
      FOREIGN KEY (course_id) REFERENCES beginners_courses(id),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (assigned_case_id) REFERENCES equipment_items(id),
      FOREIGN KEY (assigned_case_by_username) REFERENCES users(username),
      FOREIGN KEY (created_by_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS beginners_course_lesson_coaches (
      lesson_id INTEGER NOT NULL,
      coach_username TEXT NOT NULL,
      assigned_by_username TEXT NOT NULL,
      assigned_at_date TEXT NOT NULL,
      assigned_at_time TEXT NOT NULL,
      PRIMARY KEY (lesson_id, coach_username),
      FOREIGN KEY (lesson_id) REFERENCES beginners_course_lessons(id),
      FOREIGN KEY (coach_username) REFERENCES users(username),
      FOREIGN KEY (assigned_by_username) REFERENCES users(username)
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS equipment_items_unique_number
    ON equipment_items (equipment_type, size_category, item_number)
    WHERE item_number IS NOT NULL AND status = 'active'
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS equipment_loans_one_open_loan
    ON equipment_loans (equipment_item_id)
    WHERE returned_at_date IS NULL
  `);

  const userTypesTableSchema = db
    .prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'user_types'
    `)
    .get();

  const userTypesRequiresMigration =
    userTypesTableSchema?.sql &&
    (userTypesTableSchema.sql.includes("CHECK (user_type IN") ||
      !userTypesTableSchema.sql.includes("REFERENCES roles(role_key)"));

  if (userTypesRequiresMigration) {
    db.exec(`
      PRAGMA foreign_keys = OFF;

      BEGIN TRANSACTION;

      ALTER TABLE user_types RENAME TO user_types_old;

      CREATE TABLE user_types (
        username TEXT PRIMARY KEY,
        user_type TEXT NOT NULL,
        FOREIGN KEY (username) REFERENCES users(username),
        FOREIGN KEY (user_type) REFERENCES roles(role_key)
      );

      INSERT INTO user_types (username, user_type)
      SELECT username, user_type
      FROM user_types_old;

      DROP TABLE user_types_old;

      COMMIT;

      PRAGMA foreign_keys = ON;
    `);
  }
}
