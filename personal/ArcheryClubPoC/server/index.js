import express from "express";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { startServer } from "./bootstrap/startServer.js";
import { serverRuntime } from "./config/runtime.js";
import {
  ALLOWED_DISCIPLINES,
  COMMITTEE_ROLE_SEED,
  CURRENT_PERMISSION_KEYS,
  CURRENT_PERMISSION_KEY_SET,
  CURRENT_PERMISSION_SQL_PLACEHOLDERS,
  DEACTIVATED_RFID_SUFFIX,
  DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  DEFAULT_EVENT_DURATION_MINUTES,
  DEFAULT_LOAN_ARROW_COUNT,
  DISTANCE_SIGN_OFF_YARDS,
  EQUIPMENT_CASE_CAPACITY,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_NUMBER_REQUIRED_TYPES,
  EQUIPMENT_SIZE_CATEGORIES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  EQUIPMENT_TYPES,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  RFID_READER_NAMES,
  SYSTEM_ROLE_DEFINITIONS,
  TOURNAMENT_TYPE_OPTIONS,
} from "./domain/constants.js";
import { createDatabase } from "./infrastructure/persistence/createDatabase.js";
import { createMemberDistanceSignOffRepository } from "./infrastructure/persistence/memberDistanceSignOffRepository.js";
import { registerTournamentRoutes } from "./presentation/http/registerTournamentRoutes.js";
import { registerMemberActivityRoutes } from "./presentation/http/registerMemberActivityRoutes.js";
import { registerScheduleRoutes } from "./presentation/http/registerScheduleRoutes.js";
import { registerAdminMemberRoutes } from "./presentation/http/registerAdminMemberRoutes.js";
import { registerAuthRoutes } from "./presentation/http/registerAuthRoutes.js";
import { registerEquipmentRoutes } from "./presentation/http/registerEquipmentRoutes.js";

const { databasePath, distDirectory, port } = serverRuntime;
const db = createDatabase(serverRuntime);
const memberDistanceSignOffRepository = createMemberDistanceSignOffRepository(db, {
  allowedDisciplines: ALLOWED_DISCIPLINES,
  distanceYards: DISTANCE_SIGN_OFF_YARDS,
});
const SESSION_COOKIE_NAME = "archeryclubpoc_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  (serverRuntime.isLive ? null : "archeryclubpoc-development-session-secret");
const PASSWORD_HASH_ALGORITHM = "scrypt";
const PASSWORD_SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
};
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 20;
const AUTH_RATE_LIMIT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/guest-login",
]);
const MUTATING_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUDIT_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/logout",
  "/api/auth/guest-login",
  "/api/auth/rfid/latest-scan",
]);
const authRateLimitBuckets = new Map();

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set when running in live mode.");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, PASSWORD_SCRYPT_PARAMS.keyLength, {
    N: PASSWORD_SCRYPT_PARAMS.N,
    r: PASSWORD_SCRYPT_PARAMS.r,
    p: PASSWORD_SCRYPT_PARAMS.p,
  });

  return [
    PASSWORD_HASH_ALGORITHM,
    PASSWORD_SCRYPT_PARAMS.N,
    PASSWORD_SCRYPT_PARAMS.r,
    PASSWORD_SCRYPT_PARAMS.p,
    salt.toString("hex"),
    hash.toString("hex"),
  ].join("$");
}

function isPasswordHash(value) {
  return typeof value === "string" && value.startsWith(`${PASSWORD_HASH_ALGORITHM}$`);
}

function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) {
    return false;
  }

  if (!isPasswordHash(storedPassword)) {
    const passwordBuffer = Buffer.from(password);
    const storedPasswordBuffer = Buffer.from(storedPassword);

    return (
      passwordBuffer.length === storedPasswordBuffer.length &&
      crypto.timingSafeEqual(passwordBuffer, storedPasswordBuffer)
    );
  }

  const [, N, r, p, saltHex, hashHex] = storedPassword.split("$");
  const storedHash = Buffer.from(hashHex ?? "", "hex");

  if (!saltHex || storedHash.length === 0) {
    return false;
  }

  const suppliedHash = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), storedHash.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });

  return crypto.timingSafeEqual(storedHash, suppliedHash);
}

function encodeSessionPayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signSessionPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createSessionToken(username) {
  const payload = encodeSessionPayload({
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  });

  return `${payload}.${signSessionPayload(payload)}`;
}

function verifySessionToken(token) {
  const [encodedPayload, signature] = String(token ?? "").split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

    if (!payload?.username || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload.username;
  } catch {
    return null;
  }
}

function createSessionCookie(username) {
  const secureFlag = serverRuntime.isLive ? "; Secure" : "";

  return `${SESSION_COOKIE_NAME}=${createSessionToken(username)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureFlag}`;
}

function clearSessionCookie() {
  const secureFlag = serverRuntime.isLive ? "; Secure" : "";

  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie ?? "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function getSessionUsername(req) {
  return verifySessionToken(parseCookies(req)[SESSION_COOKIE_NAME]);
}

function getClientIp(req) {
  const forwardedFor = req.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

function pruneAuthRateLimitBuckets(now = Date.now()) {
  for (const [key, bucket] of authRateLimitBuckets) {
    if (bucket.resetAt <= now) {
      authRateLimitBuckets.delete(key);
    }
  }
}

function authRateLimiter(req, res, next) {
  if (!AUTH_RATE_LIMIT_PATHS.has(req.path)) {
    next();
    return;
  }

  const now = Date.now();
  pruneAuthRateLimitBuckets(now);

  const attemptedUsername =
    typeof req.body?.username === "string"
      ? req.body.username.trim().toLowerCase()
      : "";
  const attemptedRfidTag =
    typeof req.body?.rfidTag === "string"
      ? req.body.rfidTag.trim().toLowerCase()
      : "";
  const key = [
    req.path,
    getClientIp(req),
    attemptedUsername || attemptedRfidTag || "anonymous",
  ].join(":");
  const bucket =
    authRateLimitBuckets.get(key) ?? {
      count: 0,
      resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS,
    };

  bucket.count += 1;
  authRateLimitBuckets.set(key, bucket);

  if (bucket.count > AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      success: false,
      message:
        "Too many sign-in attempts. Please wait a few minutes and try again.",
    });
    return;
  }

  next();
}

function sanitizeAuditMetadata(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const redactedKeys = new Set(["password", "rfidTag", "archeryGbMembershipNumber"]);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => ["string", "number", "boolean"].includes(typeof entryValue))
      .map(([key, entryValue]) => [
        key,
        redactedKeys.has(key) ? "[redacted]" : entryValue,
      ]),
  );
}

function createAuditMiddleware(insertAuditEvent) {
  return (req, res, next) => {
    if (
      !MUTATING_API_METHODS.has(req.method) ||
      !req.path.startsWith("/api/") ||
      AUDIT_EXCLUDED_PATHS.has(req.path)
    ) {
      next();
      return;
    }

    const startedAt = Date.now();

    res.on("finish", () => {
      const [loggedInDate, loggedInTime] = getUtcTimestampParts();

      try {
        insertAuditEvent.run({
          actorUsername: getSessionUsername(req),
          action: `${req.method} ${req.route?.path ?? req.path}`,
          target: req.originalUrl.split("?")[0],
          statusCode: res.statusCode,
          ipAddress: getClientIp(req),
          userAgent: req.get("user-agent") ?? null,
          metadataJson: JSON.stringify({
            durationMs: Date.now() - startedAt,
            body: sanitizeAuditMetadata(req.body),
          }),
          createdAtDate: loggedInDate,
          createdAtTime: loggedInTime,
        });
      } catch (auditError) {
        console.error("Failed to record audit event", auditError);
      }
    });

    next();
  };
}

function apiErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = Number(error?.statusCode ?? error?.status ?? 500);
  const safeStatusCode =
    Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
      ? statusCode
      : 500;

  console.error("Unhandled API error", {
    method: req.method,
    path: req.originalUrl,
    error,
  });

  res.status(safeStatusCode).json({
    success: false,
    message:
      safeStatusCode >= 500
        ? "The server could not complete that request."
        : error?.message ?? "The request could not be completed.",
  });
}

const COURSE_PARTICIPANT_USER_TYPES = {
  beginners: "beginner",
  "have-a-go": "have-a-go",
};
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
  CREATE TABLE IF NOT EXISTS member_distance_sign_offs (
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
`).run(DEFAULT_EQUIPMENT_CUPBOARD_LABEL, "1970-01-01", "00:00:00.000Z");

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

const usersTableSchema = db
  .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
  .get();

if (!usersTableSchema?.sql?.includes("id INTEGER PRIMARY KEY AUTOINCREMENT")) {
  const applicationTables = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name <> 'users'
        AND name NOT LIKE 'sqlite_%'
    `,
    )
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
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
        )
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
const USER_RELATION_COLUMNS = [
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

for (const { table, usernameColumn, userIdColumn } of USER_RELATION_COLUMNS) {
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

const equipmentItemsTable = db
  .prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'equipment_items'`,
  )
  .get();

if (!equipmentItemsTable?.sql?.includes("'quiver'")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE equipment_items RENAME TO equipment_items_old;
    CREATE TABLE equipment_items (
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
    );
    INSERT INTO equipment_items (
      id,
      equipment_type,
      item_number,
      size_category,
      arrow_length,
      arrow_quantity,
      status,
      location_type,
      location_label,
      location_case_id,
      location_member_username,
      added_by_username,
      added_at_date,
      added_at_time,
      decommissioned_by_username,
      decommissioned_at_date,
      decommissioned_at_time,
      decommission_reason,
      last_assignment_by_username,
      last_assignment_at_date,
      last_assignment_at_time,
      last_storage_updated_by_username,
      last_storage_updated_at_date,
      last_storage_updated_at_time
    )
    SELECT
      id,
      equipment_type,
      item_number,
      size_category,
      arrow_length,
      arrow_quantity,
      status,
      location_type,
      location_label,
      location_case_id,
      location_member_username,
      added_by_username,
      added_at_date,
      added_at_time,
      decommissioned_by_username,
      decommissioned_at_date,
      decommissioned_at_time,
      decommission_reason,
      last_assignment_by_username,
      last_assignment_at_date,
      last_assignment_at_time,
      last_storage_updated_by_username,
      last_storage_updated_at_date,
      last_storage_updated_at_time
    FROM equipment_items_old;
    DROP TABLE equipment_items_old;
    PRAGMA foreign_keys = ON;
  `);
}

const equipmentLoansTable = db
  .prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'equipment_loans'`,
  )
  .get();

if (equipmentLoansTable?.sql?.includes("equipment_items_old")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    ALTER TABLE equipment_loans RENAME TO equipment_loans_old;
    CREATE TABLE equipment_loans (
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
    );
    INSERT INTO equipment_loans (
      id,
      equipment_item_id,
      member_username,
      loaned_by_username,
      loaned_at_date,
      loaned_at_time,
      loan_context_case_id,
      returned_by_username,
      returned_at_date,
      returned_at_time,
      return_location_type,
      return_location_label,
      return_case_id
    )
    SELECT
      id,
      equipment_item_id,
      member_username,
      loaned_by_username,
      loaned_at_date,
      loaned_at_time,
      loan_context_case_id,
      returned_by_username,
      returned_at_date,
      returned_at_time,
      return_location_type,
      return_location_label,
      return_case_id
    FROM equipment_loans_old;
    DROP TABLE equipment_loans_old;
    PRAGMA foreign_keys = ON;
  `);
}

