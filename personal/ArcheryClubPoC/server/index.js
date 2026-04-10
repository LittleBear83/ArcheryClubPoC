import express from "express";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.join(__dirname, "data");
const exportsDirectory = path.join(dataDirectory, "exports");
const databasePath = path.join(dataDirectory, "auth.sqlite");
const distDirectory = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 3001);
const PERMISSIONS = {
  MANAGE_MEMBERS: "manage_members",
  MANAGE_ROLES_PERMISSIONS: "manage_roles_permissions",
  MANAGE_COMMITTEE_ROLES: "manage_committee_roles",
  ADD_EVENTS: "add_events",
  APPROVE_EVENTS: "approve_events",
  CANCEL_EVENTS: "cancel_events",
  ADD_COACHING_SESSIONS: "add_coaching_sessions",
  APPROVE_COACHING_SESSIONS: "approve_coaching_sessions",
  MANAGE_LOAN_BOWS: "manage_loan_bows",
  MANAGE_TOURNAMENTS: "manage_tournaments",
};
const DEACTIVATED_RFID_SUFFIX = "-deactivated";
const RFID_READER_NAMES = [
  process.env.RFID_READER_NAME,
  "ACS ACR122U PICC Interface 0",
  "ACS ACR122 0",
  "ACR122 Smart Card Reader",
].filter(Boolean);
const PERMISSION_DEFINITIONS = [
  {
    key: PERMISSIONS.MANAGE_MEMBERS,
    label: "Manage Members",
    description: "Create and update member profiles.",
  },
  {
    key: PERMISSIONS.MANAGE_ROLES_PERMISSIONS,
    label: "Manage Roles And Permissions",
    description: "Create roles and assign permission sets.",
  },
  {
    key: PERMISSIONS.MANAGE_COMMITTEE_ROLES,
    label: "Manage Committee Roles",
    description: "Assign members to committee positions.",
  },
  {
    key: PERMISSIONS.ADD_EVENTS,
    label: "Add Events",
    description: "Create events and competitions.",
  },
  {
    key: PERMISSIONS.APPROVE_EVENTS,
    label: "Approve Events",
    description: "Approve submitted events and competitions.",
  },
  {
    key: PERMISSIONS.CANCEL_EVENTS,
    label: "Cancel Events",
    description: "Cancel published or pending events.",
  },
  {
    key: PERMISSIONS.ADD_COACHING_SESSIONS,
    label: "Add Coaching Sessions",
    description: "Create and cancel coaching sessions.",
  },
  {
    key: PERMISSIONS.APPROVE_COACHING_SESSIONS,
    label: "Approve Coaching Sessions",
    description: "Approve submitted coaching sessions.",
  },
  {
    key: PERMISSIONS.MANAGE_LOAN_BOWS,
    label: "Manage Loan Bows",
    description: "Update loan bow records and returns.",
  },
  {
    key: PERMISSIONS.MANAGE_TOURNAMENTS,
    label: "Manage Tournaments",
    description: "Create, amend, and delete tournaments.",
  },
];
const CURRENT_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map(
  (permission) => permission.key,
);
const CURRENT_PERMISSION_KEY_SET = new Set(CURRENT_PERMISSION_KEYS);
const CURRENT_PERMISSION_SQL_PLACEHOLDERS = CURRENT_PERMISSION_KEYS
  .map(() => "?")
  .join(", ");
const SYSTEM_ROLE_DEFINITIONS = [
  {
    roleKey: "general",
    title: "General",
    permissions: [],
  },
  {
    roleKey: "admin",
    title: "Admin",
    permissions: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  },
  {
    roleKey: "developer",
    title: "Developer",
    permissions: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  },
  {
    roleKey: "coach",
    title: "Coach",
    permissions: [
      PERMISSIONS.ADD_COACHING_SESSIONS,
      PERMISSIONS.MANAGE_LOAN_BOWS,
    ],
  },
];
const ALLOWED_DISCIPLINES = [
  "Long Bow",
  "Flat Bow",
  "Bare Bow",
  "Recurve Bow",
  "Compound Bow",
];
const DEFAULT_LOAN_ARROW_COUNT = 6;
const DEFAULT_EVENT_DURATION_MINUTES = 60;
const TOURNAMENT_TYPE_OPTIONS = [
  { value: "portsmouth", label: "Portsmouth" },
  { value: "wa720", label: "WA 720" },
  { value: "head-to-head", label: "Head-to-head Knockout" },
];
const COMMITTEE_ROLE_SEED = [
  {
    roleKey: "chairman",
    title: "Chairman",
    summary:
      "Leads the committee, chairs meetings, and sets the club direction.",
    displayOrder: 1,
  },
  {
    roleKey: "captain",
    title: "Captain",
    summary:
      "Leads shooting activities, represents members on the shooting line, and supports club standards.",
    displayOrder: 2,
  },
  {
    roleKey: "vice-captain",
    title: "Vice Captain",
    summary:
      "Supports the captain and steps in when the captain is unavailable.",
    displayOrder: 3,
  },
  {
    roleKey: "secretary",
    title: "Secretary",
    summary:
      "Manages committee records, meeting notes, and club correspondence.",
    displayOrder: 4,
  },
  {
    roleKey: "treasurer",
    title: "Treasurer",
    summary:
      "Oversees finances, budgets, fee tracking, and financial reporting.",
    displayOrder: 5,
  },
  {
    roleKey: "membership-secretary",
    title: "Membership Secretary",
    summary:
      "Looks after member records, renewals, and new member administration.",
    displayOrder: 6,
  },
  {
    roleKey: "records-officer",
    title: "Records Officer",
    summary:
      "Maintains club records, scores, classifications, and achievement history.",
    displayOrder: 7,
  },
  {
    roleKey: "tournament-officer",
    title: "Tournament Officer",
    summary:
      "Coordinates tournaments, entries, fixtures, and competition logistics.",
    displayOrder: 8,
  },
  {
    roleKey: "safeguarding-officer",
    title: "Safeguarding Officer",
    summary:
      "Supports welfare, safeguarding processes, and member wellbeing matters.",
    displayOrder: 9,
  },
  {
    roleKey: "equipment-officer",
    title: "Equipment Officer",
    summary:
      "Oversees club equipment, maintenance, and issue or return processes.",
    displayOrder: 10,
  },
  {
    roleKey: "coaching-representative",
    title: "Coaching Representative",
    summary:
      "Represents coaching activity, development pathways, and training needs.",
    displayOrder: 11,
  },
  {
    roleKey: "ordinary-committee-member",
    title: "Ordinary Committee Member",
    summary:
      "Supports committee decisions and contributes to club governance tasks.",
    displayOrder: 12,
  },
  {
    roleKey: "associate-member",
    title: "Associate Member",
    summary:
      "Attends in a supporting capacity and contributes where invited by the committee.",
    displayOrder: 13,
  },
];

mkdirSync(dataDirectory, { recursive: true });
mkdirSync(exportsDirectory, { recursive: true });

const db = new Database(databasePath);
const LOGIN_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    login_method TEXT NOT NULL CHECK (login_method IN ('password', 'rfid')),
    logged_in_date TEXT NOT NULL,
    logged_in_time TEXT NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username)
  )
`;
const GUEST_LOGIN_EVENTS_TABLE_SQL = `
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
const COACHING_SESSIONS_TABLE_SQL = `
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
const COACHING_SESSION_BOOKINGS_TABLE_SQL = `
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
const CLUB_EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS club_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    type TEXT NOT NULL CHECK (type IN ('competition', 'social', 'range-closed')),
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
const EVENT_BOOKINGS_TABLE_SQL = `
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
const TOURNAMENTS_TABLE_SQL = `
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
const TOURNAMENT_REGISTRATIONS_TABLE_SQL = `
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
const TOURNAMENT_SCORES_TABLE_SQL = `
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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    password TEXT,
    rfid_tag TEXT UNIQUE,
    active_member INTEGER NOT NULL DEFAULT 1,
    membership_fees_due TEXT
  )
`);

db.exec(LOGIN_EVENTS_TABLE_SQL);

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
        'Flat Bow',
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

const userTypesTableSchema = db
  .prepare(
    `
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'user_types'
  `,
  )
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

const upsertRole = db.prepare(`
  INSERT INTO roles (role_key, title, is_system)
  VALUES (@roleKey, @title, @isSystem)
  ON CONFLICT(role_key) DO UPDATE SET
    title = excluded.title,
    is_system = MAX(roles.is_system, excluded.is_system)
`);

const upsertPermissionDefinition = db.prepare(`
  INSERT INTO permissions (permission_key, label, description)
  VALUES (@key, @label, @description)
  ON CONFLICT(permission_key) DO UPDATE SET
    label = excluded.label,
    description = excluded.description
`);

const insertRolePermission = db.prepare(`
  INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
  VALUES (?, ?)
`);

const deleteUnknownRolePermissions = db.prepare(`
  DELETE FROM role_permissions
  WHERE permission_key NOT IN (${CURRENT_PERMISSION_SQL_PLACEHOLDERS})
`);

const deleteUnknownPermissionDefinitions = db.prepare(`
  DELETE FROM permissions
  WHERE permission_key NOT IN (${CURRENT_PERMISSION_SQL_PLACEHOLDERS})
`);

const listDistinctUserTypes = db.prepare(`
  SELECT DISTINCT user_type
  FROM user_types
`);

for (const permission of PERMISSION_DEFINITIONS) {
  upsertPermissionDefinition.run(permission);
}

deleteUnknownRolePermissions.run(...CURRENT_PERMISSION_KEYS);
deleteUnknownPermissionDefinitions.run(...CURRENT_PERMISSION_KEYS);

for (const role of SYSTEM_ROLE_DEFINITIONS) {
  upsertRole.run({
    roleKey: role.roleKey,
    title: role.title,
    isSystem: 1,
  });

  for (const permissionKey of role.permissions) {
    insertRolePermission.run(role.roleKey, permissionKey);
  }
}

for (const row of listDistinctUserTypes.all()) {
  if (!row.user_type || row.user_type === "guest") {
    continue;
  }

  upsertRole.run({
    roleKey: row.user_type,
    title: row.user_type,
    isSystem: 0,
  });
}

function migrateCombinedDateTimeColumn({
  tableName,
  legacyColumnName,
  createTableSql,
  insertColumns,
  selectColumns,
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

migrateCombinedDateTimeColumn({
  tableName: "login_events",
  legacyColumnName: "logged_in_at",
  createTableSql: LOGIN_EVENTS_TABLE_SQL.trim(),
  insertColumns: [
    "id",
    "username",
    "login_method",
    "logged_in_date",
    "logged_in_time",
  ],
  selectColumns: [
    "id",
    "username",
    "login_method",
    "substr(logged_in_at, 1, 10)",
    "substr(logged_in_at, 12)",
  ],
});

migrateCombinedDateTimeColumn({
  tableName: "guest_login_events",
  legacyColumnName: "logged_in_at",
  createTableSql: GUEST_LOGIN_EVENTS_TABLE_SQL.trim(),
  insertColumns: [
    "id",
    "first_name",
    "surname",
    "archery_gb_membership_number",
    "invited_by_username",
    "invited_by_name",
    "logged_in_date",
    "logged_in_time",
  ],
  selectColumns: [
    "id",
    "first_name",
    "surname",
    "archery_gb_membership_number",
    "NULL",
    "NULL",
    "substr(logged_in_at, 1, 10)",
    "substr(logged_in_at, 12)",
  ],
});

const guestLoginEventColumns = db
  .prepare(`PRAGMA table_info(guest_login_events)`)
  .all();

if (
  !guestLoginEventColumns.some(
    (column) => column.name === "invited_by_username",
  )
) {
  db.exec(`ALTER TABLE guest_login_events ADD COLUMN invited_by_username TEXT`);
}

if (
  !guestLoginEventColumns.some((column) => column.name === "invited_by_name")
) {
  db.exec(`ALTER TABLE guest_login_events ADD COLUMN invited_by_name TEXT`);
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

const userColumns = db.prepare(`PRAGMA table_info(users)`).all();
const memberLoanBowColumns = db
  .prepare(`PRAGMA table_info(member_loan_bows)`)
  .all();

const memberLoanBowColumnDefinitions = [
  ["returned_date", "TEXT"],
  ["returned_riser", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_limbs", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_arrows", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_finger_tab", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_string_item", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_arm_guard", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_chest_guard", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_sight", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_long_rod", "INTEGER NOT NULL DEFAULT 0"],
  ["returned_pressure_button", "INTEGER NOT NULL DEFAULT 0"],
];

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

const coachingSessionApprovalColumns = [
  ["approval_status", "TEXT NOT NULL DEFAULT 'approved'"],
  ["rejection_reason", "TEXT"],
  ["approved_by_username", "TEXT"],
  ["approved_at_date", "TEXT"],
  ["approved_at_time", "TEXT"],
];

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

    ${COACHING_SESSIONS_TABLE_SQL.trim()};

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

    ${COACHING_SESSION_BOOKINGS_TABLE_SQL.trim()};

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
    tableName: "club_events",
    legacyColumnName: "created_at",
    createTableSql: CLUB_EVENTS_TABLE_SQL.trim(),
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

    ${EVENT_BOOKINGS_TABLE_SQL.trim()};

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
    tableName: "tournaments",
    legacyColumnName: "created_at",
    createTableSql: TOURNAMENTS_TABLE_SQL.trim(),
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

    ${TOURNAMENT_REGISTRATIONS_TABLE_SQL.trim()};

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

    ${TOURNAMENT_SCORES_TABLE_SQL.trim()};

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

const seedUsers = [
  {
    username: "CLikley",
    firstName: "Chris",
    surname: "Likley",
    password: "qwe",
    rfidTag: null,
    activeMember: true,
    membershipFeesDue: "2026-12-31",
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

const upsertUser = db.prepare(`
  INSERT INTO users (
    username,
    first_name,
    surname,
    password,
    rfid_tag,
    active_member,
    membership_fees_due
  )
  VALUES (
    @username,
    @firstName,
    @surname,
    @password,
    @rfidTag,
    @activeMember,
    @membershipFeesDue
  )
  ON CONFLICT(username) DO UPDATE SET
    first_name = excluded.first_name,
    surname = excluded.surname,
    password = excluded.password,
    rfid_tag = excluded.rfid_tag,
    active_member = excluded.active_member,
    membership_fees_due = excluded.membership_fees_due
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
  INSERT INTO committee_roles (
    role_key,
    title,
    summary,
    display_order,
    assigned_username
  )
  VALUES (
    @roleKey,
    @title,
    @summary,
    @displayOrder,
    NULL
  )
  ON CONFLICT(role_key) DO UPDATE SET
    title = excluded.title,
    summary = excluded.summary,
    display_order = excluded.display_order
`);

const existingUserCount = db
  .prepare(`SELECT COUNT(*) AS count FROM users`)
  .get().count;

if (existingUserCount === 0) {
  for (const user of seedUsers) {
    upsertUser.run({
      ...user,
      activeMember: user.activeMember ? 1 : 0,
    });
    upsertUserType.run(user);
    deleteUserDisciplines.run(user.username);

    for (const discipline of user.disciplines) {
      insertUserDiscipline.run(user.username, discipline);
    }
  }
}

for (const role of COMMITTEE_ROLE_SEED) {
  upsertCommitteeRole.run(role);
}

const findUserByCredentials = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    users.rfid_tag,
    users.active_member,
    users.membership_fees_due,
    user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  WHERE users.username = ? COLLATE NOCASE AND users.password = ?
`);

const findUserByRfid = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    users.rfid_tag,
    users.active_member,
    users.membership_fees_due,
    user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  WHERE users.rfid_tag = ?
`);

const findUserByUsername = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    users.password,
    users.rfid_tag,
    users.active_member,
    users.membership_fees_due,
    user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  WHERE users.username = ? COLLATE NOCASE
`);

const listAllUsers = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    users.rfid_tag,
    users.active_member,
    users.membership_fees_due,
    user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  ORDER BY users.surname ASC, users.first_name ASC
`);

syncAllMemberStatusesWithFees();

const listRoleDefinitions = db.prepare(`
  SELECT
    role_key,
    title,
    is_system
  FROM roles
  ORDER BY is_system DESC, title ASC, role_key ASC
`);

const findRoleDefinitionByKey = db.prepare(`
  SELECT
    role_key,
    title,
    is_system
  FROM roles
  WHERE role_key = ?
