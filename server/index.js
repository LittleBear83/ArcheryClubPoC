import express from "express";
import helmet from "helmet";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { startServer } from "./bootstrap/startServer.js";
import { serverRuntime } from "./config/runtime.js";
import { createCsrfProtection } from "./security/csrf.js";
import { createRateLimiter } from "./security/rateLimit.js";
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
import { createActivityReportingGateway } from "./infrastructure/persistence/activityReportingGateway.js";
import {
  bootstrapSqliteBaseSchema,
  CLUB_EVENTS_TABLE_SQL,
  COACHING_SESSIONS_TABLE_SQL,
  COACHING_SESSION_BOOKINGS_TABLE_SQL,
  EVENT_BOOKINGS_TABLE_SQL,
  GUEST_LOGIN_EVENTS_TABLE_SQL,
  LOGIN_EVENTS_TABLE_SQL,
  TOURNAMENTS_TABLE_SQL,
  TOURNAMENT_REGISTRATIONS_TABLE_SQL,
  TOURNAMENT_SCORES_TABLE_SQL,
} from "./infrastructure/persistence/bootstrapSqliteBaseSchema.js";
import {
  bootstrapSqliteLegacyDateSupport,
  bootstrapSqliteRolesAndPermissions,
} from "./infrastructure/persistence/bootstrapSqliteLegacySupport.js";
import { bootstrapSqliteEquipmentCompatibility } from "./infrastructure/persistence/bootstrapSqliteEquipmentCompatibility.js";
import { bootstrapSqliteCourseScheduleCompatibility } from "./infrastructure/persistence/bootstrapSqliteCourseScheduleCompatibility.js";
import { bootstrapSqliteUserCompatibility } from "./infrastructure/persistence/bootstrapSqliteUserCompatibility.js";
import { createSqliteAuthAuditStatements } from "./infrastructure/persistence/createSqliteAuthAuditStatements.js";
import { createBeginnersCourseReadGateway } from "./infrastructure/persistence/beginnersCourseReadGateway.js";
import { createBeginnersCourseWriteGateway } from "./infrastructure/persistence/beginnersCourseWriteGateway.js";
import { createSqliteBeginnersCourseStatements } from "./infrastructure/persistence/createSqliteBeginnersCourseStatements.js";
import { createSqliteEquipmentStatements } from "./infrastructure/persistence/createSqliteEquipmentStatements.js";
import { createSqliteLoanBowStatements } from "./infrastructure/persistence/createSqliteLoanBowStatements.js";
import { createSqliteReportingStatements } from "./infrastructure/persistence/createSqliteReportingStatements.js";
import { createSqliteRoleCommitteeStatements } from "./infrastructure/persistence/createSqliteRoleCommitteeStatements.js";
import { createSqliteScheduleTournamentStatements } from "./infrastructure/persistence/createSqliteScheduleTournamentStatements.js";
import { bootstrapSqliteUserData } from "./infrastructure/persistence/bootstrapSqliteUserData.js";
import { runPostgresMigrations } from "./infrastructure/persistence/runPostgresMigrations.js";
import { createEquipmentGateway } from "./infrastructure/persistence/equipmentGateway.js";
import { createMemberAuthGateway } from "./infrastructure/persistence/memberAuthGateway.js";
import { createMemberProfileGateway } from "./infrastructure/persistence/memberProfileGateway.js";
import { createRoleCommitteeGateway } from "./infrastructure/persistence/roleCommitteeGateway.js";
import { createScheduleGateway } from "./infrastructure/persistence/scheduleGateway.js";
import { createTournamentGateway } from "./infrastructure/persistence/tournamentGateway.js";
import { createMemberDistanceSignOffRepository } from "./infrastructure/persistence/memberDistanceSignOffRepository.js";
import {
  createSecurityEventLogger,
  logServerError,
} from "./observability/securityEventLogger.js";
import { registerTournamentRoutes } from "./presentation/http/registerTournamentRoutes.js";
import { registerMemberActivityRoutes } from "./presentation/http/registerMemberActivityRoutes.js";
import { registerScheduleRoutes } from "./presentation/http/registerScheduleRoutes.js";
import { registerAdminMemberRoutes } from "./presentation/http/registerAdminMemberRoutes.js";
import { registerAuthRoutes } from "./presentation/http/registerAuthRoutes.js";
import { registerEquipmentRoutes } from "./presentation/http/registerEquipmentRoutes.js";

const { databasePath, distDirectory, port } = serverRuntime;
const db = createDatabase(serverRuntime);

if (serverRuntime.databaseEngine === "postgres") {
  await runPostgresMigrations({
    committeeRoleSeed: COMMITTEE_ROLE_SEED,
    defaultEquipmentCupboardLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
    permissionDefinitions: PERMISSION_DEFINITIONS,
    pool: db.pool,
    systemRoleDefinitions: SYSTEM_ROLE_DEFINITIONS,
  });
}

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
const GLOBAL_API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const GLOBAL_API_RATE_LIMIT_MAX_REQUESTS = 300;
const GENERAL_JSON_BODY_LIMIT = "256kb";
const COMMITTEE_PHOTO_JSON_BODY_LIMIT = "1mb";
const AUTH_RATE_LIMIT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/guest-login",
]);
const MUTATING_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/rfid/latest-login",
  "/api/auth/guest-login",
]);
const AUDIT_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/logout",
  "/api/auth/guest-login",
  "/api/auth/rfid/latest-scan",
]);

if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set when running in live mode.");
}

const csrfProtection = createCsrfProtection({
  excludedPaths: CSRF_EXCLUDED_PATHS,
  isLive: serverRuntime.isLive,
  maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
  mutatingApiMethods: MUTATING_API_METHODS,
  secret: SESSION_SECRET,
});
const globalApiRateLimiter = createRateLimiter({
  getKey: getClientIp,
  isLimitedPath: (req) => req.path.startsWith("/api/"),
  maxAttempts: GLOBAL_API_RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests. Please wait a moment and try again.",
  windowMs: GLOBAL_API_RATE_LIMIT_WINDOW_MS,
});
const authRateLimiter = createRateLimiter({
  getKey: (req) => {
    const attemptedUsername =
      typeof req.body?.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";
    const attemptedRfidTag =
      typeof req.body?.rfidTag === "string"
        ? req.body.rfidTag.trim().toLowerCase()
        : "";

    return [
      req.path,
      getClientIp(req),
      attemptedUsername || attemptedRfidTag || "anonymous",
    ].join(":");
  },
  isLimitedPath: (req) => AUTH_RATE_LIMIT_PATHS.has(req.path),
  maxAttempts: AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
});