const beginnersCourseParticipantsTable = db
  .prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beginners_course_participants'`,
  )
  .get();

if (beginnersCourseParticipantsTable?.sql?.includes("equipment_items_old")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
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
      created_at_time
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
      0,
      assigned_case_id,
      assigned_case_by_username,
      assigned_case_at_date,
      assigned_case_at_time,
      created_by_username,
      created_at_date,
      created_at_time
    FROM beginners_course_participants_old;
    DROP TABLE beginners_course_participants_old;
    PRAGMA foreign_keys = ON;
  `);
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS equipment_loans_one_open_loan
  ON equipment_loans (equipment_item_id)
  WHERE returned_at_date IS NULL
`);

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
  for (const user of serverRuntime.isLive ? liveSeedUsers : seedUsers) {
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
  for (const role of COMMITTEE_ROLE_SEED) {
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
    committee_roles.responsibilities,
    committee_roles.personal_blurb,
    committee_roles.photo_data_url,
    committee_roles.display_order,
    committee_roles.assigned_username,
    users.first_name AS assigned_first_name,
    users.surname AS assigned_surname,
    user_types.user_type AS assigned_user_type
  FROM committee_roles
  LEFT JOIN users ON users.username = committee_roles.assigned_username
  LEFT JOIN user_types ON user_types.user_id = users.id
  ORDER BY committee_roles.display_order ASC, committee_roles.title ASC
`);

const findCommitteeRoleById = db.prepare(`
  SELECT
    id,
    role_key,
    title,
    summary,
    responsibilities,
    personal_blurb,
    photo_data_url,
    display_order,
    assigned_username
  FROM committee_roles
  WHERE id = ?
`);

const findCommitteeRoleByKey = db.prepare(`
  SELECT
    id,
    role_key,
    title
  FROM committee_roles
  WHERE role_key = ?
`);

const updateCommitteeRoleDetails = db.prepare(`
  UPDATE committee_roles
  SET
    title = @title,
    summary = @summary,
    responsibilities = @responsibilities,
    personal_blurb = @personalBlurb,
    photo_data_url = @photoDataUrl,
    assigned_username = @assignedUsername
  WHERE id = @id
`);

const insertCommitteeRole = db.prepare(`
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
  VALUES (
    @roleKey,
    @title,
    @summary,
    @responsibilities,
    @personalBlurb,
    @photoDataUrl,
    @displayOrder,
    @assignedUsername
  )
`);

const deleteCommitteeRoleById = db.prepare(`
  DELETE FROM committee_roles
  WHERE id = ?
`);

const findMaxCommitteeRoleDisplayOrder = db.prepare(`
  SELECT COALESCE(MAX(display_order), 0) AS maxDisplayOrder
  FROM committee_roles
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
    @quiver,
    @returnedQuiver,
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
    quiver = excluded.quiver,
    returned_quiver = excluded.returned_quiver,
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

const listEquipmentItems = db.prepare(`
  SELECT
    equipment_items.*,
    added_by.first_name AS added_by_first_name,
    added_by.surname AS added_by_surname,
    decommissioned_by.first_name AS decommissioned_by_first_name,
    decommissioned_by.surname AS decommissioned_by_surname,
    assigned_by.first_name AS assigned_by_first_name,
    assigned_by.surname AS assigned_by_surname,
    storage_by.first_name AS storage_by_first_name,
    storage_by.surname AS storage_by_surname,
    location_member.first_name AS location_member_first_name,
    location_member.surname AS location_member_surname,
    location_case.item_number AS location_case_number,
    location_case.equipment_type AS location_case_type
  FROM equipment_items
  LEFT JOIN users AS added_by
    ON added_by.id = equipment_items.added_by_user_id
  LEFT JOIN users AS decommissioned_by
    ON decommissioned_by.id = equipment_items.decommissioned_by_user_id
  LEFT JOIN users AS assigned_by
    ON assigned_by.id = equipment_items.last_assignment_by_user_id
  LEFT JOIN users AS storage_by
    ON storage_by.id = equipment_items.last_storage_updated_by_user_id
  LEFT JOIN users AS location_member
    ON location_member.id = equipment_items.location_member_user_id
  LEFT JOIN equipment_items AS location_case
    ON location_case.id = equipment_items.location_case_id
  ORDER BY equipment_items.equipment_type ASC, equipment_items.item_number ASC, equipment_items.id ASC
`);

const findEquipmentItemById = db.prepare(`
  SELECT *
  FROM equipment_items
  WHERE id = ?
`);

const findEquipmentItemByIdWithRelations = db.prepare(`
  SELECT
    equipment_items.*,
    location_case.item_number AS location_case_number
  FROM equipment_items
  LEFT JOIN equipment_items AS location_case
    ON location_case.id = equipment_items.location_case_id
  WHERE equipment_items.id = ?
`);

const listEquipmentItemsByCaseId = db.prepare(`
  SELECT *
  FROM equipment_items
  WHERE location_case_id = ?
    AND status = 'active'
  ORDER BY equipment_type ASC, item_number ASC, id ASC
`);

const findActiveEquipmentByIdentity = db.prepare(`
  SELECT id
  FROM equipment_items
  WHERE equipment_type = ?
    AND size_category = ?
    AND item_number = ?
    AND status = 'active'
`);

const insertEquipmentItem = db.prepare(`
  INSERT INTO equipment_items (
    equipment_type,
    item_number,
    size_category,
    arrow_length,
    arrow_quantity,
    status,
    location_type,
    location_label,
    location_case_id,
    location_member_username,
    added_by_username,
    added_at_date,
    added_at_time,
    last_storage_updated_by_username,
    last_storage_updated_at_date,
    last_storage_updated_at_time
  )
  VALUES (
    @equipmentType,
    @itemNumber,
    @sizeCategory,
    @arrowLength,
    @arrowQuantity,
    'active',
    @locationType,
    @locationLabel,
    @locationCaseId,
    @locationMemberUsername,
    @addedByUsername,
    @addedAtDate,
    @addedAtTime,
    @storageByUsername,
    @storageAtDate,
    @storageAtTime
  )
`);

const updateEquipmentItemForDecommission = db.prepare(`
  UPDATE equipment_items
  SET
    status = 'decommissioned',
    location_type = 'cupboard',
    location_label = @locationLabel,
    location_case_id = NULL,
    location_member_username = NULL,
    decommissioned_by_username = @decommissionedByUsername,
    decommissioned_at_date = @decommissionedAtDate,
    decommissioned_at_time = @decommissionedAtTime,
    decommission_reason = @decommissionReason
  WHERE id = @id
`);

const updateEquipmentItemStorage = db.prepare(`
  UPDATE equipment_items
  SET
    location_type = @locationType,
    location_label = @locationLabel,
    location_case_id = @locationCaseId,
    location_member_username = @locationMemberUsername,
    last_storage_updated_by_username = @storageByUsername,
    last_storage_updated_at_date = @storageAtDate,
    last_storage_updated_at_time = @storageAtTime
  WHERE id = @id
`);

const updateEquipmentAssignmentMetadata = db.prepare(`
  UPDATE equipment_items
  SET
    last_assignment_by_username = @assignedByUsername,
    last_assignment_at_date = @assignedAtDate,
    last_assignment_at_time = @assignedAtTime
  WHERE id = @id
`);

const listEquipmentStorageLocations = db.prepare(`
  SELECT label
  FROM equipment_storage_locations
  ORDER BY lower(label) ASC
`);

const findEquipmentStorageLocationByLabel = db.prepare(`
  SELECT label
  FROM equipment_storage_locations
  WHERE label = ?
`);

const countEquipmentItemsByStorageLocation = db.prepare(`
  SELECT COUNT(*) AS count
  FROM equipment_items
  WHERE location_type = 'cupboard'
    AND location_label = ?
    AND status = 'active'
`);

const insertEquipmentStorageLocation = db.prepare(`
  INSERT INTO equipment_storage_locations (
    label,
    created_at_date,
    created_at_time
  )
  VALUES (?, ?, ?)
`);

const deleteEquipmentStorageLocation = db.prepare(`
  DELETE FROM equipment_storage_locations
  WHERE label = ?
`);

const listEquipmentLoans = db.prepare(`
  SELECT
    equipment_loans.*,
    member.first_name AS member_first_name,
    member.surname AS member_surname,
    loaned_by.first_name AS loaned_by_first_name,
    loaned_by.surname AS loaned_by_surname,
    returned_by.first_name AS returned_by_first_name,
    returned_by.surname AS returned_by_surname,
    context_case.item_number AS context_case_number
  FROM equipment_loans
  LEFT JOIN users AS member
    ON member.id = equipment_loans.member_user_id
  LEFT JOIN users AS loaned_by
    ON loaned_by.id = equipment_loans.loaned_by_user_id
  LEFT JOIN users AS returned_by
    ON returned_by.id = equipment_loans.returned_by_user_id
  LEFT JOIN equipment_items AS context_case
    ON context_case.id = equipment_loans.loan_context_case_id
  ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
`);

const findOpenEquipmentLoanByItemId = db.prepare(`
  SELECT *
  FROM equipment_loans
  WHERE equipment_item_id = ?
    AND returned_at_date IS NULL
  LIMIT 1
`);

const listOpenEquipmentLoansByCaseId = db.prepare(`
  SELECT *
  FROM equipment_loans
  WHERE loan_context_case_id = ?
    AND returned_at_date IS NULL
`);

const listOpenEquipmentLoansByMemberUserId = db.prepare(`
  SELECT
    equipment_loans.*,
    equipment_items.equipment_type,
    equipment_items.item_number,
    equipment_items.size_category,
    equipment_items.arrow_length,
    equipment_items.arrow_quantity
  FROM equipment_loans
  INNER JOIN equipment_items
    ON equipment_items.id = equipment_loans.equipment_item_id
  WHERE equipment_loans.member_user_id = ?
    AND equipment_loans.returned_at_date IS NULL
  ORDER BY equipment_loans.loaned_at_date DESC, equipment_loans.loaned_at_time DESC, equipment_loans.id DESC
`);

const insertEquipmentLoan = db.prepare(`
  INSERT INTO equipment_loans (
    equipment_item_id,
    member_username,
    loaned_by_username,
    loaned_at_date,
    loaned_at_time,
    loan_context_case_id
  )
  VALUES (?, ?, ?, ?, ?, ?)
`);

const closeEquipmentLoan = db.prepare(`
  UPDATE equipment_loans
  SET
    returned_by_username = ?,
    returned_at_date = ?,
    returned_at_time = ?,
    return_location_type = ?,
    return_location_label = ?,
    return_case_id = ?
  WHERE id = ?
`);

const listBeginnersCourses = db.prepare(`
  SELECT
    beginners_courses.*,
    coordinator.first_name AS coordinator_first_name,
    coordinator.surname AS coordinator_surname,
    submitted_by.first_name AS submitted_by_first_name,
    submitted_by.surname AS submitted_by_surname,
    approved_by.first_name AS approved_by_first_name,
    approved_by.surname AS approved_by_surname
  FROM beginners_courses
  INNER JOIN users AS coordinator
    ON coordinator.id = beginners_courses.coordinator_user_id
  INNER JOIN users AS submitted_by
    ON submitted_by.id = beginners_courses.submitted_by_user_id
  LEFT JOIN users AS approved_by
    ON approved_by.id = beginners_courses.approved_by_user_id
  ORDER BY beginners_courses.first_lesson_date ASC, beginners_courses.start_time ASC, beginners_courses.id ASC
`);

const findBeginnersCourseById = db.prepare(`
  SELECT *
  FROM beginners_courses
  WHERE id = ?
`);

const insertBeginnersCourse = db.prepare(`
  INSERT INTO beginners_courses (
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
    created_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateBeginnersCourseApproval = db.prepare(`
  UPDATE beginners_courses
  SET
    approval_status = ?,
    rejection_reason = ?,
    approved_by_username = ?,
    approved_at_date = ?,
    approved_at_time = ?
  WHERE id = ?
`);

const cancelBeginnersCourse = db.prepare(`
  UPDATE beginners_courses
  SET
    is_cancelled = 1,
    cancellation_reason = ?,
    cancelled_by_username = ?,
    cancelled_at_date = ?,
    cancelled_at_time = ?
  WHERE id = ?
`);

const listBeginnersCourseLessons = db.prepare(`
  SELECT
    beginners_course_lessons.*
  FROM beginners_course_lessons
  ORDER BY beginners_course_lessons.lesson_date ASC, beginners_course_lessons.start_time ASC, beginners_course_lessons.lesson_number ASC
`);

const listBeginnersCourseLessonsByCourseId = db.prepare(`
  SELECT *
  FROM beginners_course_lessons
  WHERE course_id = ?
  ORDER BY lesson_number ASC
`);

const findBeginnersCourseLessonById = db.prepare(`
  SELECT *
  FROM beginners_course_lessons
  WHERE id = ?
`);

const insertBeginnersCourseLesson = db.prepare(`
  INSERT INTO beginners_course_lessons (
    course_id,
    lesson_number,
    lesson_date,
    start_time,
    end_time
  )
  VALUES (?, ?, ?, ?, ?)
`);

const listBeginnersCourseParticipants = db.prepare(`
  SELECT
    beginners_course_participants.*,
    users.password IS NOT NULL AND users.password <> '' AS password_set,
    user_types.user_type AS participant_user_type,
    case_item.item_number AS assigned_case_number
  FROM beginners_course_participants
  INNER JOIN users
    ON users.id = beginners_course_participants.user_id
  INNER JOIN user_types
    ON user_types.user_id = users.id
  LEFT JOIN equipment_items AS case_item
    ON case_item.id = beginners_course_participants.assigned_case_id
  ORDER BY beginners_course_participants.course_id ASC, beginners_course_participants.surname ASC, beginners_course_participants.first_name ASC
`);

const listBeginnersCourseParticipantsByCourseId = db.prepare(`
  SELECT
    beginners_course_participants.*,
    users.password IS NOT NULL AND users.password <> '' AS password_set,
    user_types.user_type AS participant_user_type,
    case_item.item_number AS assigned_case_number
  FROM beginners_course_participants
  INNER JOIN users
    ON users.id = beginners_course_participants.user_id
  INNER JOIN user_types
    ON user_types.user_id = users.id
  LEFT JOIN equipment_items AS case_item
    ON case_item.id = beginners_course_participants.assigned_case_id
  WHERE beginners_course_participants.course_id = ?
  ORDER BY beginners_course_participants.surname ASC, beginners_course_participants.first_name ASC
`);

const findBeginnersCourseParticipantById = db.prepare(`
  SELECT *
  FROM beginners_course_participants
  WHERE id = ?
`);

const findBeginnersCourseParticipantByUsername = db.prepare(`
  SELECT *
  FROM beginners_course_participants
  WHERE username = ?
`);

const listBeginnersCourseParticipantLoginDates = db.prepare(`
  SELECT
    beginners_course_participants.course_id,
    beginners_course_participants.username,
    login_events.logged_in_date
  FROM beginners_course_participants
  INNER JOIN users
    ON users.id = beginners_course_participants.user_id
  INNER JOIN login_events
    ON login_events.user_id = users.id
  ORDER BY beginners_course_participants.course_id ASC,
    beginners_course_participants.username ASC,
    login_events.logged_in_date ASC
`);

const insertBeginnersCourseParticipant = db.prepare(`
  INSERT INTO beginners_course_participants (
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
    assigned_case_id,
    assigned_case_by_username,
    assigned_case_at_date,
    assigned_case_at_time,
    created_by_username,
    created_at_date,
    created_at_time
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateBeginnersCourseParticipant = db.prepare(`
  UPDATE beginners_course_participants
  SET
    first_name = @firstName,
    surname = @surname,
    beginner_size_category = @sizeCategory,
    height_text = @heightText,
    handedness = @handedness,
    eye_dominance = @eyeDominance,
    initial_email_sent = @initialEmailSent,
    thirty_day_reminder_sent = @thirtyDayReminderSent,
    course_fee_paid = @courseFeePaid
  WHERE id = @id
`);

const updateBeginnersCourseParticipantCase = db.prepare(`
  UPDATE beginners_course_participants
  SET
    assigned_case_id = ?,
    assigned_case_by_username = ?,
    assigned_case_at_date = ?,
    assigned_case_at_time = ?
  WHERE id = ?
`);

const markBeginnersCourseParticipantConverted = db.prepare(`
  UPDATE beginners_course_participants
  SET converted_to_member = 1
  WHERE id = ?
`);

const listBeginnersLessonCoaches = db.prepare(`
  SELECT
    beginners_course_lesson_coaches.lesson_id,
    beginners_course_lesson_coaches.coach_username,
    users.first_name,
    users.surname
  FROM beginners_course_lesson_coaches
  INNER JOIN users
    ON users.id = beginners_course_lesson_coaches.coach_user_id
  ORDER BY beginners_course_lesson_coaches.lesson_id ASC, users.surname ASC, users.first_name ASC
`);

const listBeginnersLessonCoachesByLessonId = db.prepare(`
  SELECT
    beginners_course_lesson_coaches.lesson_id,
    beginners_course_lesson_coaches.coach_username,
    users.first_name,
    users.surname
  FROM beginners_course_lesson_coaches
  INNER JOIN users
    ON users.id = beginners_course_lesson_coaches.coach_user_id
  WHERE beginners_course_lesson_coaches.lesson_id = ?
  ORDER BY users.surname ASC, users.first_name ASC
`);

const insertBeginnersLessonCoach = db.prepare(`
  INSERT OR IGNORE INTO beginners_course_lesson_coaches (
    lesson_id,
    coach_username,
    assigned_by_username,
    assigned_at_date,
    assigned_at_time
  )
  VALUES (?, ?, ?, ?, ?)
`);

const deleteBeginnersLessonCoachesByLessonId = db.prepare(`
  DELETE FROM beginners_course_lesson_coaches
  WHERE lesson_id = ?
`);

const listCoachBeginnersLessonsByUserId = db.prepare(`
  SELECT
    beginners_course_lessons.id,
    beginners_course_lessons.course_id,
    beginners_course_lessons.lesson_number,
    beginners_course_lessons.lesson_date,
    beginners_course_lessons.start_time,
    beginners_course_lessons.end_time,
    beginners_courses.first_lesson_date,
    coordinator.first_name AS coordinator_first_name,
    coordinator.surname AS coordinator_surname
  FROM beginners_course_lesson_coaches
  INNER JOIN beginners_course_lessons
    ON beginners_course_lessons.id = beginners_course_lesson_coaches.lesson_id
  INNER JOIN beginners_courses
    ON beginners_courses.id = beginners_course_lessons.course_id
  INNER JOIN users AS coordinator
    ON coordinator.id = beginners_courses.coordinator_user_id
  WHERE beginners_course_lesson_coaches.coach_user_id = ?
    AND beginners_courses.is_cancelled = 0
    AND beginners_courses.approval_status = 'approved'
  ORDER BY beginners_course_lessons.lesson_date ASC, beginners_course_lessons.start_time ASC
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
  INNER JOIN users ON users.id = coaching_sessions.coach_user_id
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
  INNER JOIN users ON users.id = coaching_sessions.coach_user_id
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
  INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
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
  INNER JOIN users ON users.id = coaching_session_bookings.member_user_id
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
  WHERE coaching_session_id = ? AND member_user_id = ?
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

const findMemberCoachingBookingsByUserId = db.prepare(`
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
  INNER JOIN users ON users.id = coaching_sessions.coach_user_id
  WHERE coaching_session_bookings.member_user_id = ?
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
  INNER JOIN users ON users.id = tournaments.created_by_user_id
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
  INNER JOIN users ON users.id = tournaments.created_by_user_id
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
  INNER JOIN users ON users.id = tournament_registrations.member_user_id
  INNER JOIN user_types ON user_types.user_id = users.id
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
  INNER JOIN users ON users.id = tournament_registrations.member_user_id
  INNER JOIN user_types ON user_types.user_id = users.id
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
  WHERE tournament_id = ? AND member_user_id = ?
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
  INNER JOIN users ON users.id = event_bookings.member_user_id
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
  INNER JOIN users ON users.id = event_bookings.member_user_id
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
  WHERE club_event_id = ? AND member_user_id = ?
`);

const deleteBookingsByEventId = db.prepare(`
  DELETE FROM event_bookings
  WHERE club_event_id = ?
`);

const deleteClubEventById = db.prepare(`
  DELETE FROM club_events
  WHERE id = ?
`);

const findMemberEventBookingsByUserId = db.prepare(`
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
  WHERE event_bookings.member_user_id = ?
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

const insertAuditEvent = db.prepare(`
  INSERT INTO audit_events (
    actor_username,
    action,
    target,
    status_code,
    ip_address,
    user_agent,
    metadata_json,
    created_at_date,
    created_at_time
  )
  VALUES (
    @actorUsername,
    @action,
    @target,
    @statusCode,
    @ipAddress,
    @userAgent,
    @metadataJson,
    @createdAtDate,
    @createdAtTime
  )
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
  INNER JOIN users ON users.id = login_events.user_id
  INNER JOIN user_types ON user_types.user_id = users.id
  WHERE (login_events.logged_in_date || 'T' || login_events.logged_in_time) >= ?
  GROUP BY users.id, users.username, users.first_name, users.surname, users.rfid_tag, users.active_member, users.membership_fees_due, user_types.user_type
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

const listReportingMemberLogins = db.prepare(`
  SELECT
    login_events.id,
    COALESCE(users.username, login_events.username) AS username,
    users.first_name,
    users.surname,
    login_events.login_method,
    login_events.logged_in_date,
    login_events.logged_in_time
  FROM login_events
  LEFT JOIN users ON users.id = login_events.user_id
  WHERE (login_events.logged_in_date || 'T' || login_events.logged_in_time) >= ?
    AND (login_events.logged_in_date || 'T' || login_events.logged_in_time) < ?
  ORDER BY login_events.logged_in_date ASC, login_events.logged_in_time ASC, surname ASC, first_name ASC
`);

const listReportingGuestLogins = db.prepare(`
  SELECT
    id,
    first_name,
    surname,
    archery_gb_membership_number,
    invited_by_username,
    invited_by_name,
    logged_in_date,
    logged_in_time
  FROM guest_login_events
  WHERE (logged_in_date || 'T' || logged_in_time) >= ?
    AND (logged_in_date || 'T' || logged_in_time) < ?
  ORDER BY logged_in_date ASC, logged_in_time ASC, surname ASC, first_name ASC
`);

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(authRateLimiter);
app.use(createAuditMiddleware(insertAuditEvent));

function buildMemberUserProfile(user, disciplines = [], meta = {}) {
  const permissions = getPermissionsForRole(user.user_type);

  return {
    id: user.username,
    userId: user.id,
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
      coachingVolunteer: Boolean(user.coaching_volunteer),
      ...meta,
    },
  };
}

function isBeginnersCourseCoachEligible(user) {
  if (!user) {
    return false;
  }

  return (
    getPermissionsForRole(user.user_type).includes(
      PERMISSIONS.ADD_COACHING_SESSIONS,
    ) || Boolean(user.coaching_volunteer)
  );
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
    quiver: false,
    returnedQuiver: false,
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
    quiver: Boolean(record.quiver),
    returnedQuiver: Boolean(record.returned_quiver),
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
    userId: user.id,
    username: user.username,
    firstName: user.first_name,
    surname: user.surname,
    password: "",
    rfidTag: user.rfid_tag ?? "",
    activeMember: Boolean(user.active_member),
    membershipFeesDue: user.membership_fees_due ?? "",
    coachingVolunteer: Boolean(user.coaching_volunteer),
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

function addDaysToIsoDate(dateString, daysToAdd) {
  const nextDate = new Date(`${dateString}T12:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
  return nextDate.toISOString().slice(0, 10);
}

function buildBeginnersLessonDates(firstLessonDate, lessonCount) {
  return Array.from({ length: lessonCount }, (_value, index) => ({
    lessonNumber: index + 1,
    lessonDate: addDaysToIsoDate(firstLessonDate, index * 7),
  }));
}

function sanitizeBeginnersCoursePayload(payload) {
  const firstLessonDate =
    typeof payload?.firstLessonDate === "string" ? payload.firstLessonDate.trim() : "";
  const startTime =
    typeof payload?.startTime === "string" ? payload.startTime.trim() : "";
  const endTime =
    typeof payload?.endTime === "string" ? payload.endTime.trim() : "";
  const lessonCount = Number.parseInt(payload?.lessonCount, 10);
  const beginnerCapacity = Number.parseInt(payload?.beginnerCapacity, 10);
  const coordinatorUsername =
    typeof payload?.coordinatorUsername === "string"
      ? payload.coordinatorUsername.trim()
      : "";

  if (!coordinatorUsername || !findUserByUsername.get(coordinatorUsername)) {
    return {
      success: false,
      status: 400,
      message: "Choose a valid course coordinator.",
    };
  }

  if (!firstLessonDate) {
    return {
      success: false,
      status: 400,
      message: "Choose the first lesson date.",
    };
  }

  if (!startTime || !endTime || endTime <= startTime) {
    return {
      success: false,
      status: 400,
      message: "Choose a valid lesson start and end time.",
    };
  }

  if (!Number.isInteger(lessonCount) || lessonCount < 1 || lessonCount > 24) {
    return {
      success: false,
      status: 400,
      message: "Number of lessons must be between 1 and 24.",
    };
  }

  if (!Number.isInteger(beginnerCapacity) || beginnerCapacity < 1 || beginnerCapacity > 48) {
    return {
      success: false,
      status: 400,
      message: "Beginner places must be between 1 and 48.",
    };
  }

  return {
    success: true,
    value: {
      coordinatorUsername,
      firstLessonDate,
      startTime,
      endTime,
      lessonCount,
      beginnerCapacity,
    },
  };
}

function normalizeOptionalDirection(value) {
  if (value === "left" || value === "right") {
    return value;
  }

  return null;
}

function sanitizeBeginnersParticipantPayload(payload) {
  const firstName =
    typeof payload?.firstName === "string" ? payload.firstName.trim() : "";
  const surname =
    typeof payload?.surname === "string" ? payload.surname.trim() : "";
  const sizeCategory =
    payload?.sizeCategory === "junior" ? "junior" : "senior";
  const heightText =
    typeof payload?.heightText === "string" ? payload.heightText.trim().slice(0, 80) : "";

  if (!firstName || !surname) {
    return {
      success: false,
      status: 400,
      message: "First name and surname are required for each beginner.",
    };
  }

  return {
    success: true,
    value: {
      firstName,
      surname,
      sizeCategory,
      heightText: heightText || null,
      handedness: normalizeOptionalDirection(payload?.handedness),
      eyeDominance: normalizeOptionalDirection(payload?.eyeDominance),
      initialEmailSent: Boolean(payload?.initialEmailSent),
      thirtyDayReminderSent: Boolean(payload?.thirtyDayReminderSent),
      courseFeePaid: Boolean(payload?.courseFeePaid),
    },
  };
}

function buildBeginnersPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "0123456789";
  let value = "";

  for (let index = 0; index < 5; index += 1) {
    value += letters[Math.floor(Math.random() * letters.length)];
  }

  for (let index = 0; index < 2; index += 1) {
    value += digits[Math.floor(Math.random() * digits.length)];
  }

  return value;
}

function buildBeginnersUsername(firstName, surname) {
  const base =
    `${String(firstName ?? "").slice(0, 1)}${String(surname ?? "")}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10) || "beginner";
  let nextUsername = base;
  let counter = 2;

  while (findUserByUsername.get(nextUsername)) {
    const suffix = String(counter);
    nextUsername = `${base.slice(0, Math.max(1, 12 - suffix.length))}${suffix}`;
    counter += 1;
  }

  return nextUsername;
}

function normalizeCourseType(value) {
  return value === "have-a-go" ? "have-a-go" : "beginners";
}

function getRequestedCourseType(req) {
  if (typeof req.query?.courseType === "string") {
    return normalizeCourseType(req.query.courseType);
  }

  if (typeof req.body?.courseType === "string") {
    return normalizeCourseType(req.body.courseType);
  }

  return null;
}

function requestMatchesCourseType(req, course) {
  const requestedCourseType = getRequestedCourseType(req);

  if (!requestedCourseType) {
    return true;
  }

  return requestedCourseType === normalizeCourseType(course?.course_type);
}

function getCourseTypePermissions(courseType) {
  return normalizeCourseType(courseType) === "have-a-go"
    ? {
        manage: PERMISSIONS.MANAGE_HAVE_A_GO_SESSIONS,
        approve: PERMISSIONS.APPROVE_HAVE_A_GO_SESSIONS,
      }
    : {
        manage: PERMISSIONS.MANAGE_BEGINNERS_COURSES,
        approve: PERMISSIONS.APPROVE_BEGINNERS_COURSES,
      };
}

function getCourseParticipantUserType(courseType) {
  return COURSE_PARTICIPANT_USER_TYPES[normalizeCourseType(courseType)] ?? "beginner";
}

function buildBeginnersCourseDashboard(courseType = "beginners") {
  const normalizedCourseType = normalizeCourseType(courseType);
  const courses = listBeginnersCourses
    .all()
    .filter((course) => normalizeCourseType(course.course_type) === normalizedCourseType);
  const lessonsByCourseId = groupRowsBy(
    listBeginnersCourseLessons.all(),
    (lesson) => lesson.course_id,
  );
  const participantsByCourseId = groupRowsBy(
    listBeginnersCourseParticipants.all(),
    (participant) => participant.course_id,
  );
  const loginDatesByCourseParticipant = groupRowsBy(
    listBeginnersCourseParticipantLoginDates.all(),
    (row) => `${row.course_id}:${row.username}`,
    (row) => row.logged_in_date,
  );
  const coachesByLessonId = groupRowsBy(
    listBeginnersLessonCoaches.all(),
    (row) => row.lesson_id,
    (row) => ({
      username: row.coach_username,
      fullName: `${row.first_name} ${row.surname}`.trim(),
    }),
  );

  return courses.map((course) => {
    const lessons = (lessonsByCourseId.get(course.id) ?? []).map((lesson) => ({
      id: lesson.id,
      lessonNumber: lesson.lesson_number,
      date: lesson.lesson_date,
      startTime: lesson.start_time,
      endTime: lesson.end_time,
      coaches: coachesByLessonId.get(lesson.id) ?? [],
    }));
    const beginners = (participantsByCourseId.get(course.id) ?? []).map((participant) => ({
      id: participant.id,
      username: participant.username,
      passwordSet: Boolean(participant.password_set),
      userType: participant.participant_user_type,
      firstName: participant.first_name,
      surname: participant.surname,
      fullName: `${participant.first_name} ${participant.surname}`.trim(),
      sizeCategory: participant.beginner_size_category,
      heightText: participant.height_text ?? "",
      handedness: participant.handedness ?? "",
      eyeDominance: participant.eye_dominance ?? "",
      initialEmailSent: Boolean(participant.initial_email_sent),
      thirtyDayReminderSent: Boolean(participant.thirty_day_reminder_sent),
      courseFeePaid: Boolean(participant.course_fee_paid),
      attendanceDates: [
        ...new Set(
          loginDatesByCourseParticipant.get(
            `${participant.course_id}:${participant.username}`,
          ) ?? [],
        ),
      ],
      convertedToMember:
        Boolean(participant.converted_to_member) ||
        participant.participant_user_type !== "beginner",
      assignedCaseId: participant.assigned_case_id ?? null,
      assignedCaseNumber: participant.assigned_case_number ?? "",
    }));

    return {
      id: course.id,
      coordinatorUsername: course.coordinator_username,
      coordinatorName: getUserDisplayName(course, "coordinator_first_name", "coordinator_surname"),
      submittedByUsername: course.submitted_by_username,
      submittedByName: getUserDisplayName(course, "submitted_by_first_name", "submitted_by_surname"),
      approvedByUsername: course.approved_by_username ?? "",
      approvedByName: getUserDisplayName(course, "approved_by_first_name", "approved_by_surname"),
      firstLessonDate: course.first_lesson_date,
      startTime: course.start_time,
      endTime: course.end_time,
      lessonCount: course.lesson_count,
      beginnerCapacity: course.beginner_capacity,
      approvalStatus: course.approval_status,
      isCancelled: Boolean(course.is_cancelled),
      cancellationReason: course.cancellation_reason ?? "",
      rejectionReason: course.rejection_reason ?? "",
      createdAt: `${course.created_at_date} ${course.created_at_time}`.trim(),
      approvedAt: course.approved_at_date
        ? `${course.approved_at_date} ${course.approved_at_time}`.trim()
        : "",
      lessons,
      beginners,
      placesRemaining: Math.max(course.beginner_capacity - beginners.length, 0),
    };
  });
}

function hasBeginnersCourseCompleted(course) {
  if (!course) {
    return false;
  }

  const lessons = listBeginnersCourseLessonsByCourseId.all(course.id);

  if (!lessons.length) {
    return false;
  }

  const lastLesson = [...lessons].sort((left, right) => {
    const byDate = left.lesson_date.localeCompare(right.lesson_date);

    if (byDate !== 0) {
      return byDate;
    }

    const byEndTime = left.end_time.localeCompare(right.end_time);

    if (byEndTime !== 0) {
      return byEndTime;
    }

    return left.lesson_number - right.lesson_number;
  })[lessons.length - 1];

  return hasScheduleEntryEnded(lastLesson.lesson_date, lastLesson.end_time);
}

function buildBeginnersCourseCalendarLessons(courseType = null) {
  const requestedCourseType =
    typeof courseType === "string" ? normalizeCourseType(courseType) : null;
  const approvedCourses = listBeginnersCourses
    .all()
    .filter(
      (course) =>
        (!requestedCourseType ||
          normalizeCourseType(course.course_type) === requestedCourseType) &&
        (course.approval_status ?? "pending") === "approved",
    );
  const lessonsByCourseId = groupRowsBy(
    listBeginnersCourseLessons.all(),
    (lesson) => lesson.course_id,
  );
  const participantsByCourseId = groupRowsBy(
    listBeginnersCourseParticipants.all(),
    (participant) => participant.course_id,
  );
  const coachesByLessonId = groupRowsBy(
    listBeginnersLessonCoaches.all(),
    (row) => row.lesson_id,
    (row) => `${row.first_name} ${row.surname}`.trim(),
  );

  return approvedCourses
    .flatMap((course) => {
      const normalizedCourseType = normalizeCourseType(course.course_type);
      const participantCount = (participantsByCourseId.get(course.id) ?? []).length;
      const title =
        normalizedCourseType === "have-a-go"
          ? "Have a Go session"
          : "Beginners course";

      return (lessonsByCourseId.get(course.id) ?? []).map((lesson) => ({
        id: `${normalizedCourseType}-course-${course.id}-lesson-${lesson.id}`,
        courseId: course.id,
        lessonId: lesson.id,
        courseType: normalizedCourseType,
        title,
        date: lesson.lesson_date,
        startTime: lesson.start_time,
        endTime: lesson.end_time,
        lessonNumber: lesson.lesson_number,
        coordinatorName: getUserDisplayName(
          course,
          "coordinator_first_name",
          "coordinator_surname",
        ),
        coachNames: coachesByLessonId.get(lesson.id) ?? [],
        beginnerCount: participantCount,
        participantCount,
        beginnerCapacity: course.beginner_capacity,
        participantCapacity: course.beginner_capacity,
        placesRemaining: Math.max(course.beginner_capacity - participantCount, 0),
        isCancelled: Boolean(course.is_cancelled),
        cancellationReason: course.cancellation_reason ?? "",
      }));
    })
    .sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      return byDate !== 0
        ? byDate
        : left.startTime.localeCompare(right.startTime);
    });
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
  const assignedFullName = [role.assigned_first_name, role.assigned_surname]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    id: role.id,
    roleKey: role.role_key,
    title: role.title,
    summary: role.summary,
    responsibilities: role.responsibilities ?? role.summary,
    personalBlurb: role.personal_blurb ?? "",
    photoDataUrl: role.photo_data_url ?? null,
    displayOrder: role.display_order,
    assignedMember: role.assigned_username
      ? {
          username: role.assigned_username,
          fullName: assignedFullName || role.assigned_username,
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
  return getSessionUsername(req);
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

function getUserDisplayName(userOrLoanRow, firstNameKey = "first_name", surnameKey = "surname") {
  if (!userOrLoanRow) {
    return "";
  }

  const firstName = userOrLoanRow[firstNameKey] ?? "";
  const surname = userOrLoanRow[surnameKey] ?? "";

  return `${firstName} ${surname}`.trim();
}

function normalizeEquipmentType(value) {
  return EQUIPMENT_TYPE_OPTIONS.includes(value) ? value : "";
}

function normalizeEquipmentSizeCategory(value) {
  return EQUIPMENT_SIZE_CATEGORIES.includes(value) ? value : "standard";
}

function sanitizeEquipmentNumber(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 60);
}

function sanitizeCupboardLabel(value) {
  if (typeof value !== "string") {
    return DEFAULT_EQUIPMENT_CUPBOARD_LABEL;
  }

  const trimmed = value.trim();
  return trimmed.slice(0, 80) || DEFAULT_EQUIPMENT_CUPBOARD_LABEL;
}

function buildEquipmentDisplayLabel(item) {
  const typeLabel = EQUIPMENT_TYPE_LABELS[item.equipment_type] ?? item.equipment_type;
  const sizePrefix = item.size_category === "junior" ? "Junior " : "";

  if (item.equipment_type === EQUIPMENT_TYPES.ARROWS) {
    return `${sizePrefix}${item.arrow_quantity} x ${item.arrow_length}" ${typeLabel}`;
  }

  if (item.item_number) {
    return `${sizePrefix}${typeLabel} ${item.item_number}`.trim();
  }

  return `${sizePrefix}${typeLabel}`.trim();
}

function buildEquipmentIdentity(item) {
  return {
    id: item.id,
    type: item.equipment_type,
    typeLabel: EQUIPMENT_TYPE_LABELS[item.equipment_type] ?? item.equipment_type,
    label: buildEquipmentDisplayLabel(item),
    number: item.item_number ?? "",
    sizeCategory: item.size_category,
    arrowLength: item.arrow_length ?? null,
    arrowQuantity: item.arrow_quantity ?? null,
    status: item.status,
  };
}

function buildEquipmentMaps() {
  const items = listEquipmentItems.all();
  const loans = listEquipmentLoans.all();
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const contentsByCaseId = new Map();
  const openLoanByItemId = new Map();

  for (const loan of loans) {
    if (!loan.returned_at_date) {
      openLoanByItemId.set(loan.equipment_item_id, loan);
    }
  }

  for (const item of items) {
    if (!item.location_case_id) {
      continue;
    }

    const currentContents = contentsByCaseId.get(item.location_case_id) ?? [];
    currentContents.push(item);
    contentsByCaseId.set(item.location_case_id, currentContents);
  }

  return {
    items,
    itemsById,
    loans,
    contentsByCaseId,
    openLoanByItemId,
  };
}

function getEquipmentCurrentLocation(item, maps) {
  const openLoan = maps.openLoanByItemId.get(item.id) ?? null;

  if (item.location_type === EQUIPMENT_LOCATION_TYPES.CASE && item.location_case_id) {
    const caseItem = maps.itemsById.get(item.location_case_id);

    return {
      type: EQUIPMENT_LOCATION_TYPES.CASE,
      label: caseItem?.item_number ? `Case ${caseItem.item_number}` : "Case",
      memberUsername: null,
      caseId: caseItem?.id ?? item.location_case_id,
      caseNumber: caseItem?.item_number ?? "",
      viaCase: false,
      storageLabel: caseItem?.location_label ?? DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
    };
  }

  if (openLoan) {
    return {
      type: EQUIPMENT_LOCATION_TYPES.MEMBER,
      label: getUserDisplayName(openLoan, "member_first_name", "member_surname"),
      memberUsername: openLoan.member_username,
      caseId: openLoan.loan_context_case_id ?? null,
      caseNumber: openLoan.context_case_number ?? "",
      viaCase: Boolean(
        openLoan.loan_context_case_id &&
        openLoan.loan_context_case_id !== item.id
      ),
      loanedAt: `${openLoan.loaned_at_date} ${openLoan.loaned_at_time}`.trim(),
      signedOutBy: getUserDisplayName(openLoan, "loaned_by_first_name", "loaned_by_surname"),
    };
  }

  if (item.location_type === EQUIPMENT_LOCATION_TYPES.MEMBER) {
    return {
      type: EQUIPMENT_LOCATION_TYPES.MEMBER,
      label: getUserDisplayName(item, "location_member_first_name", "location_member_surname"),
      memberUsername: item.location_member_username,
      caseId: null,
      caseNumber: "",
      viaCase: false,
    };
  }

  return {
    type: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
    label: item.location_label || DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
    memberUsername: null,
    caseId: null,
    caseNumber: "",
    viaCase: false,
  };
}

function buildEquipmentItemResponse(item, maps) {
  const currentLocation = getEquipmentCurrentLocation(item, maps);
  const openLoan = maps.openLoanByItemId.get(item.id) ?? null;
  const isCaseContentLoan =
    item.location_type === EQUIPMENT_LOCATION_TYPES.CASE &&
    item.location_case_id &&
    openLoan?.loan_context_case_id === item.location_case_id;

  return {
    ...buildEquipmentIdentity(item),
    addedBy: getUserDisplayName(item, "added_by_first_name", "added_by_surname"),
    addedAt: `${item.added_at_date} ${item.added_at_time}`.trim(),
    decommissionedBy: getUserDisplayName(
      item,
      "decommissioned_by_first_name",
      "decommissioned_by_surname",
    ),
    decommissionedAt: item.decommissioned_at_date
      ? `${item.decommissioned_at_date} ${item.decommissioned_at_time}`.trim()
      : "",
    decommissionReason: item.decommission_reason ?? "",
    lastAssignedBy: getUserDisplayName(item, "assigned_by_first_name", "assigned_by_surname"),
    lastAssignedAt: item.last_assignment_at_date
      ? `${item.last_assignment_at_date} ${item.last_assignment_at_time}`.trim()
      : "",
    lastStorageUpdatedBy: getUserDisplayName(
      item,
      "storage_by_first_name",
      "storage_by_surname",
    ),
    lastStorageUpdatedAt: item.last_storage_updated_at_date
      ? `${item.last_storage_updated_at_date} ${item.last_storage_updated_at_time}`.trim()
      : "",
    currentLocation,
    currentLoan: openLoan && !isCaseContentLoan
      ? {
          memberUsername: openLoan.member_username,
          memberName: getUserDisplayName(openLoan, "member_first_name", "member_surname"),
          loanedBy: getUserDisplayName(openLoan, "loaned_by_first_name", "loaned_by_surname"),
          loanedAt: `${openLoan.loaned_at_date} ${openLoan.loaned_at_time}`.trim(),
          contextCaseId: openLoan.loan_context_case_id ?? null,
          contextCaseNumber: openLoan.context_case_number ?? "",
        }
      : null,
  };
}

function buildEquipmentCaseResponse(caseItem, maps) {
  const contents = (maps.contentsByCaseId.get(caseItem.id) ?? []).map((item) =>
    buildEquipmentItemResponse(item, maps),
  );

  return {
    ...buildEquipmentItemResponse(caseItem, maps),
    contents,
  };
}

function getCaseCapacityUsage(caseId) {
  const contents = listEquipmentItemsByCaseId.all(caseId);
  const usage = {
    [EQUIPMENT_TYPES.RISER]: 0,
    [EQUIPMENT_TYPES.LIMB]: 0,
    [EQUIPMENT_TYPES.SIGHT]: 0,
    [EQUIPMENT_TYPES.LONG_ROD]: 0,
    [EQUIPMENT_TYPES.ARM_GUARD]: 0,
    [EQUIPMENT_TYPES.CHEST_GUARD]: 0,
    [EQUIPMENT_TYPES.FINGER_TAB]: 0,
    [EQUIPMENT_TYPES.ARROWS]: 0,
  };

  for (const item of contents) {
    if (item.equipment_type === EQUIPMENT_TYPES.ARROWS) {
      usage[EQUIPMENT_TYPES.ARROWS] += item.arrow_quantity ?? 0;
      continue;
    }

    if (Object.hasOwn(usage, item.equipment_type)) {
      usage[item.equipment_type] += 1;
    }
  }

  return usage;
}

function validateCaseAssignment(caseItem, itemToAssign) {
  if (!caseItem || caseItem.equipment_type !== EQUIPMENT_TYPES.CASE) {
    return "Choose a valid case.";
  }

  if (caseItem.status !== "active") {
    return "You can only assign equipment into an active case.";
  }

  if (itemToAssign.equipment_type === EQUIPMENT_TYPES.CASE) {
    return "Cases cannot be stored inside another case.";
  }

  const isAlreadyInTargetCase =
    itemToAssign.location_type === EQUIPMENT_LOCATION_TYPES.CASE &&
    itemToAssign.location_case_id === caseItem.id;

  if (
    itemToAssign.location_type === EQUIPMENT_LOCATION_TYPES.CASE &&
    itemToAssign.location_case_id &&
    !isAlreadyInTargetCase
  ) {
    return "Remove the equipment from its current case before assigning it to a different case.";
  }

  const usage = getCaseCapacityUsage(caseItem.id);
  const nextUsage =
    isAlreadyInTargetCase
      ? usage[itemToAssign.equipment_type]
      : itemToAssign.equipment_type === EQUIPMENT_TYPES.ARROWS
      ? usage[EQUIPMENT_TYPES.ARROWS] + (itemToAssign.arrow_quantity ?? 0)
      : usage[itemToAssign.equipment_type] + 1;
  const limit = EQUIPMENT_CASE_CAPACITY[itemToAssign.equipment_type];

  if (limit && nextUsage > limit) {
    return `Case ${caseItem.item_number} does not have capacity for that item.`;
  }

  return "";
}

function sanitizeEquipmentCreatePayload(payload) {
  const equipmentType = normalizeEquipmentType(payload?.equipmentType);
  const sizeCategory = normalizeEquipmentSizeCategory(payload?.sizeCategory);
  const itemNumber = sanitizeEquipmentNumber(payload?.itemNumber);
  const arrowLength = Number.parseInt(payload?.arrowLength, 10);
  const arrowQuantity = Number.parseInt(payload?.arrowQuantity, 10);

  if (!equipmentType) {
    return {
      success: false,
      status: 400,
      message: "Choose a valid equipment type.",
    };
  }

  if (
    EQUIPMENT_NUMBER_REQUIRED_TYPES.has(equipmentType) &&
    !itemNumber
  ) {
    return {
      success: false,
      status: 400,
      message: "An equipment number is required for that item type.",
    };
  }

  if (equipmentType === EQUIPMENT_TYPES.ARROWS) {
    if (!Number.isInteger(arrowLength) || arrowLength < 20) {
      return {
        success: false,
        status: 400,
        message: 'Arrow length must be 20" or longer.',
      };
    }

    if (!Number.isInteger(arrowQuantity) || arrowQuantity < 1 || arrowQuantity > 12) {
      return {
        success: false,
        status: 400,
        message: "Arrow quantity must be between 1 and 12.",
      };
    }
  }

  const duplicateItem = itemNumber
    ? findActiveEquipmentByIdentity.get(
        equipmentType,
        sizeCategory,
        itemNumber,
      )
    : null;

  if (duplicateItem) {
    return {
      success: false,
      status: 409,
      message: "An active equipment item with that number already exists.",
    };
  }

  return {
    success: true,
    value: {
      equipmentType,
      itemNumber: itemNumber || null,
      sizeCategory,
      arrowLength: equipmentType === EQUIPMENT_TYPES.ARROWS ? arrowLength : null,
      arrowQuantity: equipmentType === EQUIPMENT_TYPES.ARROWS ? arrowQuantity : 1,
    },
  };
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
    quiver: Boolean(loanBow.quiver),
    returnedQuiver: Boolean(loanBow.returnedQuiver),
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
    returnedQuiver: Boolean(loanBowReturn?.returnedQuiver),
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
    returnedLoanBow.returnedQuiver,
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
  coachingVolunteer,
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
  const normalizedCoachingVolunteer = Boolean(coachingVolunteer);
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

  const passwordToSave = trimmedPassword
    ? hashPassword(trimmedPassword)
    : existingUser?.password || null;
  const provisionalUser = syncMemberStatusWithFees({
    username: existingUser?.username ?? trimmedUsername,
    rfid_tag: trimmedRfidTag || null,
    active_member: normalizedActiveMember ? 1 : 0,
    membership_fees_due: normalizedMembershipFeesDue,
    coaching_volunteer: normalizedCoachingVolunteer ? 1 : 0,
  });

  const userPayload = {
    username: provisionalUser.username,
    firstName: trimmedFirstName,
    surname: trimmedSurname,
    password: passwordToSave,
    rfidTag: provisionalUser.rfid_tag,
    activeMember: provisionalUser.active_member,
    membershipFeesDue: provisionalUser.membership_fees_due,
    coachingVolunteer: provisionalUser.coaching_volunteer,
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

function parseUtcTimestampParts(datePart, timePart) {
  if (!datePart) {
    return null;
  }

  const normalizedTime =
    typeof timePart === "string" && timePart.trim() ? timePart.trim() : "00:00:00.000Z";
  const timestamp = new Date(`${datePart}T${normalizedTime}`);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function isBeginnerVisibleInProfileOptions(user, participant, now = new Date()) {
  if (!user || user.user_type !== "beginner") {
    return true;
  }

  if (!participant) {
    return true;
  }

  if (participant.converted_to_member) {
    return true;
  }

  const createdAt = parseUtcTimestampParts(
    participant.created_at_date,
    participant.created_at_time,
  );

  if (!createdAt) {
    return true;
  }

  return createdAt.getTime() > addUtcDays(now, -30).getTime();
}

function listProfilePageMembers(now = new Date()) {
  const participantsByUsername = new Map(
    listBeginnersCourseParticipants.all().map((participant) => [
      participant.username,
      participant,
    ]),
  );

  return listAllUsers
    .all()
    .filter((user) =>
      isBeginnerVisibleInProfileOptions(
        user,
        participantsByUsername.get(user.username),
        now,
      ),
    );
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

registerAuthRoutes({
  app,
  buildGuestUserProfile,
  buildMemberUserProfile,
  databasePath,
  findDisciplinesByUsername,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  getDeactivatedRfidTag,
  getSessionUsername,
  getUtcTimestampParts,
  hashPassword,
  insertGuestLoginEvent,
  insertLoginEvent,
  latestRfidScan,
  listAllUsers,
  syncMemberStatusWithFees,
  clearSessionCookie,
  createSessionCookie,
  updateUserPassword,
  verifyPassword,
});

registerAdminMemberRoutes({
  actorHasPermission,
  ALLOWED_DISCIPLINES,
  app,
  buildCommitteeRole,
  buildEditableMemberProfile,
  buildLoanBowRecord,
  buildMemberUserProfile,
  buildRoleDefinitionResponse,
  buildUniqueRoleKeyFromTitle,
  countUsersByRoleKey,
  CURRENT_PERMISSION_KEY_SET,
  db,
  deleteCommitteeRoleById,
  deleteRoleDefinition,
  deleteRolePermissionsByRoleKey,
  DISTANCE_SIGN_OFF_YARDS,
  findCommitteeRoleById,
  findCommitteeRoleByKey,
  findDisciplinesByUsername,
  findLoanBowByUsername,
  findRoleDefinitionByKey,
  findMaxCommitteeRoleDisplayOrder,
  findUserByUsername,
  getActorUser,
  getUtcTimestampParts,
  getPermissionsForRole,
  insertCommitteeRole,
  insertRolePermission,
  listAllUsers,
  listAssignableRoleKeys,
  listCommitteeRoles,
  listPermissionDefinitions,
  listProfilePageMembers,
  listRoleDefinitions,
  memberDistanceSignOffRepository,
  PERMISSIONS,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile,
  TOURNAMENT_TYPE_OPTIONS,
  updateCommitteeRoleDetails,
  updateRoleDefinition,
  upsertRole,
});

registerEquipmentRoutes({
  actorHasPermission,
  app,
  buildEquipmentCaseResponse,
  buildEquipmentItemResponse,
  buildEquipmentMaps,
  closeEquipmentLoan,
  countEquipmentItemsByStorageLocation,
  deleteEquipmentStorageLocation,
  db,
  DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_SIZE_CATEGORIES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  findEquipmentItemById,
  findEquipmentItemByIdWithRelations,
  findEquipmentStorageLocationByLabel,
  findOpenEquipmentLoanByItemId,
  findUserByUsername,
  getActorUser,
  getUtcTimestampParts,
  insertEquipmentItem,
  insertEquipmentLoan,
  insertEquipmentStorageLocation,
  listAllUsers,
  listEquipmentItemsByCaseId,
  listEquipmentStorageLocations,
  listOpenEquipmentLoansByCaseId,
  listOpenEquipmentLoansByMemberUserId,
  PERMISSIONS,
  sanitizeCupboardLabel,
  sanitizeEquipmentCreatePayload,
  updateEquipmentAssignmentMetadata,
  updateEquipmentItemForDecommission,
  updateEquipmentItemStorage,
  validateCaseAssignment,
});

app.get("/api/beginners-courses/dashboard", (req, res) => {
  const actor = getActorUser(req);
  const courseType = normalizeCourseType(req.query?.courseType);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (
    !actor ||
    (!actorHasPermission(actor, coursePermissions.manage) &&
      !actorHasPermission(actor, coursePermissions.approve))
  ) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to view Have a Go sessions."
          : "You do not have permission to view beginners courses.",
    });
    return;
  }

  const maps = buildEquipmentMaps();
  const cases = maps.items
    .filter((item) => item.equipment_type === EQUIPMENT_TYPES.CASE)
    .map((item) => buildEquipmentCaseResponse(item, maps));
  const users = listAllUsers
    .all()
    .filter((user) => !["beginner", "have-a-go"].includes(user.user_type))
    .map((user) => ({
      username: user.username,
      fullName: `${user.first_name} ${user.surname}`.trim(),
      userType: user.user_type,
      coachingVolunteer: Boolean(user.coaching_volunteer),
    }));

  res.json({
    success: true,
    permissions: {
      canManageBeginnersCourses: actorHasPermission(
        actor,
        coursePermissions.manage,
      ),
      canApproveBeginnersCourses: actorHasPermission(
        actor,
        coursePermissions.approve,
      ),
    },
    courses: buildBeginnersCourseDashboard(courseType),
    coordinators: users,
    coaches: users.filter((user) =>
      isBeginnersCourseCoachEligible({
        user_type: user.userType,
        coaching_volunteer: user.coachingVolunteer,
      }),
    ),
    availableCases: cases.map((caseItem) => ({
      id: caseItem.id,
      reference: caseItem.number || caseItem.label || "",
      locationLabel: caseItem.currentLocation?.label ?? "",
      memberUsername: caseItem.currentLocation?.memberUsername ?? "",
    })),
  });
});

app.get("/api/beginners-courses/calendar", (req, res) => {
  res.json({
    success: true,
    lessons: buildBeginnersCourseCalendarLessons(req.query?.courseType),
  });
});

app.post("/api/beginners-courses", (req, res) => {
  const actor = getActorUser(req);
  const courseType = normalizeCourseType(req.body?.courseType);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to submit Have a Go sessions."
          : "You do not have permission to submit beginners courses.",
    });
    return;
  }

  const sanitized = sanitizeBeginnersCoursePayload(req.body);

  if (!sanitized.success) {
    res.status(sanitized.status).json(sanitized);
    return;
  }

  const [date, time] = getUtcTimestampParts();
  const createCourseTransaction = db.transaction(() => {
    const result = insertBeginnersCourse.run(
      courseType,
      sanitized.value.coordinatorUsername,
      actor.username,
      sanitized.value.firstLessonDate,
      sanitized.value.startTime,
      sanitized.value.endTime,
      sanitized.value.lessonCount,
      sanitized.value.beginnerCapacity,
      "pending",
      null,
      null,
      null,
      null,
      date,
      time,
    );

    for (const lesson of buildBeginnersLessonDates(
      sanitized.value.firstLessonDate,
      sanitized.value.lessonCount,
    )) {
      insertBeginnersCourseLesson.run(
        result.lastInsertRowid,
        lesson.lessonNumber,
        lesson.lessonDate,
        sanitized.value.startTime,
        sanitized.value.endTime,
      );
    }

    return result.lastInsertRowid;
  });

  const courseId = createCourseTransaction();

  res.status(201).json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find((course) => course.id === courseId) ?? null,
  });
});