`);

const listPermissionDefinitions = db.prepare(`
  SELECT
    permission_key,
    label,
    description
  FROM permissions
  ORDER BY label ASC, permission_key ASC
`);

const listRolePermissionKeysByRoleKey = db.prepare(`
  SELECT
    permission_key
  FROM role_permissions
  WHERE role_key = ?
  ORDER BY permission_key ASC
`);

const deleteRolePermissionsByRoleKey = db.prepare(`
  DELETE FROM role_permissions
  WHERE role_key = ?
`);

const updateRoleDefinition = db.prepare(`
  UPDATE roles
  SET title = ?
  WHERE role_key = ?
`);

const deleteRoleDefinition = db.prepare(`
  DELETE FROM roles
  WHERE role_key = ?
`);

const countUsersByRoleKey = db.prepare(`
  SELECT COUNT(*) AS count
  FROM user_types
  WHERE user_type = ?
`);

const listCommitteeRoles = db.prepare(`
  SELECT
    committee_roles.id,
    committee_roles.role_key,
    committee_roles.title,
    committee_roles.summary,
    committee_roles.display_order,
    committee_roles.assigned_username,
    users.first_name AS assigned_first_name,
    users.surname AS assigned_surname,
    user_types.user_type AS assigned_user_type
  FROM committee_roles
  LEFT JOIN users ON users.username = committee_roles.assigned_username
  LEFT JOIN user_types ON user_types.username = users.username
  ORDER BY committee_roles.display_order ASC, committee_roles.title ASC
`);

const findCommitteeRoleById = db.prepare(`
  SELECT
    id,
    role_key,
    title,
    summary,
    display_order,
    assigned_username
  FROM committee_roles
  WHERE id = ?
`);

const updateCommitteeRoleAssignment = db.prepare(`
  UPDATE committee_roles
  SET assigned_username = ?
  WHERE id = ?
`);

const findLoanBowByUsername = db.prepare(`
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
  WHERE username = ?
`);

const upsertLoanBowByUsername = db.prepare(`
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
    @username,
    @hasLoanBow,
    @dateLoaned,
    @returnedDate,
    @riserNumber,
    @limbsNumber,
    @arrowCount,
    @returnedRiser,
    @returnedLimbs,
    @returnedArrows,
    @fingerTab,
    @returnedFingerTab,
    @stringItem,
    @returnedStringItem,
    @armGuard,
    @returnedArmGuard,
    @chestGuard,
    @returnedChestGuard,
    @sight,
    @returnedSight,
    @longRod,
    @returnedLongRod,
    @pressureButton,
    @returnedPressureButton
  )
  ON CONFLICT(username) DO UPDATE SET
    has_loan_bow = excluded.has_loan_bow,
    date_loaned = excluded.date_loaned,
    returned_date = excluded.returned_date,
    riser_number = excluded.riser_number,
    limbs_number = excluded.limbs_number,
    arrow_count = excluded.arrow_count,
    returned_riser = excluded.returned_riser,
    returned_limbs = excluded.returned_limbs,
    returned_arrows = excluded.returned_arrows,
    finger_tab = excluded.finger_tab,
    returned_finger_tab = excluded.returned_finger_tab,
    string_item = excluded.string_item,
    returned_string_item = excluded.returned_string_item,
    arm_guard = excluded.arm_guard,
    returned_arm_guard = excluded.returned_arm_guard,
    chest_guard = excluded.chest_guard,
    returned_chest_guard = excluded.returned_chest_guard,
    sight = excluded.sight,
    returned_sight = excluded.returned_sight,
    long_rod = excluded.long_rod,
    returned_long_rod = excluded.returned_long_rod,
    pressure_button = excluded.pressure_button,
    returned_pressure_button = excluded.returned_pressure_button
