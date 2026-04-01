import express from "express";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.join(__dirname, "data");
const databasePath = path.join(dataDirectory, "auth.sqlite");
const distDirectory = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 3001);
const ALLOWED_USER_TYPES = ["general", "admin", "developer", "coach"];
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

mkdirSync(dataDirectory, { recursive: true });

const db = new Database(databasePath);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    login_method TEXT NOT NULL CHECK (login_method IN ('password', 'rfid')),
    logged_in_at TEXT NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_types (
    username TEXT PRIMARY KEY,
    user_type TEXT NOT NULL CHECK (user_type IN ('general', 'admin', 'developer', 'coach')),
    FOREIGN KEY (username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS guest_login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    archery_gb_membership_number TEXT NOT NULL,
    logged_in_at TEXT NOT NULL
  )
`);

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

db.exec(`
  CREATE TABLE IF NOT EXISTS coaching_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_username TEXT NOT NULL,
    session_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    available_slots INTEGER NOT NULL DEFAULT 1,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    venue TEXT NOT NULL CHECK (venue IN ('indoor', 'outdoor')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (coach_username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coaching_session_bookings (
    coaching_session_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    booked_at TEXT NOT NULL,
    PRIMARY KEY (coaching_session_id, member_username),
    FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS club_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('competition', 'social', 'range-closed')),
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS event_bookings (
    club_event_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    booked_at TEXT NOT NULL,
    PRIMARY KEY (club_event_id, member_username),
    FOREIGN KEY (club_event_id) REFERENCES club_events(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tournament_type TEXT NOT NULL,
    registration_start_date TEXT NOT NULL,
    registration_end_date TEXT NOT NULL,
    score_submission_start_date TEXT NOT NULL,
    score_submission_end_date TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tournament_registrations (
    tournament_id INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    registered_at TEXT NOT NULL,
    PRIMARY KEY (tournament_id, member_username),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS tournament_scores (
    tournament_id INTEGER NOT NULL,
    round_number INTEGER NOT NULL,
    member_username TEXT NOT NULL,
    score INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    PRIMARY KEY (tournament_id, round_number, member_username),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (member_username) REFERENCES users(username)
  )
`);

const userTypesTableSchema = db
  .prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'user_types'
  `)
  .get();

if (
  userTypesTableSchema?.sql &&
  !userTypesTableSchema.sql.includes("'coach'")
) {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    BEGIN TRANSACTION;

    ALTER TABLE user_types RENAME TO user_types_old;

    CREATE TABLE user_types (
      username TEXT PRIMARY KEY,
      user_type TEXT NOT NULL CHECK (user_type IN ('general', 'admin', 'developer', 'coach')),
      FOREIGN KEY (username) REFERENCES users(username)
    );

    INSERT INTO user_types (username, user_type)
    SELECT username, user_type
    FROM user_types_old;

    DROP TABLE user_types_old;

    COMMIT;

    PRAGMA foreign_keys = ON;
  `);
}

const coachingSessionsColumns = db
  .prepare(`PRAGMA table_info(coaching_sessions)`)
  .all();

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

if (
  coachingSessionsColumns.length > 0 &&
  !coachingSessionsColumns.some((column) => column.name === "available_slots")
) {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    BEGIN TRANSACTION;

    ALTER TABLE coaching_sessions RENAME TO coaching_sessions_old;

    CREATE TABLE coaching_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_username TEXT NOT NULL,
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      available_slots INTEGER NOT NULL DEFAULT 1,
      topic TEXT NOT NULL,
      summary TEXT NOT NULL,
      venue TEXT NOT NULL CHECK (venue IN ('indoor', 'outdoor')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (coach_username) REFERENCES users(username)
    );

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
      created_at
    )
    SELECT
      id,
      coach_username,
      session_date,
      start_time,
      end_time,
      1,
      topic,
      summary,
      CASE
        WHEN lower(COALESCE(location, '')) = 'outdoor' THEN 'outdoor'
        ELSE 'indoor'
      END,
      created_at
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
  coachingBookingForeignKeys.some(
    (foreignKey) => foreignKey.table === "coaching_sessions_old",
  )
) {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    BEGIN TRANSACTION;

    ALTER TABLE coaching_session_bookings RENAME TO coaching_session_bookings_old;

    CREATE TABLE coaching_session_bookings (
      coaching_session_id INTEGER NOT NULL,
      member_username TEXT NOT NULL,
      booked_at TEXT NOT NULL,
      PRIMARY KEY (coaching_session_id, member_username),
      FOREIGN KEY (coaching_session_id) REFERENCES coaching_sessions(id),
      FOREIGN KEY (member_username) REFERENCES users(username)
    );

    INSERT INTO coaching_session_bookings (
      coaching_session_id,
      member_username,
      booked_at
    )
    SELECT
      coaching_session_id,
      member_username,
      booked_at
    FROM coaching_session_bookings_old;

    DROP TABLE coaching_session_bookings_old;

    COMMIT;

    PRAGMA foreign_keys = ON;
  `);
}

const seedUsers = [
  {
    username: "Cfleetham",
    firstName: "Craig",
    surname: "Fleetham",
    password: "abc",
    rfidTag: "RFID-CFLEETHAM-001",
    activeMember: true,
    membershipFeesDue: "2026-12-31",
    userType: "developer",
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
      "Long Bow",
      "Flat Bow",
      "Bare Bow",
      "Recurve Bow",
      "Compound Bow",
    ],
  },
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
    username: "PParker",
    firstName: "Peter",
    surname: "Parker",
    password: "marvel",
    rfidTag: null,
    activeMember: true,
    membershipFeesDue: "2026-12-31",
    userType: "general",
    disciplines: ["Bare Bow", "Recurve Bow"],
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
    username: "MJones",
    firstName: "Jessica",
    surname: "Jones",
    password: "marvel",
    rfidTag: null,
    activeMember: true,
    membershipFeesDue: "2026-12-31",
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
    username: "DStevens",
    firstName: "Kamala",
    surname: "Khan",
    password: "marvel",
    rfidTag: null,
    activeMember: true,
    membershipFeesDue: "2026-12-31",
    userType: "general",
    disciplines: ["Recurve Bow"],
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
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    coaching_sessions.venue,
    coaching_sessions.created_at,
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
    coaching_sessions.venue,
    coaching_sessions.created_at,
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
    coaching_session_bookings.booked_at,
    users.first_name,
    users.surname
  FROM coaching_session_bookings
  INNER JOIN users ON users.username = coaching_session_bookings.member_username
  WHERE coaching_session_bookings.coaching_session_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const insertCoachingSessionBooking = db.prepare(`
  INSERT INTO coaching_session_bookings (
    coaching_session_id,
    member_username,
    booked_at
  )
  VALUES (?, ?, ?)
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

const findMemberBookings = db.prepare(`
  SELECT
    coaching_sessions.id,
    coaching_sessions.session_date,
    coaching_sessions.start_time,
    coaching_sessions.end_time,
    coaching_sessions.available_slots,
    coaching_sessions.topic,
    coaching_sessions.summary,
    coaching_sessions.venue,
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
    type,
    created_at
  FROM club_events
  ORDER BY event_date ASC, start_time ASC
`);

const insertClubEvent = db.prepare(`
  INSERT INTO club_events (
    event_date,
    start_time,
    end_time,
    title,
    type,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?)
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
    tournaments.created_at,
    users.first_name AS created_by_first_name,
    users.surname AS created_by_surname
  FROM tournaments
  INNER JOIN users ON users.username = tournaments.created_by
  ORDER BY tournaments.registration_start_date DESC, tournaments.created_at DESC
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
    tournaments.created_at,
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
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    tournament_registrations.registered_at,
    users.first_name,
    users.surname,
    user_types.user_type
  FROM tournament_registrations
  INNER JOIN users ON users.username = tournament_registrations.member_username
  INNER JOIN user_types ON user_types.username = users.username
  WHERE tournament_registrations.tournament_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const insertTournamentRegistration = db.prepare(`
  INSERT INTO tournament_registrations (
    tournament_id,
    member_username,
    registered_at
  )
  VALUES (?, ?, ?)
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
    submitted_at
  FROM tournament_scores
  WHERE tournament_id = ?
  ORDER BY round_number ASC, member_username ASC
`);

const upsertTournamentScore = db.prepare(`
  INSERT INTO tournament_scores (
    tournament_id,
    round_number,
    member_username,
    score,
    submitted_at
  )
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(tournament_id, round_number, member_username) DO UPDATE SET
    score = excluded.score,
    submitted_at = excluded.submitted_at
`);

const listEventBookingsByEventId = db.prepare(`
  SELECT
    event_bookings.club_event_id,
    event_bookings.member_username,
    event_bookings.booked_at,
    users.first_name,
    users.surname
  FROM event_bookings
  INNER JOIN users ON users.username = event_bookings.member_username
  WHERE event_bookings.club_event_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const insertEventBooking = db.prepare(`
  INSERT INTO event_bookings (
    club_event_id,
    member_username,
    booked_at
  )
  VALUES (?, ?, ?)
`);

const deleteEventBooking = db.prepare(`
  DELETE FROM event_bookings
  WHERE club_event_id = ? AND member_username = ?
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
    created_at
  FROM club_events
  WHERE id = ?
`);

const insertLoginEvent = db.prepare(`
  INSERT INTO login_events (username, login_method, logged_in_at)
  VALUES (?, ?, ?)
`);

const insertGuestLoginEvent = db.prepare(`
  INSERT INTO guest_login_events (
    first_name,
    surname,
    archery_gb_membership_number,
    logged_in_at
  )
  VALUES (?, ?, ?, ?)
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
    MAX(login_events.logged_in_at) AS last_logged_in_at
  FROM login_events
  INNER JOIN users ON users.username = login_events.username
  INNER JOIN user_types ON user_types.username = users.username
  WHERE login_events.logged_in_at >= ?
  GROUP BY users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.membership_fees_due, user_types.user_type
  ORDER BY users.surname ASC, users.first_name ASC
`);

const findDisciplinesByUsername = db.prepare(`
  SELECT discipline
  FROM user_disciplines
  WHERE username = ?
  ORDER BY discipline ASC
`);

const findRecentGuestLogins = db.prepare(`
  SELECT
    first_name,
    surname,
    archery_gb_membership_number,
    MAX(logged_in_at) AS last_logged_in_at
  FROM guest_login_events
  WHERE logged_in_at >= ?
  GROUP BY first_name, surname, archery_gb_membership_number
  ORDER BY surname ASC, first_name ASC
`);

const countMemberLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
`);

const countGuestLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
`);

const memberLoginsByHourInRange = db.prepare(`
  SELECT CAST(strftime('%H', logged_in_at) AS INTEGER) AS hour, COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY hour
`);

const guestLoginsByHourInRange = db.prepare(`
  SELECT CAST(strftime('%H', logged_in_at) AS INTEGER) AS hour, COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY hour
`);

const memberLoginsByWeekdayInRange = db.prepare(`
  SELECT CAST(strftime('%w', logged_in_at) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY dayOfWeek
`);

const guestLoginsByWeekdayInRange = db.prepare(`
  SELECT CAST(strftime('%w', logged_in_at) AS INTEGER) AS dayOfWeek, COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY dayOfWeek
`);

const memberLoginsByDateInRange = db.prepare(`
  SELECT strftime('%Y-%m-%d', logged_in_at) AS usageDate, COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY usageDate
`);

const guestLoginsByDateInRange = db.prepare(`
  SELECT strftime('%Y-%m-%d', logged_in_at) AS usageDate, COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY usageDate
`);

const app = express();

app.use(express.json());

function buildMemberUserProfile(user, disciplines = [], meta = {}) {
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
    guest.archery_gb_membership_number ?? guest.archeryGbMembershipNumber ?? null;
  const firstName = guest.first_name ?? guest.firstName;
  const surname = guest.surname;

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
      disciplines: [],
    },
    meta,
  };
}

function buildCoachingSession(session, bookings = [], actorUsername = null) {
  return {
    id: session.id,
    date: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    availableSlots: session.available_slots,
    topic: session.topic,
    summary: session.summary,
    venue: session.venue,
    coach: {
      username: session.coach_username,
      fullName: `${session.coach_first_name} ${session.coach_surname}`,
    },
    bookings,
    bookingCount: bookings.length,
    remainingSlots: Math.max(session.available_slots - bookings.length, 0),
    isBookedOn: Boolean(
      actorUsername &&
        bookings.some((booking) => booking.username === actorUsername),
    ),
  };
}

function buildClubEvent(event, bookings = [], actorUsername = null) {
  return {
    id: event.id,
    date: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    title: event.title,
    type: event.type,
    bookingCount: bookings.length,
    isBookedOn: Boolean(
      actorUsername &&
        bookings.some((booking) => booking.username === actorUsername),
    ),
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
    TOURNAMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
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
      const leftScore =
        leftParticipant ? roundScores.get(leftParticipant.username) ?? null : null;
      const rightScore =
        rightParticipant ? roundScores.get(rightParticipant.username) ?? null : null;

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
      matches.some((match) =>
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

function buildTournament(tournament, registrations = [], scores = [], actorUsername = null) {
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

    scoresByRound.get(score.round_number).set(score.member_username, score.score);
  }

  const bracket = buildTournamentBracket(normalizedRegistrations, scoresByRound);
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
  const actorMatch = currentRound?.matches.find(
    (match) =>
      match.leftParticipant?.username === actorUsername ||
      match.rightParticipant?.username === actorUsername,
  ) ?? null;
  const actorScore =
    actorUsername && currentRoundNumber
      ? scoresByRound.get(currentRoundNumber)?.get(actorUsername) ?? null
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
    isRegistered: Boolean(actorUsername && registrationLookup.has(actorUsername)),
    canRegister: Boolean(
      actorUsername && registrationOpen && !registrationLookup.has(actorUsername),
    ),
    canWithdraw: Boolean(
      actorUsername && registrationOpen && registrationLookup.has(actorUsername),
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

function addMinutesToTime(timeValue, minutes) {
  const [hours, mins] = timeValue.split(":").map(Number);
  const date = new Date(Date.UTC(1970, 0, 1, hours, mins + minutes));
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
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

function findScheduleConflict({ date, startTime, endTime }) {
  const sessionConflict = listCoachingSessions
    .all()
    .find(
      (session) =>
        session.session_date === date &&
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

  return findUserByUsername.get(actorUsername);
}

function sanitizeDisciplines(disciplines) {
  if (!Array.isArray(disciplines)) {
    return [];
  }

  return [...new Set(disciplines.filter((discipline) =>
    ALLOWED_DISCIPLINES.includes(discipline),
  ))];
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
        typeof loanBow.returnedDate === "string" ? loanBow.returnedDate.trim() : "",
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

  if (!ALLOWED_USER_TYPES.includes(userType)) {
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

  const passwordToSave =
    trimmedPassword || existingUser?.password || null;

  const userPayload = {
    username: existingUser?.username ?? trimmedUsername,
    firstName: trimmedFirstName,
    surname: trimmedSurname,
    password: passwordToSave,
    rfidTag: trimmedRfidTag || null,
    activeMember: normalizedActiveMember ? 1 : 0,
    membershipFeesDue: normalizedMembershipFeesDue,
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
    if (
      error?.message?.includes("UNIQUE constraint failed: users.rfid_tag")
    ) {
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

function buildWeekdayBreakdown(startIso, endIsoExclusive) {
  const memberRows = memberLoginsByWeekdayInRange.all(startIso, endIsoExclusive);
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

function buildMonthDailyBreakdown(anchorDate) {
  const monthStart = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + 1, 1),
  );

  return buildDailyBreakdown(monthStart, nextMonthStart);
}

function buildUsageWindow(label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...buildUsageTotals(startDate.toISOString(), endDateExclusive.toISOString()),
    hourly: buildHourlyBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    weekday: buildWeekdayBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    daily: buildDailyBreakdown(startDate, endDateExclusive),
    monthDaily: buildMonthDailyBreakdown(startDate),
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

  const user = findUserByCredentials.get(username, password);

  if (!user) {
    res.status(401).json({
      success: false,
      message: "Incorrect username or password.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "password", new Date().toISOString());

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

  const user = findUserByRfid.get(rfidTag);

  if (!user) {
    res.status(401).json({
      success: false,
      message: "RFID tag not recognised.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "rfid", new Date().toISOString());

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

app.post("/api/auth/guest-login", (req, res) => {
  const { firstName, surname, archeryGbMembershipNumber } = req.body ?? {};
  const trimmedMembershipNumber = archeryGbMembershipNumber?.trim() ?? "";
  const membershipDigits = trimmedMembershipNumber.replace(/\D/g, "");

  if (!firstName || !surname || !archeryGbMembershipNumber) {
    res.status(400).json({
      success: false,
      message: "First name, surname, and Archery GB membership number are required.",
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

  insertGuestLoginEvent.run(
    firstName.trim(),
    surname.trim(),
    trimmedMembershipNumber,
    new Date().toISOString(),
  );

  res.json({
    success: true,
    userProfile: buildGuestUserProfile({
      firstName: firstName.trim(),
      surname: surname.trim(),
      archeryGbMembershipNumber: trimmedMembershipNumber,
    }),
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

  if (actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admins can load the member list.",
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
    userTypes: ALLOWED_USER_TYPES,
    disciplines: ALLOWED_DISCIPLINES,
  });
});

app.get("/api/tournament-options", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admin users can load tournament setup options.",
    });
    return;
  }

  res.json({
    success: true,
    tournamentTypes: TOURNAMENT_TYPE_OPTIONS,
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

  if (!isSelf && actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admins can edit another member profile.",
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
    userTypes: ALLOWED_USER_TYPES,
    disciplines: ALLOWED_DISCIPLINES,
  });
});

app.post("/api/user-profiles", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admins can create new member profiles.",
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

  if (!isSelf && actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admins can update another member profile.",
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
    activeMember:
      actor.user_type === "admin" ? activeMember : existingUser.active_member,
    membershipFeesDue:
      actor.user_type === "admin"
        ? membershipFeesDue
        : existingUser.membership_fees_due,
    userType: actor.user_type === "admin" ? userType : existingUser.user_type,
    disciplines,
    loanBow:
      actor.user_type === "admin"
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

app.get("/api/loan-bow-options", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!["admin", "coach"].includes(actor.user_type)) {
    res.status(403).json({
      success: false,
      message: "Only admin and coach users can manage loan bow records.",
    });
    return;
  }

  res.json({
    success: true,
    members: listAllUsers
      .all()
      .filter((user) => user.user_type !== "admin")
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

  if (!["admin", "coach"].includes(actor.user_type)) {
    res.status(403).json({
      success: false,
      message: "Only admin and coach users can manage loan bow records.",
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

  if (!["admin", "coach"].includes(actor.user_type)) {
    res.status(403).json({
      success: false,
      message: "Only admin and coach users can manage loan bow records.",
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

  if (!["admin", "coach"].includes(actor.user_type)) {
    res.status(403).json({
      success: false,
      message: "Only admin and coach users can manage loan bow records.",
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

  const existingLoanBow = buildLoanBowRecord(findLoanBowByUsername.get(user.username));
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
  const persistedEvents = listClubEvents.all().map((event) =>
    buildClubEvent(
      event,
      listEventBookingsByEventId.all(event.id).map((booking) => ({
        username: booking.member_username,
        fullName: `${booking.first_name} ${booking.surname}`,
        bookedAt: booking.booked_at,
      })),
      actor?.username ?? null,
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
      return byDate !== 0 ? byDate : left.startTime.localeCompare(right.startTime);
    }),
  });
});

app.get("/api/tournaments", (req, res) => {
  const actor = getActorUser(req);
  const tournaments = listTournaments.all().map((tournament) =>
    buildTournament(
      tournament,
      listTournamentRegistrationsByTournamentId.all(tournament.id),
      listTournamentScoresByTournamentId.all(tournament.id),
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

  if (!actor || actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admin users can create tournaments.",
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
    !TOURNAMENT_TYPE_OPTIONS.some((option) => option.value === tournamentType) ||
    !registrationStartDate ||
    !registrationEndDate ||
    !scoreSubmissionStartDate ||
    !scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message: "Name, tournament type, registration window, and score window are required.",
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
      message: "The registration window must finish on or before the score window end date.",
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
    new Date().toISOString(),
  );
  const tournament = findTournamentById.get(insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    tournament: buildTournament(tournament, [], [], actor.username),
  });
});

app.put("/api/tournaments/:id", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admin users can amend tournaments.",
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
    !TOURNAMENT_TYPE_OPTIONS.some((option) => option.value === tournamentType) ||
    !registrationStartDate ||
    !registrationEndDate ||
    !scoreSubmissionStartDate ||
    !scoreSubmissionEndDate
  ) {
    res.status(400).json({
      success: false,
      message: "Name, tournament type, registration window, and score window are required.",
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
      message: "The registration window must finish on or before the score window end date.",
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

  if (!actor || actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admin users can delete tournaments.",
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
      new Date().toISOString(),
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

  const deleteResult = deleteTournamentRegistration.run(tournament.id, actor.username);

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
    new Date().toISOString(),
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

app.post("/api/events", (req, res) => {
  const actor = getActorUser(req);
  const { date, startTime, endTime, title, type } = req.body ?? {};
  const trimmedTitle = title?.trim();

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (actor.user_type !== "admin") {
    res.status(403).json({
      success: false,
      message: "Only admin users can create events.",
    });
    return;
  }

  if (!date || !startTime || !endTime || !trimmedTitle || !type) {
    res.status(400).json({
      success: false,
      message: "Date, start time, end time, title, and event type are required.",
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

  const conflict = findScheduleConflict({ date, startTime, endTime });

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
    type,
    new Date().toISOString(),
  );
  const event = listClubEvents.all().find((entry) => entry.id === insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    event: buildClubEvent(event),
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

  try {
    insertEventBooking.run(event.id, actor.username, new Date().toISOString());
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
    event: buildClubEvent(event, bookings, actor.username),
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
    event: buildClubEvent(event, bookings, actor.username),
  });
});

app.get("/api/coaching-sessions", (req, res) => {
  const actor = getActorUser(req);
  const sessions = listCoachingSessions.all().map((session) => {
    const bookings = listBookingsByCoachingSessionId
      .all(session.id)
      .map((booking) => ({
        username: booking.member_username,
        fullName: `${booking.first_name} ${booking.surname}`,
        bookedAt: booking.booked_at,
      }));

    return buildCoachingSession(session, bookings, actor?.username ?? null);
  });

  res.json({
    success: true,
    sessions,
  });
});

app.post("/api/coaching-sessions", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || actor.user_type !== "coach") {
    res.status(403).json({
      success: false,
      message: "Only coach users can add coaching sessions.",
    });
    return;
  }

  const { date, startTime, endTime, availableSlots, topic, summary, venue } = req.body ?? {};
  const trimmedTopic = topic?.trim();
  const trimmedSummary = summary?.trim();
  const normalizedVenue = venue === "outdoor" ? "outdoor" : venue === "indoor" ? "indoor" : null;
  const normalizedAvailableSlots = Number.parseInt(availableSlots, 10);

  if (!date || !startTime || !endTime || !trimmedTopic || !trimmedSummary || !normalizedVenue) {
    res.status(400).json({
      success: false,
      message: "Date, start time, end time, topic, summary, and venue are required.",
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

  if (!Number.isInteger(normalizedAvailableSlots) || normalizedAvailableSlots < 1) {
    res.status(400).json({
      success: false,
      message: "Available slots must be at least 1.",
    });
    return;
  }

  const conflict = findScheduleConflict({ date, startTime, endTime });

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
    new Date().toISOString(),
  );
  const session = findCoachingSessionById.get(insertResult.lastInsertRowid);

  res.status(201).json({
    success: true,
    session: buildCoachingSession(session, [], actor.username),
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
      new Date().toISOString(),
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

  const bookings = listBookingsByCoachingSessionId.all(session.id).map((booking) => ({
    username: booking.member_username,
    fullName: `${booking.first_name} ${booking.surname}`,
    bookedAt: booking.booked_at,
  }));

  res.json({
    success: true,
    session: buildCoachingSession(session, bookings, actor.username),
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

  const deleteResult = deleteCoachingSessionBooking.run(session.id, actor.username);

  if (deleteResult.changes === 0) {
    res.status(404).json({
      success: false,
      message: "You are not booked onto this coaching session.",
    });
    return;
  }

  const bookings = listBookingsByCoachingSessionId.all(session.id).map((booking) => ({
    username: booking.member_username,
    fullName: `${booking.first_name} ${booking.surname}`,
    bookedAt: booking.booked_at,
  }));

  res.json({
    success: true,
    session: buildCoachingSession(session, bookings, actor.username),
  });
});

app.delete("/api/coaching-sessions/:id", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || actor.user_type !== "coach") {
    res.status(403).json({
      success: false,
      message: "Only coach users can cancel coaching sessions.",
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
      summary: booking.type === "competition" ? "Competition event" : "Social event",
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
  const reminders = listTournaments
    .all()
    .map((tournament) =>
      buildTournament(
        tournament,
        listTournamentRegistrationsByTournamentId.all(tournament.id),
        listTournamentScoresByTournamentId.all(tournament.id),
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
  const members = findRecentRangeMembers.all(cutoff).map((member) =>
    buildMemberUserProfile(
      member,
      findDisciplinesByUsername
        .all(member.username)
        .map((discipline) => discipline.discipline),
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

  res.json({
    success: true,
    currentMonth,
    currentWeek,
    filteredRange,
  });
});

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distDirectory, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`App and auth server listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${databasePath}`);
  if (existsSync(distDirectory)) {
    console.log(`Serving frontend from: ${distDirectory}`);
  }
});