app.post("/api/beginners-courses/:id/approve", (req, res) => {
  const actor = getActorUser(req);

  const course = findBeginnersCourseById.get(req.params.id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (!requestMatchesCourseType(req, course)) {
    res.status(404).json({
      success: false,
      message: "Course not found for the requested course type.",
    });
    return;
  }

  const courseType = normalizeCourseType(course.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.approve)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to approve Have a Go sessions."
          : "You do not have permission to approve beginners courses.",
    });
    return;
  }

  if (course.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "Cancelled beginners courses cannot be approved.",
    });
    return;
  }

  const [date, time] = getUtcTimestampParts();
  updateBeginnersCourseApproval.run("approved", null, actor.username, date, time, course.id);

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find((entry) => entry.id === course.id) ?? null,
  });
});

app.post("/api/beginners-courses/:id/reject", (req, res) => {
  const actor = getActorUser(req);

  const course = findBeginnersCourseById.get(req.params.id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (!requestMatchesCourseType(req, course)) {
    res.status(404).json({
      success: false,
      message: "Course not found for the requested course type.",
    });
    return;
  }

  const courseType = normalizeCourseType(course.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.approve)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to reject Have a Go sessions."
          : "You do not have permission to reject beginners courses.",
    });
    return;
  }

  if (course.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "Cancelled beginners courses cannot be rejected.",
    });
    return;
  }

  const rejectionReason =
    typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 280) : "";

  if (!rejectionReason) {
    res.status(400).json({
      success: false,
      message: "Please add a short rejection reason.",
    });
    return;
  }

  const [date, time] = getUtcTimestampParts();
  updateBeginnersCourseApproval.run(
    "rejected",
    rejectionReason,
    actor.username,
    date,
    time,
    course.id,
  );

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find((entry) => entry.id === course.id) ?? null,
  });
});