`);

const insertCoachingSession = db.prepare(`
  INSERT INTO coaching_sessions (
    coach_username,
    session_date,
    start_time,
    end_time,
    available_slots,
    topic,
    summary,
    venue,
    approval_status,
    rejection_reason,
    approved_by_username,
    approved_at_date,
    approved_at_time,
    created_at_date,
    created_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listCoachingSessions = db.prepare(`
  SELECT
    coaching_sessions.id,
    coaching_sessions.coach_username,
    coaching_sessions.session_date,
    coaching_sessions.start_time,
    coaching_sessions.end_time,
    coaching_sessions.available_slots,
    coaching_sessions.topic,
    coaching_sessions.summary,
    CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
    coaching_sessions.approval_status,
    coaching_sessions.rejection_reason,
    coaching_sessions.approved_by_username,
    coaching_sessions.approved_at_date || 'T' || coaching_sessions.approved_at_time AS approved_at,
    coaching_sessions.created_at_date || 'T' || coaching_sessions.created_at_time AS created_at,
    users.first_name AS coach_first_name,
    users.surname AS coach_surname
  FROM coaching_sessions
  INNER JOIN users ON users.username = coaching_sessions.coach_username
  ORDER BY coaching_sessions.session_date ASC, coaching_sessions.start_time ASC
`);

const findCoachingSessionById = db.prepare(`
  SELECT
    coaching_sessions.id,
    coaching_sessions.coach_username,
    coaching_sessions.session_date,
    coaching_sessions.start_time,
    coaching_sessions.end_time,
    coaching_sessions.available_slots,
    coaching_sessions.topic,
    coaching_sessions.summary,
    CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
    coaching_sessions.approval_status,
    coaching_sessions.rejection_reason,
    coaching_sessions.approved_by_username,
    coaching_sessions.approved_at_date || 'T' || coaching_sessions.approved_at_time AS approved_at,
    coaching_sessions.created_at_date || 'T' || coaching_sessions.created_at_time AS created_at,
    users.first_name AS coach_first_name,
    users.surname AS coach_surname
  FROM coaching_sessions
  INNER JOIN users ON users.username = coaching_sessions.coach_username
  WHERE coaching_sessions.id = ?
`);

const listBookingsByCoachingSessionId = db.prepare(`
  SELECT
    coaching_session_bookings.coaching_session_id,
    coaching_session_bookings.member_username,
    coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
    users.first_name,
    users.surname
  FROM coaching_session_bookings
  INNER JOIN users ON users.username = coaching_session_bookings.member_username
  WHERE coaching_session_bookings.coaching_session_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const listAllCoachingSessionBookings = db.prepare(`
  SELECT
    coaching_session_bookings.coaching_session_id,
    coaching_session_bookings.member_username,
    coaching_session_bookings.booked_at_date || 'T' || coaching_session_bookings.booked_at_time AS booked_at,
    users.first_name,
    users.surname
  FROM coaching_session_bookings
  INNER JOIN users ON users.username = coaching_session_bookings.member_username
  ORDER BY coaching_session_bookings.coaching_session_id ASC, users.surname ASC, users.first_name ASC
`);

const insertCoachingSessionBooking = db.prepare(`
  INSERT INTO coaching_session_bookings (
    coaching_session_id,
    member_username,
    booked_at_date,
    booked_at_time
  )
  VALUES (?, ?, ?, ?)
`);

const deleteCoachingSessionBooking = db.prepare(`
  DELETE FROM coaching_session_bookings
  WHERE coaching_session_id = ? AND member_username = ?
`);

const deleteBookingsByCoachingSessionId = db.prepare(`
  DELETE FROM coaching_session_bookings
  WHERE coaching_session_id = ?
`);

const deleteCoachingSessionById = db.prepare(`
  DELETE FROM coaching_sessions
  WHERE id = ?
`);

const approveCoachingSessionById = db.prepare(`
  UPDATE coaching_sessions
  SET
    approval_status = 'approved',
    rejection_reason = NULL,
    approved_by_username = ?,
    approved_at_date = ?,
    approved_at_time = ?
  WHERE id = ?
`);

const rejectCoachingSessionById = db.prepare(`
  UPDATE coaching_sessions
  SET
    approval_status = 'rejected',
    rejection_reason = ?,
    approved_by_username = ?,
    approved_at_date = ?,
    approved_at_time = ?
  WHERE id = ?
`);

const findMemberBookings = db.prepare(`
  SELECT
    coaching_sessions.id,
    coaching_sessions.session_date,
    coaching_sessions.start_time,
    coaching_sessions.end_time,
    coaching_sessions.available_slots,
    coaching_sessions.topic,
    coaching_sessions.summary,
    CASE WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(coaching_sessions.venue, '')) = 'both' THEN 'both' ELSE 'indoor' END AS venue,
    coaching_sessions.coach_username,
    users.first_name AS coach_first_name,
    users.surname AS coach_surname
  FROM coaching_session_bookings
  INNER JOIN coaching_sessions
    ON coaching_sessions.id = coaching_session_bookings.coaching_session_id
  INNER JOIN users ON users.username = coaching_sessions.coach_username
  WHERE coaching_session_bookings.member_username = ?
  ORDER BY coaching_sessions.session_date ASC, coaching_sessions.start_time ASC
`);

const listClubEvents = db.prepare(`
  SELECT
    id,
    event_date,
    start_time,
    end_time,
    title,
    details,
    type,
    CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor' ELSE 'both' END AS venue,
    submitted_by_username,
    approval_status,
    rejection_reason,
    approved_by_username,
    created_at_date || 'T' || created_at_time AS created_at,
    approved_at_date || 'T' || approved_at_time AS approved_at
  FROM club_events
  ORDER BY event_date ASC, start_time ASC
`);

const insertClubEvent = db.prepare(`
  INSERT INTO club_events (
    event_date,
    start_time,
    end_time,
    title,
    details,
    type,
    venue,
    submitted_by_username,
    approval_status,
    rejection_reason,
    approved_by_username,
    approved_at_date,
    approved_at_time,
    created_at_date,
    created_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const listTournaments = db.prepare(`
  SELECT
    tournaments.id,
    tournaments.name,
    tournaments.tournament_type,
    tournaments.registration_start_date,
    tournaments.registration_end_date,
    tournaments.score_submission_start_date,
    tournaments.score_submission_end_date,
    tournaments.created_by,
    tournaments.created_at_date || 'T' || tournaments.created_at_time AS created_at,
    users.first_name AS created_by_first_name,
    users.surname AS created_by_surname
  FROM tournaments
  INNER JOIN users ON users.username = tournaments.created_by
  ORDER BY tournaments.registration_start_date DESC, tournaments.created_at_date DESC, tournaments.created_at_time DESC
`);

const findTournamentById = db.prepare(`
  SELECT
    tournaments.id,
    tournaments.name,
    tournaments.tournament_type,
    tournaments.registration_start_date,
    tournaments.registration_end_date,
    tournaments.score_submission_start_date,
    tournaments.score_submission_end_date,
    tournaments.created_by,
    tournaments.created_at_date || 'T' || tournaments.created_at_time AS created_at,
    users.first_name AS created_by_first_name,
    users.surname AS created_by_surname
  FROM tournaments
  INNER JOIN users ON users.username = tournaments.created_by
  WHERE tournaments.id = ?
`);

const insertTournament = db.prepare(`
  INSERT INTO tournaments (
    name,
    tournament_type,
    registration_start_date,
    registration_end_date,
    score_submission_start_date,
    score_submission_end_date,
    created_by,
    created_at_date,
    created_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateTournamentById = db.prepare(`
  UPDATE tournaments
  SET
    name = ?,
    tournament_type = ?,
    registration_start_date = ?,
    registration_end_date = ?,
    score_submission_start_date = ?,
    score_submission_end_date = ?
  WHERE id = ?
`);

const deleteTournamentScoresByTournamentId = db.prepare(`
  DELETE FROM tournament_scores
  WHERE tournament_id = ?
`);

const deleteTournamentRegistrationsByTournamentId = db.prepare(`
  DELETE FROM tournament_registrations
  WHERE tournament_id = ?
`);

const deleteTournamentById = db.prepare(`
  DELETE FROM tournaments
  WHERE id = ?
`);

const listTournamentRegistrationsByTournamentId = db.prepare(`
  SELECT
    tournament_registrations.tournament_id,
    tournament_registrations.member_username,
    tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
    users.first_name,
    users.surname,
    user_types.user_type
  FROM tournament_registrations
  INNER JOIN users ON users.username = tournament_registrations.member_username
  INNER JOIN user_types ON user_types.username = users.username
  WHERE tournament_registrations.tournament_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const listAllTournamentRegistrations = db.prepare(`
  SELECT
    tournament_registrations.tournament_id,
    tournament_registrations.member_username,
    tournament_registrations.registered_at_date || 'T' || tournament_registrations.registered_at_time AS registered_at,
    users.first_name,
    users.surname,
    user_types.user_type
  FROM tournament_registrations
  INNER JOIN users ON users.username = tournament_registrations.member_username
  INNER JOIN user_types ON user_types.username = users.username
  ORDER BY tournament_registrations.tournament_id ASC, users.surname ASC, users.first_name ASC
`);

const insertTournamentRegistration = db.prepare(`
  INSERT INTO tournament_registrations (
    tournament_id,
    member_username,
    registered_at_date,
    registered_at_time
  )
  VALUES (?, ?, ?, ?)
`);

const deleteTournamentRegistration = db.prepare(`
  DELETE FROM tournament_registrations
  WHERE tournament_id = ? AND member_username = ?
`);

const listTournamentScoresByTournamentId = db.prepare(`
  SELECT
    tournament_id,
    round_number,
    member_username,
    score,
    submitted_at_date || 'T' || submitted_at_time AS submitted_at
  FROM tournament_scores
  WHERE tournament_id = ?
  ORDER BY round_number ASC, member_username ASC
`);

const listAllTournamentScores = db.prepare(`
  SELECT
    tournament_id,
    round_number,
    member_username,
    score,
    submitted_at_date || 'T' || submitted_at_time AS submitted_at
  FROM tournament_scores
  ORDER BY tournament_id ASC, round_number ASC, member_username ASC
`);

const upsertTournamentScore = db.prepare(`
  INSERT INTO tournament_scores (
    tournament_id,
    round_number,
    member_username,
    score,
    submitted_at_date,
    submitted_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(tournament_id, round_number, member_username) DO UPDATE SET
    score = excluded.score,
    submitted_at_date = excluded.submitted_at_date,
    submitted_at_time = excluded.submitted_at_time
`);

const listEventBookingsByEventId = db.prepare(`
  SELECT
    event_bookings.club_event_id,
    event_bookings.member_username,
    event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
    users.first_name,
    users.surname
  FROM event_bookings
  INNER JOIN users ON users.username = event_bookings.member_username
  WHERE event_bookings.club_event_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const listAllEventBookings = db.prepare(`
  SELECT
    event_bookings.club_event_id,
    event_bookings.member_username,
    event_bookings.booked_at_date || 'T' || event_bookings.booked_at_time AS booked_at,
    users.first_name,
    users.surname
  FROM event_bookings
  INNER JOIN users ON users.username = event_bookings.member_username
  ORDER BY event_bookings.club_event_id ASC, users.surname ASC, users.first_name ASC
`);

const insertEventBooking = db.prepare(`
  INSERT INTO event_bookings (
    club_event_id,
    member_username,
    booked_at_date,
    booked_at_time
  )
  VALUES (?, ?, ?, ?)
`);

const deleteEventBooking = db.prepare(`
  DELETE FROM event_bookings
  WHERE club_event_id = ? AND member_username = ?
`);

const deleteBookingsByEventId = db.prepare(`
  DELETE FROM event_bookings
  WHERE club_event_id = ?
`);

const deleteClubEventById = db.prepare(`
  DELETE FROM club_events
  WHERE id = ?
`);

const findMemberEventBookings = db.prepare(`
  SELECT
    club_events.id,
    club_events.event_date,
    club_events.start_time,
    club_events.end_time,
    club_events.title,
    club_events.type
  FROM event_bookings
  INNER JOIN club_events
    ON club_events.id = event_bookings.club_event_id
  WHERE event_bookings.member_username = ?
  ORDER BY club_events.event_date ASC, club_events.start_time ASC
`);

const findClubEventById = db.prepare(`
  SELECT
    id,
    event_date,
    start_time,
    end_time,
    title,
    type,
    CASE WHEN lower(COALESCE(venue, '')) = 'outdoor' THEN 'outdoor' WHEN lower(COALESCE(venue, '')) = 'indoor' THEN 'indoor' ELSE 'both' END AS venue,
    submitted_by_username,
    approval_status,
    rejection_reason,
    approved_by_username,
    created_at_date || 'T' || created_at_time AS created_at,
    approved_at_date || 'T' || approved_at_time AS approved_at
  FROM club_events
  WHERE id = ?
`);

const approveClubEventById = db.prepare(`
  UPDATE club_events
  SET
    approval_status = 'approved',
    rejection_reason = NULL,
    approved_by_username = ?,
    approved_at_date = ?,
    approved_at_time = ?
  WHERE id = ?
`);

const rejectClubEventById = db.prepare(`
  UPDATE club_events
  SET
    approval_status = 'rejected',
    rejection_reason = ?,
    approved_by_username = ?,
    approved_at_date = ?,
    approved_at_time = ?
  WHERE id = ?
`);

const insertLoginEvent = db.prepare(`
  INSERT INTO login_events (
    username,
    login_method,
    logged_in_date,
    logged_in_time
  )
  VALUES (?, ?, ?, ?)
`);

const insertGuestLoginEvent = db.prepare(`
  INSERT INTO guest_login_events (
    first_name,
    surname,
    archery_gb_membership_number,
    invited_by_username,
    invited_by_name,
    logged_in_date,
    logged_in_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const findRecentRangeMembers = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    users.rfid_tag,
    users.active_member,
    users.membership_fees_due,
    user_types.user_type,
    MAX(login_events.logged_in_date || 'T' || login_events.logged_in_time) AS last_logged_in_at
  FROM login_events
  INNER JOIN users ON users.username = login_events.username
  INNER JOIN user_types ON user_types.username = users.username
  WHERE (login_events.logged_in_date || 'T' || login_events.logged_in_time) >= ?
  GROUP BY users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.membership_fees_due, user_types.user_type
  ORDER BY users.surname ASC, users.first_name ASC
`);

const findDisciplinesByUsername = db.prepare(`
  SELECT discipline
  FROM user_disciplines
  WHERE username = ?
  ORDER BY discipline ASC
`);

const listAllUserDisciplines = db.prepare(`
  SELECT username, discipline
  FROM user_disciplines
  ORDER BY username ASC, discipline ASC
`);

const findRecentGuestLogins = db.prepare(`
  SELECT
    first_name,
    surname,
    archery_gb_membership_number,
    invited_by_username,
    invited_by_name,
    MAX(logged_in_date || 'T' || logged_in_time) AS last_logged_in_at
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
  GROUP BY first_name, surname, archery_gb_membership_number, invited_by_username, invited_by_name
  ORDER BY surname ASC, first_name ASC
`);

const countMemberLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
`);

const countGuestLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
`);

const memberLoginsByHourInRange = db.prepare(`
  SELECT CAST(substr(logged_in_time, 1, 2) AS INTEGER) AS hour, COUNT(*) AS count
  FROM login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY hour
`);

const guestLoginsByHourInRange = db.prepare(`
  SELECT CAST(substr(logged_in_time, 1, 2) AS INTEGER) AS hour, COUNT(*) AS count
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY hour
`);

const memberLoginsByWeekdayInRange = db.prepare(`
  SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
  FROM login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY dayOfWeek
`);

const guestLoginsByWeekdayInRange = db.prepare(`
  SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY dayOfWeek
`);

const memberLoginsByDateInRange = db.prepare(`
  SELECT logged_in_date AS usageDate, COUNT(*) AS count
  FROM login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY usageDate
`);

const guestLoginsByDateInRange = db.prepare(`
  SELECT logged_in_date AS usageDate, COUNT(*) AS count
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY usageDate
`);

const countMemberLoginsForUserInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM login_events
  WHERE username = ?
    AND (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
`);

const memberLoginsByHourForUserInRange = db.prepare(`
  SELECT CAST(substr(logged_in_time, 1, 2) AS INTEGER) AS hour, COUNT(*) AS count
  FROM login_events
  WHERE username = ?
    AND (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY hour
`);

const memberLoginsByWeekdayForUserInRange = db.prepare(`
  SELECT CAST(strftime('%w', logged_in_date) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
  FROM login_events
  WHERE username = ?
    AND (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY dayOfWeek
`);

const memberLoginsByDateForUserInRange = db.prepare(`
  SELECT logged_in_date AS usageDate, COUNT(*) AS count
  FROM login_events
  WHERE username = ?
    AND (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  GROUP BY usageDate
`);

const app = express();

app.use(express.json());

function buildMemberUserProfile(user, disciplines = [], meta = {}) {
  const permissions = getPermissionsForRole(user.user_type);

  return {
    id: user.username,
    accountType: "member",
    auth: {
      username: user.username,
      rfidEnabled: Boolean(user.rfid_tag),
    },
    personal: {
      firstName: user.first_name,
      surname: user.surname,
      fullName: `${user.first_name} ${user.surname}`,
      archeryGbMembershipNumber: null,
    },
    membership: {
      role: user.user_type,
      permissions,
      disciplines,
    },
    meta: {
      activeMember: Boolean(user.active_member),
      membershipFeesDue: user.membership_fees_due ?? "",
      ...meta,
    },
  };
}

function getDefaultLoanBowRecord() {
  return {
    hasLoanBow: false,
    dateLoaned: toUtcDateString(new Date()),
    returnedDate: "",
    riserNumber: "",
    limbsNumber: "",
    arrowCount: DEFAULT_LOAN_ARROW_COUNT,
    returnedRiser: false,
    returnedLimbs: false,
    returnedArrows: false,
    fingerTab: false,
    returnedFingerTab: false,
    string: false,
    returnedString: false,
    armGuard: false,
    returnedArmGuard: false,
    chestGuard: false,
    returnedChestGuard: false,
    sight: false,
    returnedSight: false,
    longRod: false,
    returnedLongRod: false,
    pressureButton: false,
    returnedPressureButton: false,
  };
}

function buildLoanBowRecord(record) {
  const defaults = getDefaultLoanBowRecord();

  if (!record) {
    return defaults;
  }

  return {
    hasLoanBow: Boolean(record.has_loan_bow),
    dateLoaned: record.date_loaned ?? defaults.dateLoaned,
    returnedDate: record.returned_date ?? "",
    riserNumber: record.riser_number ?? "",
    limbsNumber: record.limbs_number ?? "",
    arrowCount:
      typeof record.arrow_count === "number"
        ? record.arrow_count
        : defaults.arrowCount,
    returnedRiser: Boolean(record.returned_riser),
    returnedLimbs: Boolean(record.returned_limbs),
    returnedArrows: Boolean(record.returned_arrows),
    fingerTab: Boolean(record.finger_tab),
    returnedFingerTab: Boolean(record.returned_finger_tab),
    string: Boolean(record.string_item),
    returnedString: Boolean(record.returned_string_item),
    armGuard: Boolean(record.arm_guard),
    returnedArmGuard: Boolean(record.returned_arm_guard),
    chestGuard: Boolean(record.chest_guard),
    returnedChestGuard: Boolean(record.returned_chest_guard),
    sight: Boolean(record.sight),
    returnedSight: Boolean(record.returned_sight),
    longRod: Boolean(record.long_rod),
    returnedLongRod: Boolean(record.returned_long_rod),
    pressureButton: Boolean(record.pressure_button),
    returnedPressureButton: Boolean(record.returned_pressure_button),
  };
}

function buildEditableMemberProfile(user, disciplines = [], loanBow = null) {
  return {
    username: user.username,
    firstName: user.first_name,
    surname: user.surname,
    password: "",
    rfidTag: user.rfid_tag ?? "",
    activeMember: Boolean(user.active_member),
    membershipFeesDue: user.membership_fees_due ?? "",
    userType: user.user_type,
    disciplines,
    loanBow: buildLoanBowRecord(loanBow),
  };
}

function buildGuestUserProfile(guest, meta = {}) {
  const archeryGbMembershipNumber =
    guest.archery_gb_membership_number ??
    guest.archeryGbMembershipNumber ??
    null;
  const firstName = guest.first_name ?? guest.firstName;
  const surname = guest.surname;
  const invitedByUsername =
    guest.invited_by_username ?? guest.invitedByUsername ?? null;
  const invitedByName = guest.invited_by_name ?? guest.invitedByName ?? null;

  return {
    id: `guest:${archeryGbMembershipNumber ?? `${firstName}-${surname}`}`,
    accountType: "guest",
    auth: {
      username: null,
      rfidEnabled: false,
    },
    personal: {
      firstName,
      surname,
      fullName: `${firstName} ${surname}`,
      archeryGbMembershipNumber,
    },
    membership: {
      role: "guest",
      permissions: [],
      disciplines: [],
    },
    meta: {
      invitedByUsername,
      invitedByName,
      ...meta,
    },
  };
}

function buildCoachingSession(session, bookings = [], actor = null) {
  const actorUsername = actor?.username ?? null;
  const canApprove = actorHasPermission(
    actor,
    PERMISSIONS.APPROVE_COACHING_SESSIONS,
  );

  return {
    id: session.id,
    date: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    availableSlots: session.available_slots,
    topic: session.topic,
    summary: session.summary,
    venue: normalizeVenue(session.venue, "indoor"),
    coach: {
      username: session.coach_username,
      fullName: `${session.coach_first_name} ${session.coach_surname}`,
    },
    bookings,
    bookingCount: bookings.length,
    remainingSlots: Math.max(session.available_slots - bookings.length, 0),
    approvalStatus: session.approval_status ?? "approved",
    isApproved: (session.approval_status ?? "approved") === "approved",
    isPendingApproval: (session.approval_status ?? "approved") === "pending",
    isRejected: (session.approval_status ?? "approved") === "rejected",
    rejectionReason: session.rejection_reason?.trim() || "",
    approvedByUsername: session.approved_by_username ?? null,
    approvedAt: session.approved_at ?? null,
    isBookedOn: Boolean(
      actorUsername &&
      bookings.some((booking) => booking.username === actorUsername),
    ),
    canApprove: Boolean(
      canApprove &&
      (session.approval_status ?? "approved") === "pending",
    ),
  };
}

function normalizeBookingRow(booking) {
  return {
    username: booking.member_username,
    fullName: `${booking.first_name} ${booking.surname}`,
    bookedAt: booking.booked_at,
  };
}

function groupRowsBy(rows, keySelector, valueSelector = (value) => value) {
  const groupedRows = new Map();

  for (const row of rows) {
    const key = keySelector(row);
    const currentGroup = groupedRows.get(key);
    const normalizedRow = valueSelector(row);

    if (currentGroup) {
      currentGroup.push(normalizedRow);
      continue;
    }

    groupedRows.set(key, [normalizedRow]);
  }

  return groupedRows;
}

function buildEventBookingsMap() {
  return groupRowsBy(
    listAllEventBookings.all(),
    (booking) => booking.club_event_id,
    normalizeBookingRow,
  );
}

function buildCoachingBookingsMap() {
  return groupRowsBy(
    listAllCoachingSessionBookings.all(),
    (booking) => booking.coaching_session_id,
    normalizeBookingRow,
  );
}

function buildDisciplinesByUsernameMap() {
  return groupRowsBy(
    listAllUserDisciplines.all(),
    (discipline) => discipline.username,
    (discipline) => discipline.discipline,
  );
}

function buildTournamentDataMaps() {
  const registrationsByTournamentId = groupRowsBy(
    listAllTournamentRegistrations.all(),
    (registration) => registration.tournament_id,
  );
  const scoresByTournamentId = groupRowsBy(
    listAllTournamentScores.all(),
    (score) => score.tournament_id,
  );

  return {
    registrationsByTournamentId,
    scoresByTournamentId,
  };
}

function sanitizeFileNameSegment(value, fallback = "export") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

const latestRfidScan = {
  sequence: 0,
  rfidTag: null,
  scannedAt: null,
  source: null,
  scanType: "rfid",
  cardBrand: null,
  deliveredSequence: 0,
};

function registerRfidScan(scan, source = "reader") {
  const normalizedScan =
    typeof scan === "string"
      ? {
          rfidTag: scan,
          source,
          scanType: "rfid",
          cardBrand: null,
        }
      : {
          rfidTag: scan?.rfidTag ?? null,
          source: scan?.source ?? source,
          scanType: scan?.scanType ?? "rfid",
          cardBrand: scan?.cardBrand ?? null,
        };

  if (!normalizedScan.rfidTag) {
    return;
  }

  latestRfidScan.sequence += 1;
  latestRfidScan.rfidTag = normalizedScan.rfidTag;
  latestRfidScan.scannedAt = new Date().toISOString();
  latestRfidScan.source = normalizedScan.source;
  latestRfidScan.scanType = normalizedScan.scanType;
  latestRfidScan.cardBrand = normalizedScan.cardBrand;
}

function startRfidReaderMonitor() {
  const powershellPath =
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const monitorScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct SCARD_IO_REQUEST {
    public uint dwProtocol;
    public uint cbPciLength;
}

public static class WinSCardReader {
    public const uint SCARD_SCOPE_USER = 0;
    public const uint SCARD_SCOPE_SYSTEM = 2;
    public const uint SCARD_SHARE_SHARED = 2;
    public const uint SCARD_PROTOCOL_T0 = 1;
    public const uint SCARD_PROTOCOL_T1 = 2;
    public const uint SCARD_PROTOCOL_RAW = 4;
    public const uint SCARD_LEAVE_CARD = 0;
    public const uint SCARD_AUTOALLOCATE = 0xFFFFFFFF;

    [DllImport("winscard.dll")]
    public static extern int SCardEstablishContext(uint dwScope, IntPtr pvReserved1, IntPtr pvReserved2, out IntPtr phContext);

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardListReaders(IntPtr hContext, string mszGroups, ref IntPtr mszReaders, ref uint pcchReaders);

    [DllImport("winscard.dll")]
    public static extern int SCardFreeMemory(IntPtr hContext, IntPtr pvMem);

    [DllImport("winscard.dll", CharSet = CharSet.Unicode)]
    public static extern int SCardConnect(IntPtr hContext, string szReader, uint dwShareMode, uint dwPreferredProtocols, out IntPtr phCard, out uint pdwActiveProtocol);

    [DllImport("winscard.dll")]
    public static extern int SCardTransmit(IntPtr hCard, ref SCARD_IO_REQUEST pioSendPci, byte[] pbSendBuffer, int cbSendLength, IntPtr pioRecvPci, byte[] pbRecvBuffer, ref int pcbRecvLength);

    [DllImport("winscard.dll")]
    public static extern int SCardDisconnect(IntPtr hCard, uint dwDisposition);

    [DllImport("winscard.dll")]
    public static extern int SCardReleaseContext(IntPtr hContext);
}
"@

$readers = @(${RFID_READER_NAMES.map((reader) => `'${reader}'`).join(", ")})
$uidApdu = [byte[]](0xFF,0xCA,0x00,0x00,0x00)
$ppseApdu = [byte[]](0x00,0xA4,0x04,0x00,0x0E,0x32,0x50,0x41,0x59,0x2E,0x53,0x59,0x53,0x2E,0x44,0x44,0x46,0x30,0x31,0x00)
$readerHints = @('acr122', 'smart card', 'picc interface', 'contactless', 'omnikey', 'nfc')
$lastFingerprint = ''
$wasPresent = $false

function Invoke-Apdu($card, $activeProtocol, $apdu) {
    $sendPci = New-Object SCARD_IO_REQUEST
    $sendPci.dwProtocol = $activeProtocol
    $sendPci.cbPciLength = 8
    $recv = New-Object byte[] 258
    $recvLen = $recv.Length
    $result = [WinSCardReader]::SCardTransmit($card, [ref]$sendPci, $apdu, $apdu.Length, [IntPtr]::Zero, $recv, [ref]$recvLen)

    if ($result -ne 0 -or $recvLen -lt 2) {
        return @{
            Status = ''
            Payload = @()
        }
    }

    $sw1 = $recv[$recvLen - 2]
    $sw2 = $recv[$recvLen - 1]

    return @{
        Status = ('0x{0:X2}{1:X2}' -f $sw1, $sw2)
        Payload = if ($recvLen -gt 2) { $recv[0..($recvLen - 3)] } else { @() }
    }
}

function Get-PaymentCardBrand($payload) {
    if (-not $payload -or $payload.Length -lt 7) {
        return $null
    }

    $hexPayload = (($payload | ForEach-Object { $_.ToString('X2') }) -join '')

    if ($hexPayload -match 'A0000000031010') {
        return 'Visa'
    }

    if ($hexPayload -match 'A0000000041010') {
        return 'Mastercard'
    }

    if ($hexPayload -match 'A000000025') {
        return 'American Express'
    }

    return 'Payment card'
}

function Get-AvailableReaders($context) {
    $readerBuffer = [IntPtr]::Zero
    $readerLength = [WinSCardReader]::SCARD_AUTOALLOCATE
    $result = [WinSCardReader]::SCardListReaders($context, $null, [ref]$readerBuffer, [ref]$readerLength)

    if ($result -ne 0 -or $readerBuffer -eq [IntPtr]::Zero) {
        return @()
    }

    try {
        $readerBlock = [Runtime.InteropServices.Marshal]::PtrToStringUni($readerBuffer, [int]$readerLength)
        if (-not $readerBlock) {
            return @()
        }

        return $readerBlock -split "\`0" | Where-Object { $_ }
    } finally {
        [void][WinSCardReader]::SCardFreeMemory($context, $readerBuffer)
    }
}

function Get-CandidateReaders($context) {
    $availableReaders = Get-AvailableReaders $context
    if (-not $availableReaders -or $availableReaders.Count -eq 0) {
        return $readers
    }

    $ordered = New-Object System.Collections.Generic.List[string]
    foreach ($preferred in $readers) {
        foreach ($available in $availableReaders) {
            if ($available -ieq $preferred -and -not $ordered.Contains($available)) {
                [void]$ordered.Add($available)
            }
        }
    }

    foreach ($available in $availableReaders) {
        $availableLower = $available.ToLowerInvariant()
        foreach ($hint in $readerHints) {
            if ($availableLower.Contains($hint) -and -not $ordered.Contains($available)) {
                [void]$ordered.Add($available)
                break
            }
        }
    }

    foreach ($available in $availableReaders) {
        if (-not $ordered.Contains($available)) {
            [void]$ordered.Add($available)
        }
    }

    return $ordered.ToArray()
}

function Try-ReadCard($context, $reader) {
    $protocolSets = @(
        ([WinSCardReader]::SCARD_PROTOCOL_T0 -bor [WinSCardReader]::SCARD_PROTOCOL_T1),
        [WinSCardReader]::SCARD_PROTOCOL_T1,
        [WinSCardReader]::SCARD_PROTOCOL_T0,
        ([WinSCardReader]::SCARD_PROTOCOL_T1 -bor [WinSCardReader]::SCARD_PROTOCOL_RAW)
    )

    foreach ($protocolMask in $protocolSets) {
        $card = [IntPtr]::Zero
        $activeProtocol = 0
        $result = [WinSCardReader]::SCardConnect($context, $reader, [WinSCardReader]::SCARD_SHARE_SHARED, $protocolMask, [ref]$card, [ref]$activeProtocol)
        if ($result -ne 0 -or $card -eq [IntPtr]::Zero) {
            continue
        }

        try {
            $uidResult = Invoke-Apdu $card $activeProtocol $uidApdu
            $uid = ''
            if ($uidResult.Status -eq '0x9000' -and $uidResult.Payload.Length -gt 0) {
                $uid = (($uidResult.Payload | ForEach-Object { $_.ToString('X2') }) -join '')
            }

            $scanType = 'rfid'
            $cardBrand = $null
            $ppseResult = Invoke-Apdu $card $activeProtocol $ppseApdu
            if ($ppseResult.Status -eq '0x9000') {
                $scanType = 'payment-card'
                $cardBrand = Get-PaymentCardBrand $ppseResult.Payload
            }

            if ($uid -or $scanType -eq 'payment-card') {
                return @{
                    uid = $uid
                    scanType = $scanType
                    cardBrand = $cardBrand
                }
            }
        } finally {
            [void][WinSCardReader]::SCardDisconnect($card, [WinSCardReader]::SCARD_LEAVE_CARD)
        }
    }

    return $null
}

while ($true) {
    $context = [IntPtr]::Zero
    $uid = ''
    $scanType = 'rfid'
    $cardBrand = $null

    try {
        $result = [WinSCardReader]::SCardEstablishContext([WinSCardReader]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
        if ($result -ne 0) {
            $result = [WinSCardReader]::SCardEstablishContext([WinSCardReader]::SCARD_SCOPE_SYSTEM, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
        }
        if ($result -eq 0) {
            foreach ($reader in (Get-CandidateReaders $context)) {
                $scan = Try-ReadCard $context $reader
                if ($scan) {
                    $uid = $scan.uid
                    $scanType = $scan.scanType
                    $cardBrand = $scan.cardBrand
                    break
                }
            }
        }
    } catch {
    } finally {
        if ($context -ne [IntPtr]::Zero) { [void][WinSCardReader]::SCardReleaseContext($context) }
    }

    if ($uid) {
        $fingerprint = if ($scanType -eq 'payment-card' -and $cardBrand) { "$uid|$scanType|$cardBrand" } else { "$uid|$scanType" }

        if (-not $wasPresent -or $fingerprint -ne $lastFingerprint) {
            [pscustomobject]@{
                rfidTag = $uid
                source = 'reader'
                scanType = $scanType
                cardBrand = $cardBrand
            } | ConvertTo-Json -Compress | Write-Output
            [Console]::Out.Flush()
        }
        $lastFingerprint = $fingerprint
        $wasPresent = $true
    } else {
        $lastFingerprint = ''
        $wasPresent = $false
    }

    Start-Sleep -Milliseconds 800
}
`;

  let child;

  try {
    child = spawn(
      powershellPath,
      ["-NoProfile", "-Command", monitorScript],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch (error) {
    console.error("Unable to start RFID reader monitor.", error);
    return;
  }

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        continue;
      }

      try {
        registerRfidScan(JSON.parse(trimmedLine), "reader");
      } catch {
        registerRfidScan(trimmedLine, "reader");
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => {});
  child.on("error", (error) => {
    console.error("RFID reader monitor failed.", error);
  });
}

function getDeactivatedRfidTag(rfidTag) {
  if (!rfidTag) {
    return null;
  }

  return rfidTag.endsWith(DEACTIVATED_RFID_SUFFIX)
    ? rfidTag
    : `${rfidTag}${DEACTIVATED_RFID_SUFFIX}`;
}

function isMembershipFeesOverdue(user, today = toUtcDateString(new Date())) {
  const membershipFeesDue =
    user?.membership_fees_due ?? user?.membershipFeesDue ?? null;

  return Boolean(membershipFeesDue && membershipFeesDue < today);
}

function syncMemberStatusWithFees(user) {
  if (!user || !isMembershipFeesOverdue(user)) {
    return user;
  }

  const nextRfidTag = getDeactivatedRfidTag(user.rfid_tag);
  const requiresUpdate =
    Boolean(user.active_member) || (user.rfid_tag ?? null) !== nextRfidTag;

  if (requiresUpdate) {
    updateUserMembershipStatus.run(0, nextRfidTag, user.username);
  }

  return {
    ...user,
    active_member: 0,
    rfid_tag: nextRfidTag,
  };
}

function syncAllMemberStatusesWithFees() {
  for (const user of listAllUsers.all()) {
    syncMemberStatusWithFees(user);
  }
}

function buildClubEvent(event, bookings = [], actor = null) {
  const actorUsername = actor?.username ?? null;
  const canApprove = actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS);

  return {
    id: event.id,
    date: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    title: event.title,
    details: event.details?.trim() || "",
    type: event.type,
    venue: normalizeVenue(event.venue),
    bookingCount: bookings.length,
    approvalStatus: event.approval_status ?? "approved",
    isApproved: (event.approval_status ?? "approved") === "approved",
    isPendingApproval: (event.approval_status ?? "approved") === "pending",
    isRejected: (event.approval_status ?? "approved") === "rejected",
    rejectionReason: event.rejection_reason?.trim() || "",
    submittedByUsername: event.submitted_by_username ?? null,
    approvedByUsername: event.approved_by_username ?? null,
    approvedAt: event.approved_at ?? null,
    isBookedOn: Boolean(
      actorUsername &&
      bookings.some((booking) => booking.username === actorUsername),
    ),
    canApprove: Boolean(
      canApprove &&
      (event.approval_status ?? "approved") === "pending",
    ),
  };
}

function canActorViewApprovalEntry(
  entry,
  actor,
  submittedByUsernameField,
  approverPermission,
) {
  const approvalStatus = entry.approval_status ?? "approved";

  if (approvalStatus === "approved") {
    return true;
  }

  if (!actor) {
    return false;
  }

  if (actorHasPermission(actor, approverPermission)) {
    return true;
  }

  return entry[submittedByUsernameField] === actor.username;
}

function buildCommitteeRole(role) {
  return {
    id: role.id,
    roleKey: role.role_key,
    title: role.title,
    summary: role.summary,
    displayOrder: role.display_order,
    assignedMember: role.assigned_username
      ? {
          username: role.assigned_username,
          fullName: `${role.assigned_first_name} ${role.assigned_surname}`,
          userType: role.assigned_user_type,
        }
      : null,
  };
}

function buildRoleDefinitionResponse(role) {
  return {
    roleKey: role.role_key,
    title: role.title,
    isSystem: Boolean(role.is_system),
    assignedUserCount: countUsersByRoleKey.get(role.role_key)?.count ?? 0,
    permissions: getPermissionsForRole(role.role_key),
  };
}

function nextPowerOfTwo(value) {
  let result = 1;

  while (result < value) {
    result *= 2;
  }

  return result;
}

function getTournamentTypeLabel(type) {
  return (
    TOURNAMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    type
  );
}

function buildTournamentBracket(registrations, scoresByRound) {
  const entrants = [...registrations]
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .map((registration, index) => ({
      username: registration.username,
      fullName: registration.fullName,
      seed: index + 1,
    }));

  if (entrants.length === 0) {
    return {
      rounds: [],
      winner: null,
      currentRoundNumber: null,
    };
  }

  const bracketSize = nextPowerOfTwo(Math.max(entrants.length, 2));
  const slots = [...entrants];

  while (slots.length < bracketSize) {
    slots.push(null);
  }

  const rounds = [];
  let currentParticipants = slots;
  let currentRoundNumber = null;

  while (currentParticipants.length > 1) {
    const roundIndex = rounds.length + 1;
    const roundScores = scoresByRound.get(roundIndex) ?? new Map();
    const matches = [];

    for (let index = 0; index < currentParticipants.length; index += 2) {
      const leftParticipant = currentParticipants[index] ?? null;
      const rightParticipant = currentParticipants[index + 1] ?? null;
      const leftScore = leftParticipant
        ? (roundScores.get(leftParticipant.username) ?? null)
        : null;
      const rightScore = rightParticipant
        ? (roundScores.get(rightParticipant.username) ?? null)
        : null;

      let winner = null;
      let status = "pending";

      if (leftParticipant && !rightParticipant) {
        winner = leftParticipant;
        status = "bye";
      } else if (!leftParticipant && rightParticipant) {
        winner = rightParticipant;
        status = "bye";
      } else if (!leftParticipant && !rightParticipant) {
        status = "empty";
      } else if (
        typeof leftScore === "number" &&
        typeof rightScore === "number"
      ) {
        if (leftScore > rightScore) {
          winner = leftParticipant;
          status = "completed";
        } else if (rightScore > leftScore) {
          winner = rightParticipant;
          status = "completed";
        } else {
          status = "tie";
        }
      }

      matches.push({
        id: `round-${roundIndex}-match-${index / 2 + 1}`,
        leftParticipant,
        rightParticipant,
        leftScore,
        rightScore,
        winner,
        status,
      });
    }

    if (
      currentRoundNumber === null &&
      matches.some(
        (match) =>
          ["pending", "tie"].includes(match.status) &&
          match.leftParticipant &&
          match.rightParticipant,
      )
    ) {
      currentRoundNumber = roundIndex;
    }

    rounds.push({
      roundNumber: roundIndex,
      title: `Round ${roundIndex}`,
      matches,
    });

    currentParticipants = matches.map((match) => match.winner);
  }

  return {
    rounds,
    winner: currentParticipants[0] ?? null,
    currentRoundNumber,
  };
}

function buildTournament(
  tournament,
  registrations = [],
  scores = [],
  actorUsername = null,
) {
  const registrationLookup = new Set(
    registrations.map((entry) => entry.member_username),
  );
  const normalizedRegistrations = registrations.map((registration) => ({
    username: registration.member_username,
    fullName: `${registration.first_name} ${registration.surname}`,
    role: registration.user_type,
    registeredAt: registration.registered_at,
  }));
  const scoresByRound = new Map();

  for (const score of scores) {
    if (!scoresByRound.has(score.round_number)) {
      scoresByRound.set(score.round_number, new Map());
    }

    scoresByRound
      .get(score.round_number)
      .set(score.member_username, score.score);
  }

  const bracket = buildTournamentBracket(
    normalizedRegistrations,
    scoresByRound,
  );
  const today = toUtcDateString(new Date());
  const registrationUpcoming = today < tournament.registration_start_date;
  const registrationOpen =
    today >= tournament.registration_start_date &&
    today <= tournament.registration_end_date;
  const registrationClosed = today > tournament.registration_end_date;
  const scoreSubmissionOpen =
    today >= tournament.score_submission_start_date &&
    today <= tournament.score_submission_end_date;
  const currentRoundNumber = bracket.currentRoundNumber;
  const currentRound = bracket.rounds.find(
    (round) => round.roundNumber === currentRoundNumber,
  );
  const actorMatch =
    currentRound?.matches.find(
      (match) =>
        match.leftParticipant?.username === actorUsername ||
        match.rightParticipant?.username === actorUsername,
    ) ?? null;
  const actorScore =
    actorUsername && currentRoundNumber
      ? (scoresByRound.get(currentRoundNumber)?.get(actorUsername) ?? null)
      : null;

  return {
    id: tournament.id,
    name: tournament.name,
    type: tournament.tournament_type,
    typeLabel: getTournamentTypeLabel(tournament.tournament_type),
    registrationWindow: {
      startDate: tournament.registration_start_date,
      endDate: tournament.registration_end_date,
      isUpcoming: registrationUpcoming,
      isOpen: registrationOpen,
      isClosed: registrationClosed,
    },
    scoreWindow: {
      startDate: tournament.score_submission_start_date,
      endDate: tournament.score_submission_end_date,
      isOpen: scoreSubmissionOpen,
    },
    createdBy: {
      username: tournament.created_by,
      fullName: `${tournament.created_by_first_name} ${tournament.created_by_surname}`,
    },
    registrations: normalizedRegistrations,
    registrationCount: normalizedRegistrations.length,
    bracket,
    bracketReady: registrationClosed && normalizedRegistrations.length > 1,
    currentRoundNumber,
    isRegistered: Boolean(
      actorUsername && registrationLookup.has(actorUsername),
    ),
    canRegister: Boolean(
      actorUsername &&
      registrationOpen &&
      !registrationLookup.has(actorUsername),
    ),
    canWithdraw: Boolean(
      actorUsername &&
      registrationOpen &&
      registrationLookup.has(actorUsername),
    ),
    canSubmitScore: Boolean(
      actorUsername &&
      registrationLookup.has(actorUsername) &&
      scoreSubmissionOpen &&
      currentRoundNumber &&
      actorMatch &&
      actorMatch.leftParticipant &&
      actorMatch.rightParticipant,
    ),
    actorScore,
    needsScoreReminder: Boolean(
      actorUsername &&
      registrationLookup.has(actorUsername) &&
      scoreSubmissionOpen &&
      currentRoundNumber &&
      actorMatch &&
      actorMatch.leftParticipant &&
      actorMatch.rightParticipant &&
      typeof actorScore !== "number",
    ),
  };
}

function buildRecurringClosureEvent(date) {
  const targetDate = new Date(`${date}T00:00:00`);

  if (Number.isNaN(targetDate.getTime())) {
    return null;
  }

  const firstDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const firstDayOfWeek = firstDay.getDay();
  const daysUntilMonday = (8 - firstDayOfWeek) % 7;
  const firstMonday = 1 + daysUntilMonday;

  if (targetDate.getDate() !== firstMonday) {
    return null;
  }

  return {
    id: `range-closed-${date}`,
    date,
    startTime: "09:00",
    endTime: "12:00",
    title: "Range closed until 12:00",
    type: "range-closed",
    system: true,
  };
}

function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function normalizeVenue(value, fallback = "both") {
  if (value === "indoor" || value === "outdoor" || value === "both") {
    return value;
  }

  return fallback;
}

function venuesOverlap(leftVenue, rightVenue) {
  const normalizedLeftVenue = normalizeVenue(leftVenue);
  const normalizedRightVenue = normalizeVenue(rightVenue);

  return (
    normalizedLeftVenue === "both" ||
    normalizedRightVenue === "both" ||
    normalizedLeftVenue === normalizedRightVenue
  );
}

function isActiveApprovalStatus(value) {
  const normalizedValue = value ?? "approved";
  return normalizedValue === "approved" || normalizedValue === "pending";
}

function findScheduleConflict({ date, startTime, endTime, venue = "both" }) {
  const sessionConflict = listCoachingSessions
    .all()
    .find(
      (session) =>
        session.session_date === date &&
        isActiveApprovalStatus(session.approval_status) &&
        venuesOverlap(venue, session.venue) &&
        timesOverlap(startTime, endTime, session.start_time, session.end_time),
    );

  if (sessionConflict) {
    return {
      kind: "coaching-session",
      title: sessionConflict.topic,
      startTime: sessionConflict.start_time,
      endTime: sessionConflict.end_time,
    };
  }

  const eventConflict = listClubEvents
    .all()
    .find(
      (event) =>
        event.event_date === date &&
        isActiveApprovalStatus(event.approval_status) &&
        venuesOverlap(venue, event.venue) &&
        timesOverlap(startTime, endTime, event.start_time, event.end_time),
    );

  if (eventConflict) {
    return {
      kind: "event",
      title: eventConflict.title,
      startTime: eventConflict.start_time,
      endTime: eventConflict.end_time,
    };
  }

  const recurringClosure = buildRecurringClosureEvent(date);

  if (
    recurringClosure &&
    timesOverlap(
      startTime,
      endTime,
      recurringClosure.startTime,
      recurringClosure.endTime,
    )
  ) {
    return {
      kind: "event",
      title: recurringClosure.title,
      startTime: recurringClosure.startTime,
      endTime: recurringClosure.endTime,
    };
  }

  return null;
}

function getActorUsername(req) {
  const headerUsername = req.get("x-actor-username");
  const queryUsername =
    typeof req.query.actorUsername === "string"
      ? req.query.actorUsername
      : null;
  const bodyUsername =
    typeof req.body?.actorUsername === "string" ? req.body.actorUsername : null;

  return headerUsername ?? queryUsername ?? bodyUsername ?? null;
}

function getActorUser(req) {
  const actorUsername = getActorUsername(req);

  if (!actorUsername) {
    return null;
  }

  syncAllMemberStatusesWithFees();

  const actor = syncMemberStatusWithFees(findUserByUsername.get(actorUsername));

  if (!actor?.active_member) {
    return null;
  }

  return actor;
}

function listAssignableRoleKeys() {
  return listRoleDefinitions.all().map((role) => role.role_key);
}

function getPermissionsForRole(roleKey) {
  if (!roleKey) {
    return [];
  }

  return listRolePermissionKeysByRoleKey
    .all(roleKey)
    .map((permission) => permission.permission_key)
    .filter((permissionKey) => CURRENT_PERMISSION_KEY_SET.has(permissionKey));
}

function actorHasPermission(actor, permissionKey) {
  if (!actor) {
    return false;
  }

  return getPermissionsForRole(actor.user_type).includes(permissionKey);
}

function toRoleKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildUniqueRoleKeyFromTitle(title) {
  const baseKey = toRoleKey(title);

  if (!baseKey) {
    return "";
  }

  let nextKey = baseKey;
  let counter = 2;

  while (findRoleDefinitionByKey.get(nextKey)) {
    const suffix = `-${counter}`;
    const trimmedBase = baseKey.slice(0, Math.max(1, 40 - suffix.length));
    nextKey = `${trimmedBase}${suffix}`;
    counter += 1;
  }

  return nextKey;
}

function sanitizeDisciplines(disciplines) {
  if (!Array.isArray(disciplines)) {
    return [];
  }

  return [
    ...new Set(
      disciplines.filter((discipline) =>
        ALLOWED_DISCIPLINES.includes(discipline),
      ),
    ),
  ];
}

function sanitizeLoanBow(loanBow) {
  const defaults = getDefaultLoanBowRecord();

  if (!loanBow || typeof loanBow !== "object") {
    return defaults;
  }

  const hasLoanBow = Boolean(loanBow.hasLoanBow);
  const arrowCount = Number.parseInt(loanBow.arrowCount, 10);

  if (!hasLoanBow) {
    return {
      ...defaults,
      hasLoanBow: false,
    };
  }

  return {
    hasLoanBow: true,
    dateLoaned:
      typeof loanBow.dateLoaned === "string" && loanBow.dateLoaned.trim()
        ? loanBow.dateLoaned.trim()
        : defaults.dateLoaned,
    returnedDate:
      typeof loanBow.returnedDate === "string"
        ? loanBow.returnedDate.trim()
        : "",
    riserNumber:
      typeof loanBow.riserNumber === "string" ? loanBow.riserNumber.trim() : "",
    limbsNumber:
      typeof loanBow.limbsNumber === "string" ? loanBow.limbsNumber.trim() : "",
    arrowCount:
      Number.isFinite(arrowCount) && arrowCount > 0
        ? arrowCount
        : DEFAULT_LOAN_ARROW_COUNT,
    returnedRiser: Boolean(loanBow.returnedRiser),
    returnedLimbs: Boolean(loanBow.returnedLimbs),
    returnedArrows: Boolean(loanBow.returnedArrows),
    fingerTab: Boolean(loanBow.fingerTab),
    returnedFingerTab: Boolean(loanBow.returnedFingerTab),
    string: Boolean(loanBow.string),
    returnedString: Boolean(loanBow.returnedString),
    armGuard: Boolean(loanBow.armGuard),
    returnedArmGuard: Boolean(loanBow.returnedArmGuard),
    chestGuard: Boolean(loanBow.chestGuard),
    returnedChestGuard: Boolean(loanBow.returnedChestGuard),
    sight: Boolean(loanBow.sight),
    returnedSight: Boolean(loanBow.returnedSight),
    longRod: Boolean(loanBow.longRod),
    returnedLongRod: Boolean(loanBow.returnedLongRod),
    pressureButton: Boolean(loanBow.pressureButton),
    returnedPressureButton: Boolean(loanBow.returnedPressureButton),
  };
}

function sanitizeLoanBowReturn(existingLoanBow, loanBowReturn) {
  const baseLoanBow = sanitizeLoanBow(existingLoanBow);

  if (!baseLoanBow.hasLoanBow) {
    return {
      success: false,
      status: 400,
      message: "There is no active loan bow record to return against.",
    };
  }

  const returnedDate =
    typeof loanBowReturn?.returnedDate === "string" &&
    loanBowReturn.returnedDate.trim()
      ? loanBowReturn.returnedDate.trim()
      : toUtcDateString(new Date());

  const returnedLoanBow = {
    ...baseLoanBow,
    returnedDate,
    returnedRiser: Boolean(loanBowReturn?.returnedRiser),
    returnedLimbs: Boolean(loanBowReturn?.returnedLimbs),
    returnedArrows: Boolean(loanBowReturn?.returnedArrows),
    returnedFingerTab: Boolean(loanBowReturn?.returnedFingerTab),
    returnedString: Boolean(loanBowReturn?.returnedString),
    returnedArmGuard: Boolean(loanBowReturn?.returnedArmGuard),
    returnedChestGuard: Boolean(loanBowReturn?.returnedChestGuard),
    returnedSight: Boolean(loanBowReturn?.returnedSight),
    returnedLongRod: Boolean(loanBowReturn?.returnedLongRod),
    returnedPressureButton: Boolean(loanBowReturn?.returnedPressureButton),
  };

  const hasReturnedItems = [
    returnedLoanBow.returnedRiser,
    returnedLoanBow.returnedLimbs,
    returnedLoanBow.returnedArrows,
    returnedLoanBow.returnedFingerTab,
    returnedLoanBow.returnedString,
    returnedLoanBow.returnedArmGuard,
    returnedLoanBow.returnedChestGuard,
    returnedLoanBow.returnedSight,
    returnedLoanBow.returnedLongRod,
    returnedLoanBow.returnedPressureButton,
  ].some(Boolean);

  if (!hasReturnedItems) {
    return {
      success: false,
      status: 400,
      message: "Please select at least one returned item.",
    };
  }

  return {
    success: true,
    loanBow: returnedLoanBow,
  };
}

function saveLoanBowRecord(username, loanBow) {
  upsertLoanBowByUsername.run({
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
  });
}

function saveMemberProfile({
  username,
  firstName,
  surname,
  password,
  rfidTag,
  activeMember,
  membershipFeesDue,
  userType,
  disciplines,
  loanBow,
  existingUser,
}) {
  const trimmedUsername = username?.trim();
  const trimmedFirstName = firstName?.trim();
  const trimmedSurname = surname?.trim();
  const trimmedPassword = password?.trim();
  const trimmedRfidTag = rfidTag?.trim();
  const normalizedActiveMember = Boolean(activeMember);
  const normalizedMembershipFeesDue = membershipFeesDue?.trim() || null;
  const normalizedDisciplines = sanitizeDisciplines(disciplines);
  const normalizedLoanBow = sanitizeLoanBow(loanBow);

  if (!trimmedUsername || !trimmedFirstName || !trimmedSurname) {
    return {
      success: false,
      status: 400,
      message: "Username, first name, and surname are required.",
    };
  }

  if (!findRoleDefinitionByKey.get(userType)) {
    return {
      success: false,
      status: 400,
      message: "Please choose a valid member role.",
    };
  }

  if (!existingUser && !trimmedPassword) {
    return {
      success: false,
      status: 400,
      message: "A password is required when creating a new member.",
    };
  }

  const passwordToSave = trimmedPassword || existingUser?.password || null;
  const provisionalUser = syncMemberStatusWithFees({
    username: existingUser?.username ?? trimmedUsername,
    rfid_tag: trimmedRfidTag || null,
    active_member: normalizedActiveMember ? 1 : 0,
    membership_fees_due: normalizedMembershipFeesDue,
  });

  const userPayload = {
    username: provisionalUser.username,
    firstName: trimmedFirstName,
    surname: trimmedSurname,
    password: passwordToSave,
    rfidTag: provisionalUser.rfid_tag,
    activeMember: provisionalUser.active_member,
    membershipFeesDue: provisionalUser.membership_fees_due,
  };

  try {
    upsertUser.run(userPayload);
    upsertUserType.run({
      username: userPayload.username,
      userType,
    });
    deleteUserDisciplines.run(userPayload.username);

    for (const discipline of normalizedDisciplines) {
      insertUserDiscipline.run(userPayload.username, discipline);
    }

    saveLoanBowRecord(userPayload.username, normalizedLoanBow);

    const savedUser = findUserByUsername.get(userPayload.username);
    const savedLoanBow = findLoanBowByUsername.get(userPayload.username);

    return {
      success: true,
      editableProfile: buildEditableMemberProfile(
        savedUser,
        normalizedDisciplines,
        savedLoanBow,
      ),
      userProfile: buildMemberUserProfile(savedUser, normalizedDisciplines),
    };
  } catch (error) {
    if (error?.message?.includes("UNIQUE constraint failed: users.rfid_tag")) {
      return {
        success: false,
        status: 409,
        message: "That RFID tag is already assigned to another member.",
      };
    }

    return {
      success: false,
      status: 500,
      message: "Unable to save the member profile.",
    };
  }
}

function toUtcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function hasScheduleEntryEnded(date, endTime) {
  if (!date || !endTime) {
    return false;
  }

  const normalizedEndTime = /^\d{2}:\d{2}$/.test(endTime)
    ? `${endTime}:00`
    : endTime;
  const entryEnd = new Date(`${date}T${normalizedEndTime}`);

  if (Number.isNaN(entryEnd.getTime())) {
    return false;
  }

  return entryEnd.getTime() <= Date.now();
}

function getUtcTimestampParts(date = new Date()) {
  const isoTimestamp = date.toISOString();
  return [isoTimestamp.slice(0, 10), isoTimestamp.slice(11)];
}

function startOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function buildUsageTotals(startIso, endIsoExclusive) {
  const members = countMemberLoginsInRange.get(startIso, endIsoExclusive).count;
  const guests = countGuestLoginsInRange.get(startIso, endIsoExclusive).count;

  return {
    members,
    guests,
    total: members + guests,
  };
}

function buildPersonalUsageTotals(username, startIso, endIsoExclusive) {
  const members = countMemberLoginsForUserInRange.get(
    username,
    startIso,
    endIsoExclusive,
  ).count;

  return {
    members,
    guests: 0,
    total: members,
  };
}

function buildHourlyBreakdown(startIso, endIsoExclusive) {
  const memberRows = memberLoginsByHourInRange.all(startIso, endIsoExclusive);
  const guestRows = guestLoginsByHourInRange.all(startIso, endIsoExclusive);
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of memberRows) {
    hours[row.hour].members = row.count;
    hours[row.hour].total += row.count;
  }

  for (const row of guestRows) {
    hours[row.hour].guests = row.count;
    hours[row.hour].total += row.count;
  }

  return hours;
}

function buildPersonalHourlyBreakdown(username, startIso, endIsoExclusive) {
  const memberRows = memberLoginsByHourForUserInRange.all(
    username,
    startIso,
    endIsoExclusive,
  );
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of memberRows) {
    hours[row.hour].members = row.count;
    hours[row.hour].total += row.count;
  }

  return hours;
}

function buildWeekdayBreakdown(startIso, endIsoExclusive) {
  const memberRows = memberLoginsByWeekdayInRange.all(
    startIso,
    endIsoExclusive,
  );
  const guestRows = guestLoginsByWeekdayInRange.all(startIso, endIsoExclusive);
  const weekdays = [
    { dayOfWeek: 1, label: "Mon", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 2, label: "Tue", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 3, label: "Wed", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 4, label: "Thu", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 5, label: "Fri", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 6, label: "Sat", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 0, label: "Sun", members: 0, guests: 0, total: 0 },
  ];
  const rowByDay = new Map(weekdays.map((row) => [row.dayOfWeek, row]));

  for (const row of memberRows) {
    const weekday = rowByDay.get(row.dayOfWeek);

    if (!weekday) {
      continue;
    }

    weekday.members = row.count;
    weekday.total += row.count;
  }

  for (const row of guestRows) {
    const weekday = rowByDay.get(row.dayOfWeek);

    if (!weekday) {
      continue;
    }

    weekday.guests = row.count;
    weekday.total += row.count;
  }

  return weekdays;
}

function buildPersonalWeekdayBreakdown(username, startIso, endIsoExclusive) {
  const memberRows = memberLoginsByWeekdayForUserInRange.all(
    username,
    startIso,
    endIsoExclusive,
  );
  const weekdays = [
    { dayOfWeek: 1, label: "Mon", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 2, label: "Tue", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 3, label: "Wed", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 4, label: "Thu", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 5, label: "Fri", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 6, label: "Sat", members: 0, guests: 0, total: 0 },
    { dayOfWeek: 0, label: "Sun", members: 0, guests: 0, total: 0 },
  ];
  const rowByDay = new Map(weekdays.map((row) => [row.dayOfWeek, row]));

  for (const row of memberRows) {
    const weekday = rowByDay.get(row.dayOfWeek);

    if (!weekday) {
      continue;
    }

    weekday.members = row.count;
    weekday.total += row.count;
  }

  return weekdays;
}

function buildDailyBreakdown(startDate, endDateExclusive) {
  const startIso = startDate.toISOString();
  const endIso = endDateExclusive.toISOString();
  const memberRows = memberLoginsByDateInRange.all(startIso, endIso);
  const guestRows = guestLoginsByDateInRange.all(startIso, endIso);
  const rows = [];
  const rowByDate = new Map();

  for (
    let date = new Date(startDate);
    date.getTime() < endDateExclusive.getTime();
    date = addUtcDays(date, 1)
  ) {
    const usageDate = toUtcDateString(date);
    const row = {
      usageDate,
      label: String(date.getUTCDate()),
      fullLabel: usageDate,
      members: 0,
      guests: 0,
      total: 0,
    };

    rows.push(row);
    rowByDate.set(usageDate, row);
  }

  for (const row of memberRows) {
    const day = rowByDate.get(row.usageDate);

    if (!day) {
      continue;
    }

    day.members = row.count;
    day.total += row.count;
  }

  for (const row of guestRows) {
    const day = rowByDate.get(row.usageDate);

    if (!day) {
      continue;
    }

    day.guests = row.count;
    day.total += row.count;
  }

  return rows;
}

function buildPersonalDailyBreakdown(username, startDate, endDateExclusive) {
  const startIso = startDate.toISOString();
  const endIso = endDateExclusive.toISOString();
  const memberRows = memberLoginsByDateForUserInRange.all(
    username,
    startIso,
    endIso,
  );
  const rows = [];
  const rowByDate = new Map();

  for (
    let date = new Date(startDate);
    date.getTime() < endDateExclusive.getTime();
    date = addUtcDays(date, 1)
  ) {
    const usageDate = toUtcDateString(date);
    const row = {
      usageDate,
      label: String(date.getUTCDate()),
      fullLabel: usageDate,
      members: 0,
      guests: 0,
      total: 0,
    };

    rows.push(row);
    rowByDate.set(usageDate, row);
  }

  for (const row of memberRows) {
    const day = rowByDate.get(row.usageDate);

    if (!day) {
      continue;
    }

    day.members = row.count;
    day.total += row.count;
  }

  return rows;
}

function buildMonthDailyBreakdown(startDate, endDateExclusive) {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    usageDate: `day-${index + 1}`,
    label: String(index + 1),
    fullLabel: `Day ${index + 1}`,
    members: 0,
    guests: 0,
    total: 0,
  }));
  const rowByDayOfMonth = new Map(
    rows.map((row, index) => [index + 1, row]),
  );

  for (const row of buildDailyBreakdown(startDate, endDateExclusive)) {
    const dayOfMonth = Number.parseInt(row.label, 10);
    const aggregateRow = rowByDayOfMonth.get(dayOfMonth);

    if (!aggregateRow) {
      continue;
    }

    aggregateRow.members += row.members;
    aggregateRow.guests += row.guests;
    aggregateRow.total += row.total;
  }

  return rows;
}

function buildUsageWindow(label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...buildUsageTotals(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    hourly: buildHourlyBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    weekday: buildWeekdayBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    daily: buildDailyBreakdown(startDate, endDateExclusive),
    monthDaily: buildMonthDailyBreakdown(startDate, endDateExclusive),
  };
}

function buildPersonalUsageWindow(username, label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...buildPersonalUsageTotals(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    hourly: buildPersonalHourlyBreakdown(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    weekday: buildPersonalWeekdayBreakdown(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    daily: buildPersonalDailyBreakdown(username, startDate, endDateExclusive),
    monthDaily: [],
  };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({
      success: false,
      message: "Username and password are required.",
    });
    return;
  }

  const user = syncMemberStatusWithFees(
    findUserByCredentials.get(username, password),
  );

  if (!user) {
    res.status(401).json({
      success: false,
      message:
        "Incorrect username or password. have you tried using your Fob instead?",
    });
    return;
  }

  if (!user.active_member) {
    res.status(403).json({
      success: false,
      message:
        "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "password", ...getUtcTimestampParts());

  res.json({
    success: true,
    userProfile: buildMemberUserProfile(
      user,
      findDisciplinesByUsername
        .all(user.username)
        .map((discipline) => discipline.discipline),
    ),
  });
});

app.post("/api/auth/rfid", (req, res) => {
  const { rfidTag } = req.body ?? {};

  if (!rfidTag) {
    res.status(400).json({
      success: false,
      message: "RFID tag is required.",
    });
    return;
  }

  const user =
    syncMemberStatusWithFees(findUserByRfid.get(rfidTag)) ??
    syncMemberStatusWithFees(findUserByRfid.get(getDeactivatedRfidTag(rfidTag)));

  if (!user) {
    res.status(401).json({
      success: false,
      message: "RFID tag not recognised.",
    });
    return;
  }

  if (!user.active_member) {
    res.status(403).json({
      success: false,
      message:
        "Your member account has been susspended because your membership renewal date has passed.\nPlease contact a committee member.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "rfid", ...getUtcTimestampParts());

  res.json({
    success: true,
    userProfile: buildMemberUserProfile(
      user,
      findDisciplinesByUsername
        .all(user.username)
        .map((discipline) => discipline.discipline),
    ),
  });
});

app.get("/api/auth/rfid/latest-scan", (_req, res) => {
  const hasUndeliveredScan =
    latestRfidScan.sequence > latestRfidScan.deliveredSequence;

  if (hasUndeliveredScan) {
    latestRfidScan.deliveredSequence = latestRfidScan.sequence;
  }

  res.json({
    success: true,
        scan: hasUndeliveredScan
      ? {
          sequence: latestRfidScan.sequence,
          rfidTag: latestRfidScan.rfidTag,
          scannedAt: latestRfidScan.scannedAt,
          source: latestRfidScan.source,
          scanType: latestRfidScan.scanType,
          cardBrand: latestRfidScan.cardBrand,
        }
      : null,
  });
});

app.post("/api/auth/guest-login", (req, res) => {
  const { firstName, surname, archeryGbMembershipNumber, invitedByUsername } =
    req.body ?? {};
  const trimmedMembershipNumber = archeryGbMembershipNumber?.trim() ?? "";
  const membershipDigits = trimmedMembershipNumber.replace(/\D/g, "");
  const trimmedInvitedByUsername = invitedByUsername?.trim() ?? "";

  if (
    !firstName ||
    !surname ||
    !archeryGbMembershipNumber ||
    !trimmedInvitedByUsername
  ) {
    res.status(400).json({
      success: false,
      message:
        "First name, surname, Archery GB membership number, and inviting member are required.",
    });
    return;
  }

  if (membershipDigits.length < 7) {
    res.status(400).json({
      success: false,
      message: "Archery GB membership number must contain at least 7 digits.",
    });
    return;
  }

  const invitingMember = findUserByUsername.get(trimmedInvitedByUsername);

  if (!invitingMember) {
    res.status(400).json({
      success: false,
      message: "Inviting member could not be found.",
    });
    return;
  }

  insertGuestLoginEvent.run(
    firstName.trim(),
    surname.trim(),
    trimmedMembershipNumber,
    invitingMember.username,
    `${invitingMember.first_name} ${invitingMember.surname}`,
    ...getUtcTimestampParts(),
  );

  res.json({
    success: true,
    userProfile: buildGuestUserProfile({
      firstName: firstName.trim(),
      surname: surname.trim(),
      archeryGbMembershipNumber: trimmedMembershipNumber,
      invitedByUsername: invitingMember.username,
      invitedByName: `${invitingMember.first_name} ${invitingMember.surname}`,
    }),
  });
});

app.get("/api/guest-inviter-members", (_req, res) => {
  res.json({
    success: true,
    members: listAllUsers.all().map((user) => ({
      username: user.username,
      firstName: user.first_name,
      surname: user.surname,
      fullName: `${user.first_name} ${user.surname}`,
    })),
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    databasePath,
  });
});

app.get("/api/profile-options", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to load member options.",
    });
    return;
  }

  res.json({
    success: true,
    members: listAllUsers.all().map((user) => ({
      username: user.username,
      fullName: `${user.first_name} ${user.surname}`,
      userType: user.user_type,
    })),
    userTypes: listAssignableRoleKeys(),
    disciplines: ALLOWED_DISCIPLINES,
  });
});

app.get("/api/roles", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to manage roles.",
    });
    return;
  }

  res.json({
    success: true,
    roles: listRoleDefinitions.all().map(buildRoleDefinitionResponse),
    permissions: listPermissionDefinitions.all().map((permission) => ({
      key: permission.permission_key,
      label: permission.label,
      description: permission.description,
    })),
  });
});

app.post("/api/roles", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to create roles.",
    });
    return;
  }

  const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
  const permissionsRaw = Array.isArray(req.body?.permissions)
    ? req.body.permissions
    : [];
  const title = titleRaw.trim();
  const normalizedPermissions = [
    ...new Set(
      permissionsRaw
        .filter((permission) => typeof permission === "string")
        .map((permission) => permission.trim())
        .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
    ),
  ];

  if (!title) {
    res.status(400).json({
      success: false,
      message: "Role title is required.",
    });
    return;
  }

  const roleKey = buildUniqueRoleKeyFromTitle(title);

  if (!roleKey) {
    res.status(400).json({
      success: false,
      message: "Role title must contain letters or numbers.",
    });
    return;
  }

  const createRoleTransaction = db.transaction(() => {
    upsertRole.run({
      roleKey,
      title,
      isSystem: 0,
    });
    deleteRolePermissionsByRoleKey.run(roleKey);

    for (const permissionKey of normalizedPermissions) {
      insertRolePermission.run(roleKey, permissionKey);
    }
  });

  createRoleTransaction();

  const createdRole = findRoleDefinitionByKey.get(roleKey);

  res.status(201).json({
    success: true,
    role: buildRoleDefinitionResponse(createdRole),
  });
});

app.put("/api/roles/:roleKey", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to update roles.",
    });
    return;
  }

  const roleKey = req.params.roleKey;
  const existingRole = findRoleDefinitionByKey.get(roleKey);

  if (!existingRole) {
    res.status(404).json({
      success: false,
      message: "Role not found.",
    });
    return;
  }

  const titleRaw = typeof req.body?.title === "string" ? req.body.title : "";
  const permissionsRaw = Array.isArray(req.body?.permissions)
    ? req.body.permissions
    : [];
  const title = titleRaw.trim();

  if (!title) {
    res.status(400).json({
      success: false,
      message: "Role title is required.",
    });
    return;
  }

  const normalizedPermissions = [
    ...new Set(
      permissionsRaw
        .filter((permission) => typeof permission === "string")
        .map((permission) => permission.trim())
        .filter((permission) => CURRENT_PERMISSION_KEY_SET.has(permission)),
    ),
  ];

  const updateRoleTransaction = db.transaction(() => {
    updateRoleDefinition.run(title, roleKey);
    deleteRolePermissionsByRoleKey.run(roleKey);

    for (const permissionKey of normalizedPermissions) {
      insertRolePermission.run(roleKey, permissionKey);
    }
  });

  updateRoleTransaction();

  res.json({
    success: true,
    role: buildRoleDefinitionResponse(findRoleDefinitionByKey.get(roleKey)),
  });
});

app.delete("/api/roles/:roleKey", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_ROLES_PERMISSIONS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to delete roles.",
    });
    return;
  }

  const roleKey = req.params.roleKey;
  const existingRole = findRoleDefinitionByKey.get(roleKey);

  if (!existingRole) {
    res.status(404).json({
      success: false,
      message: "Role not found.",
    });
    return;
  }

  if (existingRole.is_system) {
    res.status(400).json({
      success: false,
      message: "System roles cannot be deleted.",
    });
    return;
  }

  const assignedUserCount = countUsersByRoleKey.get(roleKey)?.count ?? 0;

  if (assignedUserCount > 0) {
    res.status(409).json({
      success: false,
      message: "This role is still assigned to members and cannot be deleted.",
    });
    return;
  }

  const deleteRoleTransaction = db.transaction(() => {
    deleteRolePermissionsByRoleKey.run(roleKey);
    deleteRoleDefinition.run(roleKey);
  });

  deleteRoleTransaction();

  res.json({
    success: true,
    deletedRoleKey: roleKey,
  });
});

app.get("/api/tournament-options", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to load tournament setup options.",
    });
    return;
  }

  res.json({
    success: true,
    tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
  });
});

app.get("/api/committee-roles", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  res.json({
    success: true,
    roles: listCommitteeRoles.all().map(buildCommitteeRole),
    members: actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
      ? listAllUsers.all().map((user) => ({
          username: user.username,
          fullName: `${user.first_name} ${user.surname}`,
          userType: user.user_type,
        }))
      : [],
  });
});

app.put("/api/committee-roles/:id", (req, res) => {
  const actor = getActorUser(req);

  if (
    !actor ||
    !actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES)
  ) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to update committee roles.",
    });
    return;
  }

  const role = findCommitteeRoleById.get(req.params.id);

  if (!role) {
    res.status(404).json({
      success: false,
      message: "Committee role not found.",
    });
    return;
  }

  const assignedUsernameRaw = req.body?.assignedUsername;
  const assignedUsername =
    typeof assignedUsernameRaw === "string" && assignedUsernameRaw.trim()
      ? assignedUsernameRaw.trim()
      : null;

  if (assignedUsername && !findUserByUsername.get(assignedUsername)) {
    res.status(404).json({
      success: false,
      message: "Assigned member not found.",
    });
    return;
  }

  updateCommitteeRoleAssignment.run(assignedUsername, role.id);

  const updatedRole = listCommitteeRoles
    .all()
    .map(buildCommitteeRole)
    .find((entry) => entry.id === role.id);

  res.json({
    success: true,
    role: updatedRole,
  });
});

app.get("/api/user-profiles/:username", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const isSelf =
    actor.username.localeCompare(requestedUsername, undefined, {
      sensitivity: "accent",
    }) === 0;

  const canManageMembers = actorHasPermission(
    actor,
    PERMISSIONS.MANAGE_MEMBERS,
  );

  if (!isSelf && !canManageMembers) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to edit another member profile.",
    });
    return;
  }

  const user = findUserByUsername.get(requestedUsername);

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  const disciplines = findDisciplinesByUsername
    .all(user.username)
    .map((discipline) => discipline.discipline);
  const loanBow = findLoanBowByUsername.get(user.username);

  res.json({
    success: true,
    editableProfile: buildEditableMemberProfile(user, disciplines, loanBow),
    userProfile: buildMemberUserProfile(user, disciplines),
    userTypes: listAssignableRoleKeys(),
    disciplines: ALLOWED_DISCIPLINES,
  });
});

app.post("/api/user-profiles", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to create member profiles.",
    });
    return;
  }

  const {
    username,
    firstName,
    surname,
    password,
    rfidTag,
    activeMember,
    membershipFeesDue,
    userType,
    disciplines,
    loanBow,
  } = req.body ?? {};

  if (findUserByUsername.get(username ?? "")) {
    res.status(409).json({
      success: false,
      message: "A member with that username already exists.",
    });
    return;
  }

  const result = saveMemberProfile({
    username,
    firstName,
    surname,
    password,
    rfidTag,
    activeMember,
    membershipFeesDue,
    userType,
    disciplines,
    loanBow,
    existingUser: null,
  });

  if (!result.success) {
    res.status(result.status).json(result);
    return;
  }

  res.status(201).json({
    success: true,
    ...result,
  });
});

app.put("/api/user-profiles/:username", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const existingUser = findUserByUsername.get(requestedUsername);

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  const isSelf =
    actor.username.localeCompare(existingUser.username, undefined, {
      sensitivity: "accent",
    }) === 0;

  const canManageMembers = actorHasPermission(
    actor,
    PERMISSIONS.MANAGE_MEMBERS,
  );

  if (!isSelf && !canManageMembers) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to update another member profile.",
    });
    return;
  }

  const {
    firstName,
    surname,
    password,
    rfidTag,
    activeMember,
    membershipFeesDue,
    userType,
    disciplines,
    loanBow,
  } = req.body ?? {};

  const result = saveMemberProfile({
    username: existingUser.username,
    firstName,
    surname,
    password,
    rfidTag,
    activeMember: canManageMembers ? activeMember : existingUser.active_member,
    membershipFeesDue: canManageMembers
      ? membershipFeesDue
      : existingUser.membership_fees_due,
    userType: canManageMembers ? userType : existingUser.user_type,
    disciplines,
    loanBow: canManageMembers
      ? loanBow
      : buildLoanBowRecord(findLoanBowByUsername.get(existingUser.username)),
    existingUser,
  });

  if (!result.success) {
    res.status(result.status).json(result);
    return;
  }

  res.json({
    success: true,
    ...result,
  });
});

app.post("/api/user-profiles/:username/assign-rfid", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to issue member cards.",
    });
    return;
  }

  const existingUser = findUserByUsername.get(requestedUsername);
  const rfidTag =
    typeof req.body?.rfidTag === "string" ? req.body.rfidTag.trim() : "";

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  if (!rfidTag) {
    res.status(400).json({
      success: false,
      message: "An RFID tag is required to issue a member card.",
    });
    return;
  }

  const disciplines = findDisciplinesByUsername
    .all(existingUser.username)
    .map((discipline) => discipline.discipline);
  const loanBow = buildLoanBowRecord(findLoanBowByUsername.get(existingUser.username));
  const result = saveMemberProfile({
    username: existingUser.username,
    firstName: existingUser.first_name,
    surname: existingUser.surname,
    password: existingUser.password,
    rfidTag,
    activeMember: existingUser.active_member,
    membershipFeesDue: existingUser.membership_fees_due,
    userType: existingUser.user_type,
    disciplines,
    loanBow,
    existingUser,
  });

  if (!result.success) {
    res.status(result.status).json(result);
    return;
  }

  res.json({
    success: true,
    ...result,
  });
});

app.get("/api/loan-bow-options", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to manage loan bow records.",
    });
    return;
  }

  res.json({
    success: true,
    members: listAllUsers
      .all()
      .filter(
        (user) =>
          !getPermissionsForRole(user.user_type).includes(
            PERMISSIONS.MANAGE_MEMBERS,
          ),
      )
      .map((user) => ({
        username: user.username,
        fullName: `${user.first_name} ${user.surname}`,
        userType: user.user_type,
      })),
  });
});

app.get("/api/loan-bow-profiles/:username", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to manage loan bow records.",
    });
    return;
  }

  const user = findUserByUsername.get(requestedUsername);

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  res.json({
    success: true,
    member: {
      username: user.username,
      fullName: `${user.first_name} ${user.surname}`,
      userType: user.user_type,
    },
    loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
  });
});

app.put("/api/loan-bow-profiles/:username", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to manage loan bow records.",
    });
    return;
  }

  const user = findUserByUsername.get(requestedUsername);

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  const loanBow = sanitizeLoanBow(req.body?.loanBow);

  saveLoanBowRecord(user.username, loanBow);

  res.json({
    success: true,
    member: {
      username: user.username,
      fullName: `${user.first_name} ${user.surname}`,
      userType: user.user_type,
    },
    loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
  });
});

app.post("/api/loan-bow-profiles/:username/return", (req, res) => {
  const actor = getActorUser(req);
  const requestedUsername = req.params.username;

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.MANAGE_LOAN_BOWS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to manage loan bow records.",
    });
    return;
  }

  const user = findUserByUsername.get(requestedUsername);

  if (!user) {
    res.status(404).json({
      success: false,
      message: "Member profile not found.",
    });
    return;
  }

  const existingLoanBow = buildLoanBowRecord(
    findLoanBowByUsername.get(user.username),
  );
  const returnResult = sanitizeLoanBowReturn(
    existingLoanBow,
    req.body?.loanBowReturn,
  );

  if (!returnResult.success) {
    res.status(returnResult.status).json(returnResult);
    return;
  }

  saveLoanBowRecord(user.username, returnResult.loanBow);

  res.json({
    success: true,
    member: {
      username: user.username,
      fullName: `${user.first_name} ${user.surname}`,
      userType: user.user_type,
    },
    loanBow: buildLoanBowRecord(findLoanBowByUsername.get(user.username)),
  });
});

app.get("/api/events", (req, res) => {
  const actor = getActorUser(req);
  const eventBookingsByEventId = buildEventBookingsMap();
  const persistedEvents = listClubEvents
    .all()
    .filter((event) =>
      canActorViewApprovalEntry(
        event,
        actor,
        "submitted_by_username",
        PERMISSIONS.APPROVE_EVENTS,
      ),
    )
    .map((event) =>
      buildClubEvent(
        event,
        eventBookingsByEventId.get(event.id) ?? [],
        actor,
      ),
    );
  const recurringClosures = [];
  const startYear = new Date().getFullYear() - 1;

  for (let year = startYear; year <= startYear + 3; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const firstDay = new Date(year, month, 1);
      const firstDayOfWeek = firstDay.getDay();
      const daysUntilMonday = (8 - firstDayOfWeek) % 7;
      const firstMonday = 1 + daysUntilMonday;
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(firstMonday).padStart(2, "0")}`;

      recurringClosures.push({
        id: `range-closed-${date}`,
        date,
        startTime: "09:00",
        endTime: "12:00",
        title: "Range closed until 12:00",
        type: "range-closed",
        venue: "both",
        system: true,
        bookingCount: 0,
        isBookedOn: false,
      });
    }
  }

  res.json({
    success: true,
    events: [...recurringClosures, ...persistedEvents].sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      return byDate !== 0
        ? byDate
        : left.startTime.localeCompare(right.startTime);
    }),
  });
});