// Password helpers support both new scrypt hashes and older plain-text seed
// values, upgrading legacy passwords after a successful login.
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
  // Session tokens are signed JSON payloads stored in HttpOnly cookies, so the
  // browser cannot edit usernames without failing signature verification.
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
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
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
  // Mutating API calls are recorded after the response completes so the audit
  // event includes the final status code and request duration.
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

  logServerError({
    error,
    getActorUsername: getSessionUsername,
    getClientIp,
    req,
    statusCode: safeStatusCode,
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

function createUnsupportedPreparedStatement(name) {
  const unsupported = () => {
    throw new Error(
      `${name} is not available when DATABASE_ENGINE=postgres. Continue migrating synchronous SQLite helpers before enabling PostgreSQL for the full server runtime.`,
    );
  };

  return {
    all: unsupported,
    get: unsupported,
    run: unsupported,
  };
}

function createUnsupportedPreparedStatementGroup(names) {
  return Object.fromEntries(
    names.map((name) => [name, createUnsupportedPreparedStatement(name)]),
  );
}

function createUnsupportedSqliteUserData() {
  return {
    ...createUnsupportedPreparedStatementGroup([
      "deleteUserDisciplines",
      "findUserByCredentials",
      "findUserByRfid",
      "findUserByUsername",
      "insertUserDiscipline",
      "listAllUsers",
      "updateUserMembershipStatus",
      "updateUserPassword",
      "upsertUser",
      "upsertUserType",
    ]),
  };
}

// Schema bootstrap is intentionally idempotent; local development and preview
// can start against an existing SQLite file without a separate migration step.
if (serverRuntime.databaseEngine === "sqlite") {
  bootstrapSqliteBaseSchema({
    db,
    defaultEquipmentCupboardLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  });

  bootstrapSqliteRolesAndPermissions({
    currentPermissionKeys: CURRENT_PERMISSION_KEYS,
    currentPermissionSqlPlaceholders: CURRENT_PERMISSION_SQL_PLACEHOLDERS,
    db,
    permissionDefinitions: PERMISSION_DEFINITIONS,
    systemRoleDefinitions: SYSTEM_ROLE_DEFINITIONS,
  });

  bootstrapSqliteLegacyDateSupport({
    clubEventsTableSql: CLUB_EVENTS_TABLE_SQL,
    coachingSessionBookingsTableSql: COACHING_SESSION_BOOKINGS_TABLE_SQL,
    coachingSessionsTableSql: COACHING_SESSIONS_TABLE_SQL,
    db,
    eventBookingsTableSql: EVENT_BOOKINGS_TABLE_SQL,
    guestLoginEventsTableSql: GUEST_LOGIN_EVENTS_TABLE_SQL,
    loginEventsTableSql: LOGIN_EVENTS_TABLE_SQL,
    tournamentsTableSql: TOURNAMENTS_TABLE_SQL,
    tournamentRegistrationsTableSql: TOURNAMENT_REGISTRATIONS_TABLE_SQL,
    tournamentScoresTableSql: TOURNAMENT_SCORES_TABLE_SQL,
  });

  bootstrapSqliteUserCompatibility({ db });
  bootstrapSqliteEquipmentCompatibility({ db });
  bootstrapSqliteCourseScheduleCompatibility({
    clubEventsTableSql: CLUB_EVENTS_TABLE_SQL,
    coachingSessionBookingsTableSql: COACHING_SESSION_BOOKINGS_TABLE_SQL,
    coachingSessionsTableSql: COACHING_SESSIONS_TABLE_SQL,
    db,
    eventBookingsTableSql: EVENT_BOOKINGS_TABLE_SQL,
    tournamentsTableSql: TOURNAMENTS_TABLE_SQL,
    tournamentRegistrationsTableSql: TOURNAMENT_REGISTRATIONS_TABLE_SQL,
    tournamentScoresTableSql: TOURNAMENT_SCORES_TABLE_SQL,
  });
}

const {
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
} = serverRuntime.databaseEngine === "sqlite"
  ? bootstrapSqliteUserData({
      committeeRoleSeed: COMMITTEE_ROLE_SEED,
      db,
      hashPassword,
      isLive: serverRuntime.isLive,
      isPasswordHash,
    })
  : createUnsupportedSqliteUserData();

if (serverRuntime.databaseEngine === "sqlite") {
  await syncAllMemberStatusesWithFees();
}

const {
  countUsersByRoleKey,
  deleteCommitteeRoleById,
  deleteRoleDefinition,
  deleteRolePermissionsByRoleKey,
  findCommitteeRoleById,
  findCommitteeRoleByKey,
  findMaxCommitteeRoleDisplayOrder,
  findRoleDefinitionByKey,
  insertCommitteeRole,
  insertRolePermission,
  listCommitteeRoles,
  listPermissionDefinitions,
  listRoleDefinitions,
  listRolePermissionKeysByRoleKey,
  updateCommitteeRoleDetails,
  updateRoleDefinition,
  upsertRole,
} = serverRuntime.databaseEngine === "sqlite"
  ? createSqliteRoleCommitteeStatements(db)
  : createUnsupportedPreparedStatementGroup([
      "countUsersByRoleKey",
      "deleteCommitteeRoleById",
      "deleteRoleDefinition",
      "deleteRolePermissionsByRoleKey",
      "findCommitteeRoleById",
      "findCommitteeRoleByKey",
      "findMaxCommitteeRoleDisplayOrder",
      "findRoleDefinitionByKey",
      "insertCommitteeRole",
      "insertRolePermission",
      "listCommitteeRoles",
      "listPermissionDefinitions",
      "listRoleDefinitions",
      "listRolePermissionKeysByRoleKey",
      "updateCommitteeRoleDetails",
      "updateRoleDefinition",
      "upsertRole",
    ]);

const roleCommitteeGateway = createRoleCommitteeGateway({
  countUsersByRoleKey,
  databaseEngine: serverRuntime.databaseEngine,
  deleteCommitteeRoleById,
  deleteRoleDefinition,
  deleteRolePermissionsByRoleKey,
  findCommitteeRoleById,
  findCommitteeRoleByKey,
  findMaxCommitteeRoleDisplayOrder,
  findRoleDefinitionByKey,
  insertCommitteeRole,
  insertRolePermission,
  listCommitteeRoles,
  listPermissionDefinitions,
  listRoleDefinitions,
  listRolePermissionKeysByRoleKey,
  pool: db.pool,
  updateCommitteeRoleDetails,
  updateRoleDefinition,
  upsertRole,
});

let cachedAssignableRoleKeys = [];
let cachedKnownRoleKeys = new Set();
let cachedRolePermissionsByKey = new Map();

async function refreshRoleAccessSnapshot() {
  const roles = await roleCommitteeGateway.listRoleDefinitions();
  cachedAssignableRoleKeys = roles.map((role) => role.role_key);
  cachedKnownRoleKeys = new Set(cachedAssignableRoleKeys);
  cachedRolePermissionsByKey = new Map(
    await Promise.all(
      roles.map(async (role) => [
        role.role_key,
        (await roleCommitteeGateway.listRolePermissionKeysByRoleKey(role.role_key)).filter(
          (permissionKey) => CURRENT_PERMISSION_KEY_SET.has(permissionKey),
        ),
      ]),
    ),
  );
}

await refreshRoleAccessSnapshot();

const { findLoanBowByUsername, upsertLoanBowByUsername } =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteLoanBowStatements(db)
    : createUnsupportedPreparedStatementGroup([
        "findLoanBowByUsername",
        "upsertLoanBowByUsername",
      ]);

const {
  closeEquipmentLoan,
  countEquipmentItemsByStorageLocation,
  deleteEquipmentStorageLocation,
  findActiveEquipmentByIdentity,
  findEquipmentItemById,
  findEquipmentItemByIdWithRelations,
  findEquipmentStorageLocationByLabel,
  findOpenEquipmentLoanByItemId,
  insertEquipmentItem,
  insertEquipmentLoan,
  insertEquipmentStorageLocation,
  listEquipmentItems,
  listEquipmentItemsByCaseId,
  listEquipmentLoans,
  listEquipmentStorageLocations,
  listOpenEquipmentLoansByCaseId,
  listOpenEquipmentLoansByMemberUserId,
  updateEquipmentAssignmentMetadata,
  updateEquipmentItemForDecommission,
  updateEquipmentItemStorage,
} = serverRuntime.databaseEngine === "sqlite"
  ? createSqliteEquipmentStatements(db)
  : createUnsupportedPreparedStatementGroup([
      "closeEquipmentLoan",
      "countEquipmentItemsByStorageLocation",
      "deleteEquipmentStorageLocation",
      "findActiveEquipmentByIdentity",
      "findEquipmentItemById",
      "findEquipmentItemByIdWithRelations",
      "findEquipmentStorageLocationByLabel",
      "findOpenEquipmentLoanByItemId",
      "insertEquipmentItem",
      "insertEquipmentLoan",
      "insertEquipmentStorageLocation",
      "listEquipmentItems",
      "listEquipmentItemsByCaseId",
      "listEquipmentLoans",
      "listEquipmentStorageLocations",
      "listOpenEquipmentLoansByCaseId",
      "listOpenEquipmentLoansByMemberUserId",
      "updateEquipmentAssignmentMetadata",
      "updateEquipmentItemForDecommission",
      "updateEquipmentItemStorage",
    ]);

const equipmentGateway = createEquipmentGateway({
  closeEquipmentLoan,
  countEquipmentItemsByStorageLocation,
  databaseEngine: serverRuntime.databaseEngine,
  deleteCoachingSessionBooking,
  deleteEquipmentStorageLocation,
  deleteEventBooking,
  findEquipmentItemById,
  findEquipmentItemByIdWithRelations,
  findEquipmentStorageLocationByLabel,
  findOpenEquipmentLoanByItemId,
  insertEquipmentItem,
  insertEquipmentLoan,
  insertEquipmentStorageLocation,
  listEquipmentItems,
  listEquipmentItemsByCaseId,
  listEquipmentLoans,
  listEquipmentStorageLocations,
  listOpenEquipmentLoansByCaseId,
  listOpenEquipmentLoansByMemberUserId,
  pool: db.pool,
  updateEquipmentAssignmentMetadata,
  updateEquipmentItemForDecommission,
  updateEquipmentItemStorage,
});

const {
  cancelBeginnersCourse,
  deleteBeginnersLessonCoachesByLessonId,
  findBeginnersCourseById,
  findBeginnersCourseLessonById,
  findBeginnersCourseParticipantById,
  findBeginnersCourseParticipantByUsername,
  insertBeginnersCourse,
  insertBeginnersCourseLesson,
  insertBeginnersCourseParticipant,
  insertBeginnersLessonCoach,
  listBeginnersCourseLessons,
  listBeginnersCourseLessonsByCourseId,
  listBeginnersCourseParticipantLoginDates,
  listBeginnersCourseParticipants,
  listBeginnersCourseParticipantsByCourseId,
  listBeginnersCourses,
  listBeginnersLessonCoaches,
  listBeginnersLessonCoachesByLessonId,
  listCoachBeginnersLessonsByUserId,
  markBeginnersCourseParticipantConverted,
  updateBeginnersCourseApproval,
  updateBeginnersCourseParticipant,
  updateBeginnersCourseParticipantCase,
} = serverRuntime.databaseEngine === "sqlite"
  ? createSqliteBeginnersCourseStatements(db)
  : createUnsupportedPreparedStatementGroup([
      "cancelBeginnersCourse",
      "deleteBeginnersLessonCoachesByLessonId",
      "findBeginnersCourseById",
      "findBeginnersCourseLessonById",
      "findBeginnersCourseParticipantById",
      "findBeginnersCourseParticipantByUsername",
      "insertBeginnersCourse",
      "insertBeginnersCourseLesson",
      "insertBeginnersCourseParticipant",
      "insertBeginnersLessonCoach",
      "listBeginnersCourseLessons",
      "listBeginnersCourseLessonsByCourseId",
      "listBeginnersCourseParticipantLoginDates",
      "listBeginnersCourseParticipants",
      "listBeginnersCourseParticipantsByCourseId",
      "listBeginnersCourses",
      "listBeginnersLessonCoaches",
      "listBeginnersLessonCoachesByLessonId",
      "listCoachBeginnersLessonsByUserId",
      "markBeginnersCourseParticipantConverted",
      "updateBeginnersCourseApproval",
      "updateBeginnersCourseParticipant",
      "updateBeginnersCourseParticipantCase",
    ]);

const {
  approveClubEventById,
  approveCoachingSessionById,
  deleteBookingsByCoachingSessionId,
  deleteBookingsByEventId,
  deleteClubEventById,
  deleteCoachingSessionById,
  deleteCoachingSessionBooking,
  deleteEventBooking,
  deleteTournamentById,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findClubEventById,
  findCoachingSessionById,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findTournamentById,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  insertTournament,
  insertTournamentRegistration,
  listAllCoachingSessionBookings,
  listAllEventBookings,
  listAllTournamentRegistrations,
  listAllTournamentScores,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  listTournamentRegistrationsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  rejectClubEventById,
  rejectCoachingSessionById,
  updateTournamentById,
  upsertTournamentScore,
} = serverRuntime.databaseEngine === "sqlite"
  ? createSqliteScheduleTournamentStatements(db)
  : createUnsupportedPreparedStatementGroup([
      "approveClubEventById",
      "approveCoachingSessionById",
      "deleteBookingsByCoachingSessionId",
      "deleteBookingsByEventId",
      "deleteClubEventById",
      "deleteCoachingSessionById",
      "deleteCoachingSessionBooking",
      "deleteEventBooking",
      "deleteTournamentById",
      "deleteTournamentRegistration",
      "deleteTournamentRegistrationsByTournamentId",
      "deleteTournamentScoresByTournamentId",
      "findClubEventById",
      "findCoachingSessionById",
      "findMemberCoachingBookingsByUserId",
      "findMemberEventBookingsByUserId",
      "findTournamentById",
      "insertClubEvent",
      "insertCoachingSession",
      "insertCoachingSessionBooking",
      "insertEventBooking",
      "insertTournament",
      "insertTournamentRegistration",
      "listAllCoachingSessionBookings",
      "listAllEventBookings",
      "listAllTournamentRegistrations",
      "listAllTournamentScores",
      "listBookingsByCoachingSessionId",
      "listClubEvents",
      "listCoachingSessions",
      "listEventBookingsByEventId",
      "listTournamentRegistrationsByTournamentId",
      "listTournamentScoresByTournamentId",
      "listTournaments",
      "rejectClubEventById",
      "rejectCoachingSessionById",
      "updateTournamentById",
      "upsertTournamentScore",
    ]);

const tournamentGateway = createTournamentGateway({
  databaseEngine: serverRuntime.databaseEngine,
  deleteTournamentById,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findTournamentById,
  insertTournament,
  insertTournamentRegistration,
  listAllTournamentRegistrations,
  listAllTournamentScores,
  listTournamentRegistrationsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  pool: db.pool,
  updateTournamentById,
  upsertTournamentScore,
});

const scheduleGateway = createScheduleGateway({
  approveClubEventById,
  approveCoachingSessionById,
  databaseEngine: serverRuntime.databaseEngine,
  deleteBookingsByCoachingSessionId,
  deleteBookingsByEventId,
  deleteClubEventById,
  deleteCoachingSessionById,
  deleteCoachingSessionBooking,
  deleteEventBooking,
  findClubEventById,
  findCoachingSessionById,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  listAllCoachingSessionBookings,
  listAllEventBookings,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  pool: db.pool,
  rejectClubEventById,
  rejectCoachingSessionById,
});

const { insertAuditEvent, insertGuestLoginEvent, insertLoginEvent } =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteAuthAuditStatements(db)
    : createUnsupportedPreparedStatementGroup([
        "insertAuditEvent",
        "insertGuestLoginEvent",
        "insertLoginEvent",
      ]);

const {
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  findDisciplinesByUsername,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
  listReportingGuestLogins,
  listReportingMemberLogins,
  memberLoginsByDateForUserInRange,
  memberLoginsByDateInRange,
  memberLoginsByHourForUserInRange,
  memberLoginsByHourInRange,
  memberLoginsByWeekdayForUserInRange,
  memberLoginsByWeekdayInRange,
} = serverRuntime.databaseEngine === "sqlite"
  ? createSqliteReportingStatements(db)
  : createUnsupportedPreparedStatementGroup([
      "countGuestLoginsInRange",
      "countMemberLoginsForUserInRange",
      "countMemberLoginsInRange",
      "findDisciplinesByUsername",
      "findRecentGuestLogins",
      "findRecentRangeMembers",
      "guestLoginsByDateInRange",
      "guestLoginsByHourInRange",
      "guestLoginsByWeekdayInRange",
      "listAllUserDisciplines",
      "listReportingGuestLogins",
      "listReportingMemberLogins",
      "memberLoginsByDateForUserInRange",
      "memberLoginsByDateInRange",
      "memberLoginsByHourForUserInRange",
      "memberLoginsByHourInRange",
      "memberLoginsByWeekdayForUserInRange",
      "memberLoginsByWeekdayInRange",
    ]);

const activityReportingGateway = createActivityReportingGateway({
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  databaseEngine: serverRuntime.databaseEngine,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
  listReportingGuestLogins,
  listReportingMemberLogins,
  memberLoginsByDateForUserInRange,
  memberLoginsByDateInRange,
  memberLoginsByHourForUserInRange,
  memberLoginsByHourInRange,
  memberLoginsByWeekdayForUserInRange,
  memberLoginsByWeekdayInRange,
  pool: db.pool,
});

const memberAuthGateway = createMemberAuthGateway({
  databaseEngine: serverRuntime.databaseEngine,
  findDisciplinesByUsername,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  insertGuestLoginEvent,
  insertLoginEvent,
  listAllUsers,
  pool: db.pool,
  updateUserMembershipStatus,
  updateUserPassword,
});

const memberProfileGateway = createMemberProfileGateway({
  databaseEngine: serverRuntime.databaseEngine,
  deleteUserDisciplines,
  findLoanBowByUsername,
  findRoleDefinitionByKey,
  insertUserDiscipline,
  pool: db.pool,
  upsertLoanBowByUsername,
  upsertUser,
  upsertUserType,
});

const memberDirectoryGateway = {
  findDisciplinesByUsername: (username) =>
    memberAuthGateway.findDisciplinesByUsername(username),
  findLoanBowByUsername: (username) =>
    memberProfileGateway.findLoanBowByUsername(username),
  findUserByUsername: (username) => memberAuthGateway.findUserByUsername(username),
  listAllUsers: () => memberAuthGateway.listAllUsers(),
};

const beginnersCourseReadGateway = createBeginnersCourseReadGateway({
  databaseEngine: serverRuntime.databaseEngine,
  findBeginnersCourseById,
  findBeginnersCourseLessonById,
  findBeginnersCourseParticipantById,
  findBeginnersCourseParticipantByUsername,
  listBeginnersCourseLessons,
  listBeginnersCourseLessonsByCourseId,
  listBeginnersCourseParticipantLoginDates,
  listBeginnersCourseParticipants,
  listBeginnersCourseParticipantsByCourseId,
  listBeginnersCourses,
  listBeginnersLessonCoaches,
  listBeginnersLessonCoachesByLessonId,
  listCoachBeginnersLessonsByUserId,
  pool: db.pool,
});

const beginnersCourseWriteGateway = createBeginnersCourseWriteGateway({
  cancelBeginnersCourse,
  databaseEngine: serverRuntime.databaseEngine,
  db,
  deleteBeginnersLessonCoachesByLessonId,
  insertBeginnersCourse,
  insertBeginnersCourseLesson,
  insertBeginnersCourseParticipant,
  insertBeginnersLessonCoach,
  markBeginnersCourseParticipantConverted,
  pool: db.pool,
  updateBeginnersCourseApproval,
  updateBeginnersCourseParticipant,
  updateBeginnersCourseParticipantCase,
  updateUserPassword,
  upsertUser,
});

if (serverRuntime.databaseEngine === "postgres") {
  throw new Error(
    "PostgreSQL migrations now run at startup and the persistence wiring now skips SQLite-only bootstrap work, but the remaining server runtime still depends on synchronous SQLite helper access in server/index.js and route registration. Continue porting those helpers before enabling DATABASE_ENGINE=postgres in production.",
  );
}

const app = express();
app.set("trust proxy", serverRuntime.trustProxy);

// Global middleware is registered before feature routes so all mutating API
// requests share JSON parsing, login throttling, and audit behavior.
app.use(
  createSecurityEventLogger({
    getActorUsername: getSessionUsername,
    getClientIp,
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(globalApiRateLimiter.middleware);
app.use("/api/committee-roles", express.json({ limit: COMMITTEE_PHOTO_JSON_BODY_LIMIT }));
app.use(express.json({ limit: GENERAL_JSON_BODY_LIMIT }));
app.use(csrfProtection.middleware);
app.use(authRateLimiter.middleware);
app.use(async (req, _res, next) => {
  const actorUsername = getActorUsername(req);

  if (!actorUsername) {
    req.actorUser = null;
    next();
    return;
  }

  try {
    const actor = await syncMemberStatusWithFees(
      await memberAuthGateway.findUserByUsername(actorUsername),
    );
    req.actorUser = actor?.active_member ? actor : null;
    next();
  } catch (error) {
    next(error);
  }
});
app.use(createAuditMiddleware(insertAuditEvent));

function buildMemberUserProfile(user, disciplines = [], meta = {}) {
  // Server-facing rows are converted to the normalized profile contract used by
  // session storage, permissions checks, and presentation helpers.
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

async function sanitizeBeginnersCoursePayload(payload) {
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

  if (
    !coordinatorUsername ||
    !(await memberDirectoryGateway.findUserByUsername(coordinatorUsername))
  ) {
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

async function buildBeginnersUsername(firstName, surname) {
  const base =
    `${String(firstName ?? "").slice(0, 1)}${String(surname ?? "")}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10) || "beginner";
  let nextUsername = base;
  let counter = 2;

  while (await memberDirectoryGateway.findUserByUsername(nextUsername)) {
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

async function buildBeginnersCourseDashboard(courseType = "beginners") {
  const normalizedCourseType = normalizeCourseType(courseType);
  const [allCourses, allLessons, allParticipants, allLoginDates, allLessonCoaches] =
    await Promise.all([
      beginnersCourseReadGateway.listCourses(),
      beginnersCourseReadGateway.listLessons(),
      beginnersCourseReadGateway.listParticipants(),
      beginnersCourseReadGateway.listParticipantLoginDates(),
      beginnersCourseReadGateway.listLessonCoaches(),
    ]);
  const courses = allCourses.filter(
    (course) => normalizeCourseType(course.course_type) === normalizedCourseType,
  );
  const lessonsByCourseId = groupRowsBy(
    allLessons,
    (lesson) => lesson.course_id,
  );
  const participantsByCourseId = groupRowsBy(
    allParticipants,
    (participant) => participant.course_id,
  );
  const loginDatesByCourseParticipant = groupRowsBy(
    allLoginDates,
    (row) => `${row.course_id}:${row.username}`,
    (row) => row.logged_in_date,
  );
  const coachesByLessonId = groupRowsBy(
    allLessonCoaches,
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

async function hasBeginnersCourseCompleted(course) {
  if (!course) {
    return false;
  }

  const lessons = await beginnersCourseReadGateway.listLessonsByCourseId(course.id);

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

async function buildBeginnersCourseCalendarLessons(courseType = null) {
  const requestedCourseType =
    typeof courseType === "string" ? normalizeCourseType(courseType) : null;
  const [allCourses, allLessons, allParticipants, allLessonCoaches] =
    await Promise.all([
      beginnersCourseReadGateway.listCourses(),
      beginnersCourseReadGateway.listLessons(),
      beginnersCourseReadGateway.listParticipants(),
      beginnersCourseReadGateway.listLessonCoaches(),
    ]);
  const approvedCourses = allCourses.filter(
    (course) =>
      (!requestedCourseType ||
        normalizeCourseType(course.course_type) === requestedCourseType) &&
      (course.approval_status ?? "pending") === "approved",
  );
  const lessonsByCourseId = groupRowsBy(
    allLessons,
    (lesson) => lesson.course_id,
  );
  const participantsByCourseId = groupRowsBy(
    allParticipants,
    (participant) => participant.course_id,
  );
  const coachesByLessonId = groupRowsBy(
    allLessonCoaches,
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

async function buildEventBookingsMap() {
  return groupRowsBy(
    await scheduleGateway.listAllEventBookings(),
    (booking) => booking.club_event_id,
    normalizeBookingRow,
  );
}

async function buildCoachingBookingsMap() {
  return groupRowsBy(
    await scheduleGateway.listAllCoachingSessionBookings(),
    (booking) => booking.coaching_session_id,
    normalizeBookingRow,
  );
}

async function buildTournamentDataMaps() {
  const [registrations, scores] = await Promise.all([
    tournamentGateway.listAllTournamentRegistrations(),
    tournamentGateway.listAllTournamentScores(),
  ]);
  const registrationsByTournamentId = groupRowsBy(
    registrations,
    (registration) => registration.tournament_id,
  );
  const scoresByTournamentId = groupRowsBy(
    scores,
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
const rfidReaderStatus = {
  checked: false,
  detected: false,
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
$lastReaderDetected = $null

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
        return @{
            AvailableReaders = @()
            Candidates = $readers
        }
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

    return @{
        AvailableReaders = $availableReaders
        Candidates = $ordered.ToArray()
    }
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
    $readerDetected = $false

    try {
        $result = [WinSCardReader]::SCardEstablishContext([WinSCardReader]::SCARD_SCOPE_USER, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
        if ($result -ne 0) {
            $result = [WinSCardReader]::SCardEstablishContext([WinSCardReader]::SCARD_SCOPE_SYSTEM, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$context)
        }
        if ($result -eq 0) {
            $readerCandidates = Get-CandidateReaders $context
            $readerDetected = $readerCandidates.AvailableReaders.Count -gt 0

            foreach ($reader in $readerCandidates.Candidates) {
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

    if ($lastReaderDetected -ne $readerDetected) {
        [pscustomobject]@{
            event = 'reader-status'
            detected = $readerDetected
        } | ConvertTo-Json -Compress | Write-Output
        [Console]::Out.Flush()
        $lastReaderDetected = $readerDetected
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
    rfidReaderStatus.checked = true;
    rfidReaderStatus.detected = false;
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
        const parsedLine = JSON.parse(trimmedLine);

        if (parsedLine?.event === "reader-status") {
          rfidReaderStatus.checked = true;
          rfidReaderStatus.detected = Boolean(parsedLine.detected);
          continue;
        }

        registerRfidScan(parsedLine, "reader");
      } catch {
        registerRfidScan(trimmedLine, "reader");
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", () => {});
  child.on("error", (error) => {
    rfidReaderStatus.checked = true;
    rfidReaderStatus.detected = false;
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

function normalizeMemberStatusWithFees(user) {
  if (!user || !isMembershipFeesOverdue(user)) {
    return user;
  }

  const nextRfidTag = getDeactivatedRfidTag(user.rfid_tag);
  const requiresUpdate =
    Boolean(user.active_member) || (user.rfid_tag ?? null) !== nextRfidTag;

  return {
    ...user,
    active_member: 0,
    rfid_tag: nextRfidTag,
    requiresMembershipStatusSync: requiresUpdate,
  };
}

async function syncMemberStatusWithFees(user) {
  const normalizedUser = normalizeMemberStatusWithFees(user);

  if (normalizedUser?.requiresMembershipStatusSync) {
    await memberAuthGateway.updateUserMembershipStatus(
      normalizedUser.username,
      normalizedUser.active_member,
      normalizedUser.rfid_tag,
    );
  }

  if (!normalizedUser) {
    return normalizedUser;
  }

  const { requiresMembershipStatusSync: _requiresMembershipStatusSync, ...syncedUser } =
    normalizedUser;
  return syncedUser;
}

async function syncAllMemberStatusesWithFees() {
  for (const user of await memberAuthGateway.listAllUsers()) {
    await syncMemberStatusWithFees(user);
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

async function findScheduleConflict({ date, startTime, endTime, venue = "both" }) {
  const sessionConflict = (await scheduleGateway.listCoachingSessions())
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

  const eventConflict = (await scheduleGateway.listClubEvents())
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
  return req.actorUser ?? null;
}

function listAssignableRoleKeys() {
  return [...cachedAssignableRoleKeys];
}

function getPermissionsForRole(roleKey) {
  if (!roleKey) {
    return [];
  }

  return [...(cachedRolePermissionsByKey.get(roleKey) ?? [])];
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

  while (cachedKnownRoleKeys.has(nextKey)) {
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

async function buildEquipmentMaps() {
  const [items, loans] = await Promise.all([
    equipmentGateway.listEquipmentItems(),
    equipmentGateway.listEquipmentLoans(),
  ]);
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

async function getCaseCapacityUsage(caseId) {
  const contents = await equipmentGateway.listEquipmentItemsByCaseId(caseId);
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

async function validateCaseAssignment(caseItem, itemToAssign) {
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

  const usage = await getCaseCapacityUsage(caseItem.id);
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
    ? findActiveEquipmentByIdentity.get([
        equipmentType,
        sizeCategory,
        itemNumber,
      ])
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

async function saveLoanBowRecord(username, loanBow) {
  await memberProfileGateway.saveLoanBowRecord(username, loanBow);
}

async function saveMemberProfile({
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

  if (!(await memberProfileGateway.roleExists(userType))) {
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
    await memberProfileGateway.saveMemberProfile({
      disciplines: normalizedDisciplines,
      loanBow: normalizedLoanBow,
      userPayload,
      userType,
    });

    const savedUser = await memberAuthGateway.findUserByUsername(userPayload.username);
    const savedLoanBow = await memberProfileGateway.findLoanBowByUsername(
      userPayload.username,
    );

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
      error?.message?.includes("UNIQUE constraint failed: users.rfid_tag") ||
      error?.message?.includes("duplicate key value violates unique constraint")
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

async function listProfilePageMembers(now = new Date()) {
  const participantsByUsername = new Map(
    (await beginnersCourseReadGateway.listParticipants()).map((participant) => [
      participant.username,
      participant,
    ]),
  );

  return (await memberDirectoryGateway.listAllUsers()).filter((user) =>
    isBeginnerVisibleInProfileOptions(
      user,
      participantsByUsername.get(user.username),
      now,
    ),
  );
}

async function buildUsageTotals(startIso, endIsoExclusive) {
  const [members, guests] = await Promise.all([
    activityReportingGateway.countMemberLoginsInRange(startIso, endIsoExclusive),
    activityReportingGateway.countGuestLoginsInRange(startIso, endIsoExclusive),
  ]);

  return {
    members: members.count,
    guests: guests.count,
    total: members.count + guests.count,
  };
}

async function buildPersonalUsageTotals(username, startIso, endIsoExclusive) {
  const members = await activityReportingGateway.countMemberLoginsForUserInRange(
    username,
    startIso,
    endIsoExclusive,
  );

  return {
    members: members.count,
    guests: 0,
    total: members.count,
  };
}

async function buildHourlyBreakdown(startIso, endIsoExclusive) {
  const [memberRows, guestRows] = await Promise.all([
    activityReportingGateway.memberLoginsByHourInRange(startIso, endIsoExclusive),
    activityReportingGateway.guestLoginsByHourInRange(startIso, endIsoExclusive),
  ]);
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

async function buildPersonalHourlyBreakdown(username, startIso, endIsoExclusive) {
  const memberRows = await activityReportingGateway.memberLoginsByHourForUserInRange(
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

async function buildWeekdayBreakdown(startIso, endIsoExclusive) {
  const [memberRows, guestRows] = await Promise.all([
    activityReportingGateway.memberLoginsByWeekdayInRange(startIso, endIsoExclusive),
    activityReportingGateway.guestLoginsByWeekdayInRange(startIso, endIsoExclusive),
  ]);
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

async function buildPersonalWeekdayBreakdown(username, startIso, endIsoExclusive) {
  const memberRows = await activityReportingGateway.memberLoginsByWeekdayForUserInRange(
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

async function buildDailyBreakdown(startDate, endDateExclusive) {
  const startIso = startDate.toISOString();
  const endIso = endDateExclusive.toISOString();
  const [memberRows, guestRows] = await Promise.all([
    activityReportingGateway.memberLoginsByDateInRange(startIso, endIso),
    activityReportingGateway.guestLoginsByDateInRange(startIso, endIso),
  ]);
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

async function buildPersonalDailyBreakdown(username, startDate, endDateExclusive) {
  const startIso = startDate.toISOString();
  const endIso = endDateExclusive.toISOString();
  const memberRows = await activityReportingGateway.memberLoginsByDateForUserInRange(
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

async function buildMonthDailyBreakdown(startDate, endDateExclusive) {
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

  for (const row of await buildDailyBreakdown(startDate, endDateExclusive)) {
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

async function buildUsageWindow(label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...(await buildUsageTotals(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    )),
    hourly: await buildHourlyBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    weekday: await buildWeekdayBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    daily: await buildDailyBreakdown(startDate, endDateExclusive),
    monthDaily: await buildMonthDailyBreakdown(startDate, endDateExclusive),
  };
}

async function buildPersonalUsageWindow(username, label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...(await buildPersonalUsageTotals(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    )),
    hourly: await buildPersonalHourlyBreakdown(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    weekday: await buildPersonalWeekdayBreakdown(
      username,
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
    daily: await buildPersonalDailyBreakdown(username, startDate, endDateExclusive),
    monthDaily: [],
  };
}

// Route modules receive prepared statements and shared helpers from this file so
// each module can stay focused on HTTP behavior for its own feature area.
registerAuthRoutes({
  app,
  buildGuestUserProfile,
  buildMemberUserProfile,
  getDeactivatedRfidTag,
  getSessionUsername,
  getUtcTimestampParts,
  hashPassword,
  latestRfidScan,
  memberAuthGateway,
  rfidReaderStatus,
  syncMemberStatusWithFees,
  clearCsrfCookie: csrfProtection.clearCookie,
  clearSessionCookie,
  createCsrfCookie: csrfProtection.createCookie,
  createSessionCookie,
  getCsrfToken: csrfProtection.getToken,
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
  buildUniqueRoleKeyFromTitle,
  CURRENT_PERMISSION_KEY_SET,
  DISTANCE_SIGN_OFF_YARDS,
  getActorUser,
  getUtcTimestampParts,
  getPermissionsForRole,
  listAssignableRoleKeys,
  listProfilePageMembers,
  memberDirectoryGateway,
  memberDistanceSignOffRepository,
  PERMISSIONS,
  refreshRoleAccessSnapshot,
  roleCommitteeGateway,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile,
  TOURNAMENT_TYPE_OPTIONS,
});

registerEquipmentRoutes({
  actorHasPermission,
  app,
  buildEquipmentCaseResponse,
  buildEquipmentItemResponse,
  buildEquipmentMaps,
  DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  EQUIPMENT_LOCATION_TYPES,
  EQUIPMENT_SIZE_CATEGORIES,
  EQUIPMENT_TYPES,
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_OPTIONS,
  equipmentGateway,
  getActorUser,
  getUtcTimestampParts,
  memberDirectoryGateway,
  PERMISSIONS,
  sanitizeCupboardLabel,
  sanitizeEquipmentCreatePayload,
  validateCaseAssignment,
});

app.get("/api/beginners-courses/dashboard", async (req, res) => {
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

  const maps = await buildEquipmentMaps();
  const cases = maps.items
    .filter((item) => item.equipment_type === EQUIPMENT_TYPES.CASE)
    .map((item) => buildEquipmentCaseResponse(item, maps));
  const users = (await memberDirectoryGateway
    .listAllUsers())
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
    courses: await buildBeginnersCourseDashboard(courseType),
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

app.get("/api/beginners-courses/calendar", async (req, res) => {
  res.json({
    success: true,
    lessons: await buildBeginnersCourseCalendarLessons(req.query?.courseType),
  });
});

app.post("/api/beginners-courses", async (req, res) => {
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

  const sanitized = await sanitizeBeginnersCoursePayload(req.body);

  if (!sanitized.success) {
    res.status(sanitized.status).json(sanitized);
    return;
  }

  const [date, time] = getUtcTimestampParts();
  const courseId = await beginnersCourseWriteGateway.createCourseWithLessons({
    actorUsername: actor.username,
    beginnerCapacity: sanitized.value.beginnerCapacity,
    coordinatorUsername: sanitized.value.coordinatorUsername,
    courseType,
    createdAtDate: date,
    createdAtTime: time,
    endTime: sanitized.value.endTime,
    firstLessonDate: sanitized.value.firstLessonDate,
    lessonCount: sanitized.value.lessonCount,
    lessonDates: buildBeginnersLessonDates(
      sanitized.value.firstLessonDate,
      sanitized.value.lessonCount,
    ),
    startTime: sanitized.value.startTime,
  });

  res.status(201).json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (course) => course.id === courseId,
      ) ?? null,
  });
});

app.post("/api/beginners-courses/:id/approve", async (req, res) => {
  const actor = getActorUser(req);

  const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

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
  await beginnersCourseWriteGateway.reviewCourse({
    approvalStatus: "approved",
    approvedAtDate: date,
    approvedAtTime: time,
    approvedByUsername: actor.username,
    courseId: course.id,
    rejectionReason: null,
  });

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === course.id,
      ) ?? null,
  });
});

app.post("/api/beginners-courses/:id/reject", async (req, res) => {
  const actor = getActorUser(req);

  const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

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
  await beginnersCourseWriteGateway.reviewCourse({
    approvalStatus: "rejected",
    approvedAtDate: date,
    approvedAtTime: time,
    approvedByUsername: actor.username,
    courseId: course.id,
    rejectionReason,
  });

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === course.id,
      ) ?? null,
  });
});

app.delete("/api/beginners-courses/:id", async (req, res) => {
  const actor = getActorUser(req);
  const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

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
  await beginnersCourseWriteGateway.cancelCourse({
    actorUsername: actor.username,
    cancelledAtDate: date,
    cancelledAtTime: time,
    courseId: course.id,
    reason: cancellationReason,
  });

  res.json({
    success: true,
  });
});

app.post("/api/beginners-courses/:id/beginners", async (req, res) => {
  const actor = getActorUser(req);

  const course = await beginnersCourseReadGateway.findCourseById(req.params.id);

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

  if (
    (await beginnersCourseReadGateway.listParticipantsByCourseId(course.id)).length >=
    course.beginner_capacity
  ) {
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
  const username = await buildBeginnersUsername(
    sanitized.value.firstName,
    sanitized.value.surname,
  );
  const [date, time] = getUtcTimestampParts();
  const userResult = await saveMemberProfile({
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

  await beginnersCourseWriteGateway.createParticipant({
    actorUsername: actor.username,
    courseId: course.id,
    createdAtDate: date,
    createdAtTime: time,
    participant: sanitized.value,
    username,
  });

  res.status(201).json({
    success: true,
    username,
    temporaryPassword: password,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === course.id,
      ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/reset-password", async (req, res) => {
  const actor = getActorUser(req);
  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);

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
  await beginnersCourseWriteGateway.resetParticipantPassword({
    passwordHash: hashPassword(password),
    username: participant.username,
  });

  res.json({
    success: true,
    username: participant.username,
    temporaryPassword: password,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === course.id,
      ) ?? null,
  });
});

app.put("/api/beginners-course-participants/:id", async (req, res) => {
  const actor = getActorUser(req);

  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
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

  const existingUser = await memberDirectoryGateway.findUserByUsername(
    participant.username,
  );

  await beginnersCourseWriteGateway.updateParticipant({
    existingUser,
    participant: sanitized.value,
    participantId: participant.id,
  });

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === participant.course_id,
      ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/convert", async (req, res) => {
  const actor = getActorUser(req);

  if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to convert beginners into members.",
    });
    return;
  }

  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);

  if (!course) {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (!(await hasBeginnersCourseCompleted(course))) {
    res.status(400).json({
      success: false,
      message: "Beginners can only be converted after the course has completed.",
    });
    return;
  }

  const existingUser = await memberDirectoryGateway.findUserByUsername(
    participant.username,
  );

  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: "The linked beginner user could not be found.",
    });
    return;
  }

  if (existingUser.user_type === "beginner") {
    const conversionResult = await saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag ?? "",
      activeMember: Boolean(existingUser.active_member),
      membershipFeesDue: existingUser.membership_fees_due ?? "",
      coachingVolunteer: Boolean(existingUser.coaching_volunteer),
      userType: "general",
      disciplines: (
        await memberDirectoryGateway.findDisciplinesByUsername(
          existingUser.username,
        )
      ).map((entry) => entry.discipline),
      loanBow: buildLoanBowRecord(
        await memberDirectoryGateway.findLoanBowByUsername(
          existingUser.username,
        ),
      ),
      existingUser,
    });

    if (!conversionResult.success) {
      res.status(conversionResult.status).json(conversionResult);
      return;
    }
  }

  await beginnersCourseWriteGateway.markParticipantConverted(participant.id);
  const courseType = normalizeCourseType(course.course_type);

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === participant.course_id,
      ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/assign-case", async (req, res) => {
  const actor = getActorUser(req);

  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Beginner record not found.",
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
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

    beginnersCourseWriteGateway.updateParticipantCase({
      actorUsername: actor.username,
      assignedAtDate: date,
      assignedAtTime: time,
      assignedCaseId: nextCase?.id ?? null,
      participantId: participant.id,
    });
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
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === participant.course_id,
      ) ?? null,
  });
});

app.post("/api/beginners-course-lessons/:id/coaches", async (req, res) => {
  const actor = getActorUser(req);

  const lesson = await beginnersCourseReadGateway.findLessonById(req.params.id);

  if (!lesson) {
    res.status(404).json({
      success: false,
      message: "Beginners lesson not found.",
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(lesson.course_id);
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
  const coaches = await Promise.all(
    coachUsernames.map((username) => memberDirectoryGateway.findUserByUsername(username)),
  );
  const invalidCoach = coachUsernames.find((username, index) => {
    const coach = coaches[index];
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
  await beginnersCourseWriteGateway.replaceLessonCoaches({
    actorUsername: actor.username,
    assignedAtDate: date,
    assignedAtTime: time,
    coachUsernames,
    lessonId: lesson.id,
  });

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === lesson.course_id,
      ) ?? null,
  });
});

app.get("/api/my-beginner-dashboard", async (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const participant = await beginnersCourseReadGateway.findParticipantByUsername(
    actor.username,
  );

  if (!participant) {
    res.json({
      success: true,
      dashboard: null,
    });
    return;
  }

  const course = await beginnersCourseReadGateway.findCourseById(participant.course_id);
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
  const lessons = await beginnersCourseReadGateway.listLessonsByCourseId(course.id);
  const todayLesson = lessons.find((lesson) => lesson.lesson_date === today) ?? null;
  const coaches = todayLesson
    ? (await beginnersCourseReadGateway.listLessonCoachesByLessonId(todayLesson.id)).map((row) => ({
        username: row.coach_username,
        fullName: `${row.first_name} ${row.surname}`.trim(),
      }))
    : [];
  const equipment = (await equipmentGateway
    .listOpenEquipmentLoansByMemberUserId(actor.username))
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

app.get("/api/my-beginner-coaching-assignments", async (req, res) => {
  const actor = getActorUser(req);

  if (!actor) {
    res.status(401).json({
      success: false,
      message: "An authenticated member is required.",
    });
    return;
  }

  const lessons = (await beginnersCourseReadGateway.listCoachLessonsByUserId(actor.id)).map((lesson) => ({
    id: lesson.id,
    courseId: lesson.course_id,
    lessonNumber: lesson.lesson_number,
    date: lesson.lesson_date,
    startTime: lesson.start_time,
    endTime: lesson.end_time,
    coordinatorName: `${lesson.coordinator_first_name} ${lesson.coordinator_surname}`.trim(),
    beginnerCount: 0,
  }));

  for (const lesson of lessons) {
    lesson.beginnerCount = (
      await beginnersCourseReadGateway.listParticipantsByCourseId(lesson.courseId)
    ).length;
  }

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
  exportsDirectory: serverRuntime.exportsDirectory,
  getActorUser,
  getUtcTimestampParts,
  path,
  PERMISSIONS,
  sanitizeFileNameSegment,
  toUtcDateString,
  tournamentGateway,
  TOURNAMENT_TYPE_OPTIONS,
  writeFileSync,
});
registerScheduleRoutes({
  actorHasPermission,
  app,
  buildClubEvent,
  buildCoachingBookingsMap,
  buildCoachingSession,
  buildEventBookingsMap,
  canActorViewApprovalEntry,
  findScheduleConflict,
  getActorUser,
  getUtcTimestampParts,
  hasScheduleEntryEnded,
  normalizeBookingRow,
  normalizeVenue,
  PERMISSIONS,
  scheduleGateway,
});

registerMemberActivityRoutes({
  activityReportingGateway,
  addUtcDays,
  app,
  actorHasPermission,
  buildGuestUserProfile,
  buildMemberUserProfile,
  buildPersonalUsageWindow,
  buildTournament,
  buildTournamentDataMaps,
  buildUsageWindow,
  getActorUser,
  listTournaments: async () => listTournaments.all(),
  PERMISSIONS,
  startOfUtcDay,
  toUtcDateString,
});

app.use("/api", apiErrorHandler);

startServer({
  app,
  databaseEngine: serverRuntime.databaseEngine,
  databasePath,
  databaseUrl: serverRuntime.databaseUrl,
  distDirectory,
  headersTimeoutMs: serverRuntime.headersTimeoutMs,
  keepAliveTimeoutMs: serverRuntime.keepAliveTimeoutMs,
  onBeforeListen: startRfidReaderMonitor,
  port,
  requestTimeoutMs: serverRuntime.requestTimeoutMs,
});