app.delete("/api/beginners-courses/:id", (req, res) => {
  const actor = getActorUser(req);
  const course = findBeginnersCourseById.get(req.params.id);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (!requestMatchesCourseType(req, course)) {
    res.status(404).json({
      success: false,
      message: "Course not found for the requested course type.",
    });
    return;
  }

  const courseType = normalizeCourseType(course.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);
  const canCancelCourse =
    actorHasPermission(actor, coursePermissions.approve) ||
    actor.username === course.coordinator_username;

  if (!canCancelCourse) {
    res.status(403).json({
      success: false,
      message: "Only the course coordinator or an admin can cancel this course.",
    });
    return;
  }

  if (course.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "This beginners course is already cancelled.",
    });
    return;
  }

  const cancellationReason =
    typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 280) : "";

  if (!cancellationReason) {
    res.status(400).json({
      success: false,
      message: "Please add a reason for cancelling this course.",
    });
    return;
  }

  const [date, time] = getUtcTimestampParts();
  cancelBeginnersCourse.run(
    cancellationReason,
    actor.username,
    date,
    time,
    course.id,
  );

  res.json({
    success: true,
  });
});

app.post("/api/beginners-courses/:id/beginners", (req, res) => {
  const actor = getActorUser(req);

  const course = findBeginnersCourseById.get(req.params.id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  const courseType = normalizeCourseType(course.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to add participants to a Have a Go session."
          : "You do not have permission to add beginners to a course.",
    });
    return;
  }

  if (course.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "Cancelled beginners courses cannot accept new beginners.",
    });
    return;
  }

  if (course.approval_status !== "approved") {
    res.status(400).json({
      success: false,
      message: "Approve the course before booking beginners onto it.",
    });
    return;
  }

  if (listBeginnersCourseParticipantsByCourseId.all(course.id).length >= course.beginner_capacity) {
    res.status(400).json({
      success: false,
      message: "This beginners course is already full.",
    });
    return;
  }

  const sanitized = sanitizeBeginnersParticipantPayload(req.body);

  if (!sanitized.success) {
    res.status(sanitized.status).json(sanitized);
    return;
  }

  const password = buildBeginnersPassword();
  const username = buildBeginnersUsername(
    sanitized.value.firstName,
    sanitized.value.surname,
  );
  const [date, time] = getUtcTimestampParts();
  const userResult = saveMemberProfile({
    username,
    firstName: sanitized.value.firstName,
    surname: sanitized.value.surname,
    password,
    rfidTag: "",
    activeMember: true,
    membershipFeesDue: "",
    userType: getCourseParticipantUserType(courseType),
    disciplines: [],
    loanBow: getDefaultLoanBowRecord(),
    existingUser: null,
  });

  if (!userResult.success) {
    res.status(userResult.status).json(userResult);
    return;
  }

  insertBeginnersCourseParticipant.run(
    course.id,
    username,
    sanitized.value.firstName,
    sanitized.value.surname,
    sanitized.value.sizeCategory,
    sanitized.value.heightText,
    sanitized.value.handedness,
    sanitized.value.eyeDominance,
    sanitized.value.initialEmailSent ? 1 : 0,
    sanitized.value.thirtyDayReminderSent ? 1 : 0,
    sanitized.value.courseFeePaid ? 1 : 0,
    null,
    null,
    null,
    null,
    actor.username,
    date,
    time,
  );

  res.status(201).json({
    success: true,
    username,
    temporaryPassword: password,
    course: buildBeginnersCourseDashboard(courseType).find((entry) => entry.id === course.id) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/reset-password", (req, res) => {
  const actor = getActorUser(req);
  const participant = findBeginnersCourseParticipantById.get(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = findBeginnersCourseById.get(participant.course_id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  const courseType = normalizeCourseType(course.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to reset Have a Go participant passwords."
          : "You do not have permission to reset beginner passwords.",
    });
    return;
  }

  const password = buildBeginnersPassword();
  updateUserPassword.run(hashPassword(password), participant.username);

  res.json({
    success: true,
    username: participant.username,
    temporaryPassword: password,
    course: buildBeginnersCourseDashboard(courseType).find((entry) => entry.id === course.id) ?? null,
  });
});