app.get("/api/tournaments", (req, res) => {
  const actor = getActorUser(req);
  const { registrationsByTournamentId, scoresByTournamentId } =
    buildTournamentDataMaps();
  const tournaments = listTournaments.all().map((tournament) =>
    buildTournament(
      tournament,
      registrationsByTournamentId.get(tournament.id) ?? [],
      scoresByTournamentId.get(tournament.id) ?? [],
      actor?.username ?? null,
    ),
  );

  res.json({
    success: true,
    tournaments,
    tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
  });
});

app.post("/api/tournaments", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to create tournaments.",
    });
    return;
  }

  const {
    name,
    tournamentType,
    registrationStartDate,
    registrationEndDate,
    scoreSubmissionStartDate,
    scoreSubmissionEndDate,
  } = req.body ?? {};

  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (
    !trimmedName ||
    !TOURNAMENT_TYPE_OPTIONS.some(
      (option) => option.value === tournamentType,
    ) ||
    !registrationStartDate ||
    !registrationEndDate ||
    !scoreSubmissionStartDate ||
    !scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message:
        "Name, tournament type, registration window, and score window are required.",
    });
    return;
  }

  if (
    registrationStartDate > registrationEndDate ||
    scoreSubmissionStartDate > scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message: "End dates must be on or after the related start dates.",
    });
    return;
  }

  if (registrationEndDate > scoreSubmissionEndDate) {
    res.status(400).json({
      success: false,
      message:
        "The registration window must finish on or before the score window end date.",
    });
    return;
  }

  const insertResult = insertTournament.run(
    trimmedName,
    tournamentType,
    registrationStartDate,
    registrationEndDate,
    scoreSubmissionStartDate,
    scoreSubmissionEndDate,
    actor.username,
    ...getUtcTimestampParts(),
  );
  const tournament = findTournamentById.get(insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    tournament: buildTournament(tournament, [], [], actor.username),
  });
});