app.put("/api/beginners-course-participants/:id", (req, res) => {
  const actor = getActorUser(req);

  const participant = findBeginnersCourseParticipantById.get(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = findBeginnersCourseById.get(participant.course_id);
  const courseType = normalizeCourseType(course?.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to update Have a Go participants."
          : "You do not have permission to update beginners.",
    });
    return;
  }

  const sanitized = sanitizeBeginnersParticipantPayload(req.body);

  if (!sanitized.success) {
    res.status(sanitized.status).json(sanitized);
    return;
  }

  updateBeginnersCourseParticipant.run({
    id: participant.id,
    firstName: sanitized.value.firstName,
    surname: sanitized.value.surname,
    sizeCategory: sanitized.value.sizeCategory,
    heightText: sanitized.value.heightText,
    handedness: sanitized.value.handedness,
    eyeDominance: sanitized.value.eyeDominance,
    initialEmailSent: sanitized.value.initialEmailSent ? 1 : 0,
    thirtyDayReminderSent: sanitized.value.thirtyDayReminderSent ? 1 : 0,
    courseFeePaid: sanitized.value.courseFeePaid ? 1 : 0,
  });

  const existingUser = findUserByUsername.get(participant.username);

  if (existingUser) {
    upsertUser.run({
      username: existingUser.username,
      firstName: sanitized.value.firstName,
      surname: sanitized.value.surname,
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag,
      activeMember: existingUser.active_member,
      membershipFeesDue: existingUser.membership_fees_due,
    });
  }

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find(
      (entry) => entry.id === participant.course_id,
    ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/convert", (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to convert beginners into members.",
    });
    return;
  }

  const participant = findBeginnersCourseParticipantById.get(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = findBeginnersCourseById.get(participant.course_id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (!hasBeginnersCourseCompleted(course)) {
    res.status(400).json({
      success: false,
      message: "Beginners can only be converted after the course has completed.",
    });
    return;
  }

  const existingUser = findUserByUsername.get(participant.username);

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: "The linked beginner user could not be found.",
    });
    return;
  }

  if (existingUser.user_type === "beginner") {
    const conversionResult = saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag ?? "",
      activeMember: Boolean(existingUser.active_member),
      membershipFeesDue: existingUser.membership_fees_due ?? "",
      coachingVolunteer: Boolean(existingUser.coaching_volunteer),
      userType: "general",
      disciplines: findDisciplinesByUsername
        .all(existingUser.username)
        .map((entry) => entry.discipline),
      loanBow: buildLoanBowRecord(findLoanBowByUsername.get(existingUser.username)),
      existingUser,
    });

    if (!conversionResult.success) {
      res.status(conversionResult.status).json(conversionResult);
      return;
    }
  }

  markBeginnersCourseParticipantConverted.run(participant.id);
  const courseType = normalizeCourseType(course.course_type);

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find(
      (entry) => entry.id === participant.course_id,
    ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/assign-case", (req, res) => {
  const actor = getActorUser(req);

  const participant = findBeginnersCourseParticipantById.get(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = findBeginnersCourseById.get(participant.course_id);
  const courseType = normalizeCourseType(course?.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to assign Have a Go equipment."
          : "You do not have permission to assign course equipment.",
    });
    return;
  }

  if (actor.username === participant.username) {
    res.status(400).json({
      success: false,
      message: "The staff member assigning equipment cannot be the borrowing beginner.",
    });
    return;
  }

  const nextCaseId =
    req.body?.caseId === "" || req.body?.caseId == null
      ? null
      : Number.parseInt(req.body.caseId, 10);
  const nextCase = nextCaseId ? findEquipmentItemById.get(nextCaseId) : null;
  const currentCase = participant.assigned_case_id
    ? findEquipmentItemById.get(participant.assigned_case_id)
    : null;
  const [date, time] = getUtcTimestampParts();

  if (nextCase) {
    if (nextCase.equipment_type !== EQUIPMENT_TYPES.CASE || nextCase.status !== "active") {
      res.status(400).json({
        success: false,
        message: "Choose a valid active case.",
      });
      return;
    }

    if (
      nextCase.location_type === EQUIPMENT_LOCATION_TYPES.MEMBER &&
      nextCase.location_member_username &&
      nextCase.location_member_username !== participant.username
    ) {
      res.status(400).json({
        success: false,
        message: "That case is already assigned to another member.",
      });
      return;
    }

    if (
      findOpenEquipmentLoanByItemId.get(nextCase.id) &&
      nextCase.location_member_username !== participant.username
    ) {
      res.status(400).json({
        success: false,
        message: "That case is already on loan.",
      });
      return;
    }
  }

  const assignTransaction = db.transaction(() => {
    const clearLegacyCaseLoans = (caseItem) => {
      if (!caseItem) {
        return;
      }

      const openCaseLoan = findOpenEquipmentLoanByItemId.get(caseItem.id);
      const relatedOpenLoans = listOpenEquipmentLoansByCaseId.all(caseItem.id);

      if (openCaseLoan) {
        closeEquipmentLoan.run(
          actor.username,
          date,
          time,
          EQUIPMENT_LOCATION_TYPES.CUPBOARD,
          DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
          null,
          openCaseLoan.id,
        );
      }

      for (const loan of relatedOpenLoans) {
        closeEquipmentLoan.run(
          actor.username,
          date,
          time,
          EQUIPMENT_LOCATION_TYPES.CASE,
          null,
          caseItem.id,
          loan.id,
        );
      }
    };

    if (currentCase && (!nextCase || currentCase.id !== nextCase.id)) {
      clearLegacyCaseLoans(currentCase);
      updateEquipmentItemStorage.run({
        id: currentCase.id,
        locationType: EQUIPMENT_LOCATION_TYPES.CUPBOARD,
        locationLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
        locationCaseId: null,
        locationMemberUsername: null,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
    }

    if (nextCase) {
      clearLegacyCaseLoans(nextCase);
      updateEquipmentItemStorage.run({
        id: nextCase.id,
        locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
        locationLabel: null,
        locationCaseId: null,
        locationMemberUsername: participant.username,
        storageByUsername: actor.username,
        storageAtDate: date,
        storageAtTime: time,
      });
      updateEquipmentAssignmentMetadata.run({
        id: nextCase.id,
        assignedByUsername: actor.username,
        assignedAtDate: date,
        assignedAtTime: time,
      });
    }

    updateBeginnersCourseParticipantCase.run(
      nextCase?.id ?? null,
      nextCase ? actor.username : null,
      nextCase ? date : null,
      nextCase ? time : null,
      participant.id,
    );
  });

  try {
    assignTransaction();
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to assign course equipment.",
    });
    return;
  }

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find(
      (entry) => entry.id === participant.course_id,
    ) ?? null,
  });
});

app.post("/api/beginners-course-lessons/:id/coaches", (req, res) => {
  const actor = getActorUser(req);

  const lesson = findBeginnersCourseLessonById.get(req.params.id);

  if (!lesson) {
    res.status(404).json({
      success: false,
      message: "Beginners lesson not found.",
    });
    return;
  }

  const course = findBeginnersCourseById.get(lesson.course_id);
  const courseType = normalizeCourseType(course?.course_type);
  const coursePermissions = getCourseTypePermissions(courseType);

  if (!actor || !actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "have-a-go"
          ? "You do not have permission to assign coaches to Have a Go sessions."
          : "You do not have permission to assign coaches to beginners lessons.",
    });
    return;
  }

  const coachUsernames = Array.isArray(req.body?.coachUsernames)
    ? [...new Set(req.body.coachUsernames.filter((value) => typeof value === "string"))]
    : [];
  const invalidCoach = coachUsernames.find((username) => {
    const coach = findUserByUsername.get(username);
    return !coach || !isBeginnersCourseCoachEligible(coach);
  });

  if (invalidCoach) {
    res.status(400).json({
      success: false,
      message: "One or more selected coaches are not eligible for beginners lessons.",
    });
    return;
  }

  const [date, time] = getUtcTimestampParts();
  const coachTransaction = db.transaction(() => {
    deleteBeginnersLessonCoachesByLessonId.run(lesson.id);

    for (const coachUsername of coachUsernames) {
      insertBeginnersLessonCoach.run(
        lesson.id,
        coachUsername,
        actor.username,
        date,
        time,
      );
    }
  });

  coachTransaction();

  res.json({
    success: true,
    course: buildBeginnersCourseDashboard(courseType).find((entry) => entry.id === lesson.course_id) ?? null,
  });
});