app.put("/api/tournaments/:id", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to amend tournaments.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  const {
    name,
    tournamentType,
    registrationStartDate,
    registrationEndDate,
    scoreSubmissionStartDate,
    scoreSubmissionEndDate,
  } = req.body ?? {};

  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (
    !trimmedName ||
    !TOURNAMENT_TYPE_OPTIONS.some(
      (option) => option.value === tournamentType,
    ) ||
    !registrationStartDate ||
    !registrationEndDate ||
    !scoreSubmissionStartDate ||
    !scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message:
        "Name, tournament type, registration window, and score window are required.",
    });
    return;
  }

  if (
    registrationStartDate > registrationEndDate ||
    scoreSubmissionStartDate > scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message: "End dates must be on or after the related start dates.",
    });
    return;
  }

  if (registrationEndDate > scoreSubmissionEndDate) {
    res.status(400).json({
      success: false,
      message:
        "The registration window must finish on or before the score window end date.",
    });
    return;
  }

  updateTournamentById.run(
    trimmedName,
    tournamentType,
    registrationStartDate,
    registrationEndDate,
    scoreSubmissionStartDate,
    scoreSubmissionEndDate,
    tournament.id,
  );

  const updatedTournament = findTournamentById.get(tournament.id);

  res.json({
    success: true,
    tournament: buildTournament(
      updatedTournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    ),
  });
});

const deleteTournamentCascade = db.transaction((tournamentId) => {
  deleteTournamentScoresByTournamentId.run(tournamentId);
  deleteTournamentRegistrationsByTournamentId.run(tournamentId);
  deleteTournamentById.run(tournamentId);
});

app.delete("/api/tournaments/:id", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to delete tournaments.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  deleteTournamentCascade(tournament.id);

  res.json({
    success: true,
    deletedTournamentId: tournament.id,
    message: `${tournament.name} deleted successfully.`,
  });
});

app.post("/api/tournaments/:id/register", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  const today = toUtcDateString(new Date());

  if (
    today < tournament.registration_start_date ||
    today > tournament.registration_end_date
  ) {
    res.status(400).json({
      success: false,
      message: "The registration window is not currently open.",
    });
    return;
  }

  try {
    insertTournamentRegistration.run(
      tournament.id,
      actor.username,
      ...getUtcTimestampParts(),
    );
  } catch (error) {
    if (
      error?.message?.includes(
        "UNIQUE constraint failed: tournament_registrations.tournament_id, tournament_registrations.member_username",
      )
    ) {
      res.status(409).json({
        success: false,
        message: "You are already registered for this tournament.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Unable to register for this tournament.",
    });
    return;
  }

  res.json({
    success: true,
    tournament: buildTournament(
      tournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    ),
  });
});