app.get("/api/my-beginner-dashboard", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const participant = findBeginnersCourseParticipantByUsername.get(actor.username);

  if (!participant) {
    res.json({
      success: true,
      dashboard: null,
    });
    return;
  }

  const course = findBeginnersCourseById.get(participant.course_id);
  if (
    !course ||
    course.is_cancelled ||
    (course.approval_status ?? "pending") !== "approved"
  ) {
    res.json({
      success: true,
      dashboard: null,
    });
    return;
  }
  const today = toUtcDateString(new Date());
  const lessons = listBeginnersCourseLessonsByCourseId.all(course.id);
  const todayLesson = lessons.find((lesson) => lesson.lesson_date === today) ?? null;
  const coaches = todayLesson
    ? listBeginnersLessonCoachesByLessonId.all(todayLesson.id).map((row) => ({
        username: row.coach_username,
        fullName: `${row.first_name} ${row.surname}`.trim(),
      }))
    : [];
  const equipment = listOpenEquipmentLoansByMemberUserId
    .all(actor.id)
    .map((loan) => ({
      id: loan.id,
      equipmentType: loan.equipment_type,
      typeLabel: EQUIPMENT_TYPE_LABELS[loan.equipment_type] ?? loan.equipment_type,
      reference:
        loan.equipment_type === EQUIPMENT_TYPES.ARROWS
          ? `${loan.arrow_quantity} x ${loan.arrow_length}"`
          : loan.item_number ?? "",
    }))
    .sort((left, right) => {
      const leftIsCase = left.equipmentType === EQUIPMENT_TYPES.CASE;
      const rightIsCase = right.equipmentType === EQUIPMENT_TYPES.CASE;

      if (leftIsCase !== rightIsCase) {
        return leftIsCase ? -1 : 1;
      }

      return left.typeLabel.localeCompare(right.typeLabel);
    })
    .map((item) => ({
      id: item.id,
      typeLabel: item.typeLabel,
      reference: item.reference,
    }));

  res.json({
    success: true,
    dashboard: {
      courseId: course.id,
      firstLessonDate: course.first_lesson_date,
      lessonToday: todayLesson
        ? {
            id: todayLesson.id,
            lessonNumber: todayLesson.lesson_number,
            date: todayLesson.lesson_date,
            startTime: todayLesson.start_time,
            endTime: todayLesson.end_time,
          }
        : null,
      coaches,
      equipment,
      showSafetyMessage: today === course.first_lesson_date,
    },
  });
});