app.delete("/api/tournaments/:id/register", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  const today = toUtcDateString(new Date());

  if (
    today < tournament.registration_start_date ||
    today > tournament.registration_end_date
  ) {
    res.status(400).json({
      success: false,
      message: "The registration window is not currently open.",
    });
    return;
  }

  const deleteResult = deleteTournamentRegistration.run(
    tournament.id,
    actor.username,
  );

  if (deleteResult.changes === 0) {
    res.status(404).json({
      success: false,
      message: "You are not registered for this tournament.",
    });
    return;
  }

  res.json({
    success: true,
    tournament: buildTournament(
      tournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    ),
  });
});

app.post("/api/tournaments/:id/score", (req, res) => {
  const actor = getActorUser(req);
  const normalizedScore = Number.parseInt(req.body?.score, 10);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!Number.isInteger(normalizedScore) || normalizedScore < 0) {
    res.status(400).json({
      success: false,
      message: "Please enter a valid whole-number score.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  const today = toUtcDateString(new Date());

  if (
    today < tournament.score_submission_start_date ||
    today > tournament.score_submission_end_date
  ) {
    res.status(400).json({
      success: false,
      message: "The score submission window is not currently open.",
    });
    return;
  }

  const builtTournament = buildTournament(
    tournament,
    listTournamentRegistrationsByTournamentId.all(tournament.id),
    listTournamentScoresByTournamentId.all(tournament.id),
    actor.username,
  );

  if (!builtTournament.canSubmitScore || !builtTournament.currentRoundNumber) {
    res.status(400).json({
      success: false,
      message: "You do not have a score to submit for the current round.",
    });
    return;
  }

  upsertTournamentScore.run(
    tournament.id,
    builtTournament.currentRoundNumber,
    actor.username,
    normalizedScore,
    ...getUtcTimestampParts(),
  );

  res.json({
    success: true,
    tournament: buildTournament(
      tournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
      actor.username,
    ),
  });
});

app.post("/api/tournaments/:id/competitors-export", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to export tournament competitors.",
    });
    return;
  }

  const tournament = findTournamentById.get(req.params.id);

  if (!tournament) {
    res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
    return;
  }

  const registrations = listTournamentRegistrationsByTournamentId.all(
    tournament.id,
  );
  const builtTournament = buildTournament(
    tournament,
    registrations,
    listTournamentScoresByTournamentId.all(tournament.id),
    actor.username,
  );

  const lines = [
    `Tournament: ${builtTournament.name}`,
    `Type: ${builtTournament.typeLabel}`,
    `Registration window: ${builtTournament.registrationWindow.startDate} to ${builtTournament.registrationWindow.endDate}`,
    `Score window: ${builtTournament.scoreWindow.startDate} to ${builtTournament.scoreWindow.endDate}`,
    `Registered competitors: ${builtTournament.registrationCount}`,
    "",
    "Competing members:",
    ...(builtTournament.registrations.length > 0
      ? builtTournament.registrations.map(
          (registration, index) => `${index + 1}. ${registration.fullName}`,
        )
      : ["No registered competitors."]),
    "",
    `Exported at: ${new Date().toISOString()}`,
    `Exported by: ${actor.first_name} ${actor.surname} (${actor.username})`,
  ];

  const fileName = [
    sanitizeFileNameSegment(builtTournament.name, "tournament"),
    "competitors",
    toUtcDateString(new Date()),
  ].join("-");
  const filePath = path.join(exportsDirectory, `${fileName}.txt`);

  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");

  res.json({
    success: true,
    filePath,
    fileName: `${fileName}.txt`,
    tournament: {
      id: builtTournament.id,
      name: builtTournament.name,
      registrationCount: builtTournament.registrationCount,
    },
  });
});

app.post("/api/events", (req, res) => {
  const actor = getActorUser(req);
  const { date, startTime, endTime, title, details, type, venue } = req.body ?? {};
  const trimmedTitle = title?.trim();
  const trimmedDetails =
    typeof details === "string" ? details.trim().slice(0, 2000) : "";
  const normalizedVenue = normalizeVenue(venue);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!actorHasPermission(actor, PERMISSIONS.ADD_EVENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to create events.",
    });
    return;
  }

  if (!date || !startTime || !endTime || !trimmedTitle || !type) {
    res.status(400).json({
      success: false,
      message:
        "Date, start time, end time, title, and event type are required.",
    });
    return;
  }

  if (startTime >= endTime) {
    res.status(400).json({
      success: false,
      message: "End time must be after the event start time.",
    });
    return;
  }

  const conflict = findScheduleConflict({
    date,
    startTime,
    endTime,
    venue: normalizedVenue,
  });

  if (conflict) {
    res.status(409).json({
      success: false,
      message: `This event overlaps ${conflict.title} from ${conflict.startTime} to ${conflict.endTime}.`,
    });
    return;
  }

  const insertResult = insertClubEvent.run(
    date,
    startTime,
    endTime,
    trimmedTitle,
    trimmedDetails,
    type,
    normalizedVenue,
    actor.username,
    actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS) ? "approved" : "pending",
    null,
    actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS) ? actor.username : null,
    ...(actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
      ? getUtcTimestampParts()
      : ["", ""]),
    ...getUtcTimestampParts(),
  );
  const event = listClubEvents
    .all()
    .find((entry) => entry.id === insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    message: actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)
      ? "Event approved and published successfully."
      : "Event submitted for approval.",
    event: buildClubEvent(event, [], actor),
  });
});

app.post("/api/events/:id/approve", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to approve events.",
    });
    return;
  }

  const event = findClubEventById.get(req.params.id);

  if (!event) {
    res.status(404).json({
      success: false,
      message: "Event not found.",
    });
    return;
  }

  if ((event.approval_status ?? "approved") === "approved") {
    res.status(400).json({
      success: false,
      message: "This event has already been approved.",
    });
    return;
  }

  approveClubEventById.run(actor.username, ...getUtcTimestampParts(), event.id);
  const approvedEvent = findClubEventById.get(event.id);
  const bookings = listEventBookingsByEventId.all(event.id).map(normalizeBookingRow);

  res.json({
    success: true,
    message: "Event approved successfully.",
    event: buildClubEvent(approvedEvent, bookings, actor),
  });
});

app.post("/api/events/:id/reject", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to reject events.",
    });
    return;
  }

  const event = findClubEventById.get(req.params.id);

  if (!event) {
    res.status(404).json({
      success: false,
      message: "Event not found.",
    });
    return;
  }

  if ((event.approval_status ?? "approved") !== "pending") {
    res.status(400).json({
      success: false,
      message: "Only pending events can be rejected.",
    });
    return;
  }

  const rejectionReason =
    typeof req.body?.rejectionReason === "string"
      ? req.body.rejectionReason.trim().slice(0, 280)
      : "";

  rejectClubEventById.run(
    rejectionReason || null,
    actor.username,
    ...getUtcTimestampParts(),
    event.id,
  );
  const rejectedEvent = findClubEventById.get(event.id);
  const bookings = listEventBookingsByEventId.all(event.id).map(normalizeBookingRow);

  res.json({
    success: true,
    message: "Event request rejected.",
    event: buildClubEvent(rejectedEvent, bookings, actor),
  });
});

app.post("/api/events/:id/book", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const event = findClubEventById.get(req.params.id);

  if (!event) {
    res.status(404).json({
      success: false,
      message: "Event not found.",
    });
    return;
  }

  if (event.type === "range-closed") {
    res.status(400).json({
      success: false,
      message: "Range closed entries cannot be booked.",
    });
    return;
  }

  if ((event.approval_status ?? "approved") !== "approved") {
    res.status(400).json({
      success: false,
      message: "This event is still awaiting approval.",
    });
    return;
  }

  if (hasScheduleEntryEnded(event.event_date, event.end_time)) {
    res.status(400).json({
      success: false,
      message: "You cannot book onto an event that has already finished.",
    });
    return;
  }

  try {
    insertEventBooking.run(event.id, actor.username, ...getUtcTimestampParts());
  } catch (error) {
    if (
      error?.message?.includes(
        "UNIQUE constraint failed: event_bookings.club_event_id, event_bookings.member_username",
      )
    ) {
      res.status(409).json({
        success: false,
        message: "You are already booked onto this event.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Unable to book onto this event.",
    });
    return;
  }

  const bookings = listEventBookingsByEventId.all(event.id).map((booking) => ({
    username: booking.member_username,
    fullName: `${booking.first_name} ${booking.surname}`,
    bookedAt: booking.booked_at,
  }));

  res.json({
    success: true,
    event: buildClubEvent(event, bookings, actor),
  });
});