app.get("/api/my-beginner-coaching-assignments", (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const lessons = listCoachBeginnersLessonsByUserId.all(actor.id).map((lesson) => ({
    id: lesson.id,
    courseId: lesson.course_id,
    lessonNumber: lesson.lesson_number,
    date: lesson.lesson_date,
    startTime: lesson.start_time,
    endTime: lesson.end_time,
    coordinatorName: `${lesson.coordinator_first_name} ${lesson.coordinator_surname}`.trim(),
    beginnerCount: listBeginnersCourseParticipantsByCourseId.all(lesson.course_id).length,
  }));

  res.json({
    success: true,
    lessons,
  });
});

registerTournamentRoutes({
  actorHasPermission,
  app,
  buildTournament,
  buildTournamentDataMaps,
  db,
  deleteTournamentById,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentScoresByTournamentId,
  deleteTournamentRegistration,
  exportsDirectory: serverRuntime.exportsDirectory,
  findTournamentById,
  getActorUser,
  getUtcTimestampParts,
  insertTournament,
  insertTournamentRegistration,
  listTournamentRegistrationsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  path,
  PERMISSIONS,
  sanitizeFileNameSegment,
  toUtcDateString,
  TOURNAMENT_TYPE_OPTIONS,
  updateTournamentById,
  upsertTournamentScore,
  writeFileSync,
});
registerScheduleRoutes({
  actorHasPermission,
  app,
  approveClubEventById,
  approveCoachingSessionById,
  buildClubEvent,
  buildCoachingBookingsMap,
  buildCoachingSession,
  buildEventBookingsMap,
  canActorViewApprovalEntry,
  db,
  deleteBookingsByCoachingSessionId,
  deleteBookingsByEventId,
  deleteClubEventById,
  deleteCoachingSessionById,
  deleteCoachingSessionBooking,
  deleteEventBooking,
  findClubEventById,
  findCoachingSessionById,
  findScheduleConflict,
  getActorUser,
  getUtcTimestampParts,
  hasScheduleEntryEnded,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  normalizeBookingRow,
  normalizeVenue,
  PERMISSIONS,
  rejectClubEventById,
  rejectCoachingSessionById,
});

registerMemberActivityRoutes({
  addUtcDays,
  app,
  actorHasPermission,
  buildDisciplinesByUsernameMap,
  buildGuestUserProfile,
  buildMemberUserProfile,
  buildPersonalUsageWindow,
  buildTournament,
  buildTournamentDataMaps,
  buildUsageWindow,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findRecentGuestLogins,
  findRecentRangeMembers,
  getActorUser,
  listReportingGuestLogins,
  listReportingMemberLogins,
  listTournaments,
  PERMISSIONS,
  startOfUtcDay,
  toUtcDateString,
});

app.use("/api", apiErrorHandler);

startServer({
  app,
  databasePath,
  distDirectory,
  onBeforeListen: startRfidReaderMonitor,
  port,
});