app.delete("/api/events/:id/booking", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const event = findClubEventById.get(req.params.id);

  if (!event) {
    res.status(404).json({
      success: false,
      message: "Event not found.",
    });
    return;
  }

  const deleteResult = deleteEventBooking.run(event.id, actor.username);

  if (deleteResult.changes === 0) {
    res.status(404).json({
      success: false,
      message: "You are not booked onto this event.",
    });
    return;
  }

  const bookings = listEventBookingsByEventId.all(event.id).map((booking) => ({
    username: booking.member_username,
    fullName: `${booking.first_name} ${booking.surname}`,
    bookedAt: booking.booked_at,
  }));

  res.json({
    success: true,
    event: buildClubEvent(event, bookings, actor),
  });
});

app.delete("/api/events/:id", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.CANCEL_EVENTS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to cancel events.",
    });
    return;
  }

  const event = findClubEventById.get(req.params.id);

  if (!event) {
    res.status(404).json({
      success: false,
      message: "Event not found.",
    });
    return;
  }

  const deleteEventTransaction = db.transaction(() => {
    deleteBookingsByEventId.run(event.id);
    deleteClubEventById.run(event.id);
  });

  deleteEventTransaction();

  res.json({
    success: true,
    message: "Event cancelled successfully.",
  });
});

app.get("/api/coaching-sessions", (req, res) => {
  const actor = getActorUser(req);
  const coachingBookingsBySessionId = buildCoachingBookingsMap();
  const sessions = listCoachingSessions
    .all()
    .filter((session) =>
      canActorViewApprovalEntry(
        session,
        actor,
        "coach_username",
        PERMISSIONS.APPROVE_COACHING_SESSIONS,
      ),
    )
    .map((session) =>
      buildCoachingSession(
        session,
        coachingBookingsBySessionId.get(session.id) ?? [],
        actor,
      ),
    );

  res.json({
    success: true,
    sessions,
  });
});

app.post("/api/coaching-sessions", (req, res) => {
  const actor = getActorUser(req);

  if (
    !actor ||
    !actorHasPermission(actor, PERMISSIONS.ADD_COACHING_SESSIONS)
  ) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to add coaching sessions.",
    });
    return;
  }

  const { date, startTime, endTime, availableSlots, topic, summary, venue } =
    req.body ?? {};
  const trimmedTopic = topic?.trim();
  const trimmedSummary = summary?.trim();
  const normalizedVenue = normalizeVenue(venue, "");
  const normalizedAvailableSlots = Number.parseInt(availableSlots, 10);

  if (
    !date ||
    !startTime ||
    !endTime ||
    !trimmedTopic ||
    !trimmedSummary ||
    !normalizedVenue
  ) {
    res.status(400).json({
      success: false,
      message:
        "Date, start time, end time, topic, summary, and venue are required.",
    });
    return;
  }

  if (startTime >= endTime) {
    res.status(400).json({
      success: false,
      message: "End time must be after the session start time.",
    });
    return;
  }

  if (
    !Number.isInteger(normalizedAvailableSlots) ||
    normalizedAvailableSlots < 1
  ) {
    res.status(400).json({
      success: false,
      message: "Available slots must be at least 1.",
    });
    return;
  }

  const conflict = findScheduleConflict({
    date,
    startTime,
    endTime,
    venue: normalizedVenue,
  });

  if (conflict) {
    res.status(409).json({
      success: false,
      message: `This coaching session overlaps ${conflict.title} from ${conflict.startTime} to ${conflict.endTime}.`,
    });
    return;
  }

  const insertResult = insertCoachingSession.run(
    actor.username,
    date,
    startTime,
    endTime,
    normalizedAvailableSlots,
    trimmedTopic,
    trimmedSummary,
    normalizedVenue,
    actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
      ? "approved"
      : "pending",
    null,
    actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
      ? actor.username
      : null,
    ...(actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
      ? getUtcTimestampParts()
      : ["", ""]),
    ...getUtcTimestampParts(),
  );
  const session = findCoachingSessionById.get(insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    message: actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
      ? "Coaching session approved and published successfully."
      : "Coaching session submitted for approval.",
    session: buildCoachingSession(session, [], actor),
  });
});

app.post("/api/coaching-sessions/:id/approve", (req, res) => {
  const actor = getActorUser(req);

  if (
    !actor ||
    !actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
  ) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to approve coaching sessions.",
    });
    return;
  }

  const session = findCoachingSessionById.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Coaching session not found.",
    });
    return;
  }

  if ((session.approval_status ?? "approved") === "approved") {
    res.status(400).json({
      success: false,
      message: "This coaching session has already been approved.",
    });
    return;
  }

  approveCoachingSessionById.run(actor.username, ...getUtcTimestampParts(), session.id);
  const approvedSession = findCoachingSessionById.get(session.id);
  const bookings = listBookingsByCoachingSessionId
    .all(session.id)
    .map(normalizeBookingRow);

  res.json({
    success: true,
    message: "Coaching session approved successfully.",
    session: buildCoachingSession(approvedSession, bookings, actor),
  });
});

app.post("/api/coaching-sessions/:id/reject", (req, res) => {
  const actor = getActorUser(req);

  if (
    !actor ||
    !actorHasPermission(actor, PERMISSIONS.APPROVE_COACHING_SESSIONS)
  ) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to reject coaching sessions.",
    });
    return;
  }

  const session = findCoachingSessionById.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Coaching session not found.",
    });
    return;
  }

  if ((session.approval_status ?? "approved") !== "pending") {
    res.status(400).json({
      success: false,
      message: "Only pending coaching sessions can be rejected.",
    });
    return;
  }

  const rejectionReason =
    typeof req.body?.rejectionReason === "string"
      ? req.body.rejectionReason.trim().slice(0, 280)
      : "";

  rejectCoachingSessionById.run(
    rejectionReason || null,
    actor.username,
    ...getUtcTimestampParts(),
    session.id,
  );
  const rejectedSession = findCoachingSessionById.get(session.id);
  const bookings = listBookingsByCoachingSessionId
    .all(session.id)
    .map(normalizeBookingRow);

  res.json({
    success: true,
    message: "Coaching session request rejected.",
    session: buildCoachingSession(rejectedSession, bookings, actor),
  });
});

app.post("/api/coaching-sessions/:id/book", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const session = findCoachingSessionById.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Coaching session not found.",
    });
    return;
  }

  if (hasScheduleEntryEnded(session.session_date, session.end_time)) {
    res.status(400).json({
      success: false,
      message: "You cannot book onto a coaching session that has already finished.",
    });
    return;
  }

  if ((session.approval_status ?? "approved") !== "approved") {
    res.status(400).json({
      success: false,
      message: "This coaching session is still awaiting approval.",
    });
    return;
  }

  try {
    const existingBookings = listBookingsByCoachingSessionId.all(session.id);

    if (existingBookings.length >= session.available_slots) {
      res.status(409).json({
        success: false,
        message: "This coaching session is fully booked.",
      });
      return;
    }

    insertCoachingSessionBooking.run(
      session.id,
      actor.username,
      ...getUtcTimestampParts(),
    );
  } catch (error) {
    if (
      error?.message?.includes(
        "UNIQUE constraint failed: coaching_session_bookings.coaching_session_id, coaching_session_bookings.member_username",
      )
    ) {
      res.status(409).json({
        success: false,
        message: "You are already booked onto this coaching session.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Unable to book onto this coaching session.",
    });
    return;
  }

  const bookings = listBookingsByCoachingSessionId
    .all(session.id)
    .map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

  res.json({
    success: true,
    session: buildCoachingSession(session, bookings, actor),
  });
});

app.delete("/api/coaching-sessions/:id/booking", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const session = findCoachingSessionById.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Coaching session not found.",
    });
    return;
  }

  const deleteResult = deleteCoachingSessionBooking.run(
    session.id,
    actor.username,
  );

  if (deleteResult.changes === 0) {
    res.status(404).json({
      success: false,
      message: "You are not booked onto this coaching session.",
    });
    return;
  }

  const bookings = listBookingsByCoachingSessionId
    .all(session.id)
    .map((booking) => ({
      username: booking.member_username,
      fullName: `${booking.first_name} ${booking.surname}`,
      bookedAt: booking.booked_at,
    }));

  res.json({
    success: true,
    session: buildCoachingSession(session, bookings, actor),
  });
});

app.delete("/api/coaching-sessions/:id", (req, res) => {
  const actor = getActorUser(req);

  if (
    !actor ||
    !actorHasPermission(actor, PERMISSIONS.ADD_COACHING_SESSIONS)
  ) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to cancel coaching sessions.",
    });
    return;
  }

  const session = findCoachingSessionById.get(req.params.id);

  if (!session) {
    res.status(404).json({
      success: false,
      message: "Coaching session not found.",
    });
    return;
  }

  if (session.coach_username !== actor.username) {
    res.status(403).json({
      success: false,
      message: "You can only cancel coaching sessions that you created.",
    });
    return;
  }

  deleteBookingsByCoachingSessionId.run(session.id);
  deleteCoachingSessionById.run(session.id);

  res.json({
    success: true,
    message: "Coaching session cancelled successfully.",
    sessionId: session.id,
  });
});

app.get("/api/my-coaching-bookings", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.json({
      success: true,
      bookings: [],
    });
    return;
  }

  res.json({
    success: true,
    bookings: findMemberBookings.all(actor.username).map((booking) => ({
      id: booking.id,
      date: booking.session_date,
      title: `${booking.topic} with ${booking.coach_first_name} ${booking.coach_surname}`,
      summary: booking.summary,
      startTime: booking.start_time,
      endTime: booking.end_time,
      venue: booking.venue,
    })),
  });
});

app.get("/api/my-event-bookings", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.json({
      success: true,
      bookings: [],
    });
    return;
  }

  res.json({
    success: true,
    bookings: findMemberEventBookings.all(actor.username).map((booking) => ({
      id: `event-${booking.id}`,
      date: booking.event_date,
      title: booking.title,
      summary:
        booking.type === "competition" ? "Competition event" : "Social event",
      startTime: booking.start_time,
      endTime: booking.end_time,
      type: booking.type,
    })),
  });
});

app.get("/api/my-tournament-reminders", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.json({
      success: true,
      reminders: [],
    });
    return;
  }

  const today = toUtcDateString(new Date());
  const { registrationsByTournamentId, scoresByTournamentId } =
    buildTournamentDataMaps();
  const reminders = listTournaments
    .all()
    .map((tournament) =>
      buildTournament(
        tournament,
        registrationsByTournamentId.get(tournament.id) ?? [],
        scoresByTournamentId.get(tournament.id) ?? [],
        actor.username,
      ),
    )
    .flatMap((tournament) => {
      if (!tournament.isRegistered) {
        return [];
      }

      if (tournament.needsScoreReminder) {
        return [
          {
            id: `tournament-score-${tournament.id}`,
            title: `${tournament.name} score reminder`,
            date: tournament.scoreWindow.endDate,
            summary: `Submit your round ${tournament.currentRoundNumber} score by ${tournament.scoreWindow.endDate}.`,
            startTime: "00:00",
            endTime: "23:59",
            type: "tournament-reminder",
          },
        ];
      }

      if (today > tournament.scoreWindow.endDate) {
        return [];
      }

      if (
        tournament.registrationWindow.isUpcoming ||
        tournament.registrationWindow.isOpen
      ) {
        return [
          {
            id: `tournament-registration-${tournament.id}`,
            title: `${tournament.name} registration confirmed`,
            date: tournament.registrationWindow.endDate,
            summary: `You are registered. Registration closes on ${tournament.registrationWindow.endDate}.`,
            startTime: "00:00",
            endTime: "23:59",
            type: "tournament-reminder",
          },
        ];
      }

      return [
        {
          id: `tournament-upcoming-${tournament.id}`,
          title: `${tournament.name} is underway`,
          date: tournament.scoreWindow.endDate,
          summary: `You are registered for this tournament. The score window closes on ${tournament.scoreWindow.endDate}.`,
          startTime: "00:00",
          endTime: "23:59",
          type: "tournament-reminder",
        },
      ];
    });

  res.json({
    success: true,
    reminders,
  });
});

app.get("/api/range-members", (_req, res) => {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const disciplinesByUsername = buildDisciplinesByUsernameMap();
  const members = findRecentRangeMembers.all(cutoff).map((member) =>
    buildMemberUserProfile(
      member,
      disciplinesByUsername.get(member.username) ?? [],
      {
        lastLoggedInAt: member.last_logged_in_at,
      },
    ),
  );
  const guests = findRecentGuestLogins.all(cutoff).map((guest) =>
    buildGuestUserProfile(guest, {
      lastLoggedInAt: guest.last_logged_in_at,
    }),
  );
  const distinctEntries = new Map();

  for (const entry of [...members, ...guests]) {
    const key = entry.id;
    const existingEntry = distinctEntries.get(key);

    if (
      !existingEntry ||
      new Date(entry.meta.lastLoggedInAt).getTime() >
        new Date(existingEntry.meta.lastLoggedInAt).getTime()
    ) {
      distinctEntries.set(key, entry);
    }
  }

  res.json({
    success: true,
    members: [...distinctEntries.values()].sort((a, b) => {
      return `${a.personal.surname} ${a.personal.firstName}`.localeCompare(
        `${b.personal.surname} ${b.personal.firstName}`,
      );
    }),
  });
});

app.get("/api/range-usage-dashboard", (req, res) => {
  const actor = getActorUser(req);
  const now = new Date();
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const todayUtc = startOfUtcDay(now);
  const dayOfWeek = todayUtc.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentWeekStart = addUtcDays(todayUtc, mondayOffset);
  const nextWeekStart = addUtcDays(currentWeekStart, 7);

  const requestedStart = req.query.start;
  const requestedEnd = req.query.end;
  const filteredStart = requestedStart
    ? new Date(`${requestedStart}T00:00:00.000Z`)
    : currentMonthStart;
  const filteredEndDay = requestedEnd
    ? new Date(`${requestedEnd}T00:00:00.000Z`)
    : todayUtc;

  if (
    Number.isNaN(filteredStart.getTime()) ||
    Number.isNaN(filteredEndDay.getTime())
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid start or end date.",
    });
    return;
  }

  if (filteredStart.getTime() > filteredEndDay.getTime()) {
    res.status(400).json({
      success: false,
      message: "Start date cannot be after end date.",
    });
    return;
  }

  const filteredEndExclusive = addUtcDays(filteredEndDay, 1);

  const currentMonth = buildUsageWindow(
    `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
      addUtcDays(nextMonthStart, -1),
    )}`,
    currentMonthStart,
    nextMonthStart,
  );
  const currentWeek = buildUsageWindow(
    `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
      addUtcDays(nextWeekStart, -1),
    )}`,
    currentWeekStart,
    nextWeekStart,
  );
  const filteredRange = buildUsageWindow(
    `${toUtcDateString(filteredStart)} to ${toUtcDateString(filteredEndDay)}`,
    filteredStart,
    filteredEndExclusive,
  );
  const myCurrentMonth = actor
    ? buildPersonalUsageWindow(
        actor.username,
        `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
          addUtcDays(nextMonthStart, -1),
        )}`,
        currentMonthStart,
        nextMonthStart,
      )
    : null;
  const myCurrentWeek = actor
    ? buildPersonalUsageWindow(
        actor.username,
        `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
          addUtcDays(nextWeekStart, -1),
        )}`,
        currentWeekStart,
        nextWeekStart,
      )
    : null;
  const myFilteredRange = actor
    ? buildPersonalUsageWindow(
        actor.username,
        `${toUtcDateString(filteredStart)} to ${toUtcDateString(filteredEndDay)}`,
        filteredStart,
        filteredEndExclusive,
      )
    : null;

  res.json({
    success: true,
    currentMonth,
    currentWeek,
    filteredRange,
    myCurrentMonth,
    myCurrentWeek,
    myFilteredRange,
  });
});

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distDirectory, "index.html"));
  });
}

startRfidReaderMonitor();

app.listen(PORT, () => {
  console.log(`App and auth server listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${databasePath}`);
  if (existsSync(distDirectory)) {
    console.log(`Serving frontend from: ${distDirectory}`);
  }
});
