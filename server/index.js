import express from "express";
import helmet from "helmet";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import process from "node:process";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { bootstrapPersistence } from "./bootstrap/bootstrapPersistence.js";
import { startServer } from "./bootstrap/startServer.js";
import { serverRuntime } from "./config/runtime.js";
import {
  createMemberPersistenceService,
  getDeactivatedRfidTag,
} from "./domain/services/memberPersistenceService.js";
import { createGoldenRecordsMemberSyncService } from "./domain/services/goldenRecordsMemberSyncService.js";
import { startGoldenRecordsSyncScheduler } from "./domain/services/goldenRecordsSyncScheduler.js";
import { createServerEventBus } from "./domain/services/serverEventBus.js";
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
  MEMBERSHIP_STATUS_OPTIONS,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  PROGRAMME_TYPE_OPTIONS,
  RFID_READER_NAMES,
  SYSTEM_ROLE_DEFINITIONS,
  TOURNAMENT_TEMPLATE_OPTIONS,
  TOURNAMENT_TYPE_OPTIONS,
} from "./domain/constants.js";
import { createDatabase } from "./infrastructure/persistence/createDatabase.js";
import { createActivityReportingGateway } from "./infrastructure/persistence/activityReportingGateway.js";
import { createSqliteAuthAuditStatements } from "./infrastructure/persistence/createSqliteAuthAuditStatements.js";
import { createBeginnersCourseReadGateway } from "./infrastructure/persistence/beginnersCourseReadGateway.js";
import { createBeginnersCourseWriteGateway } from "./infrastructure/persistence/beginnersCourseWriteGateway.js";
import { createSqliteBeginnersCourseStatements } from "./infrastructure/persistence/createSqliteBeginnersCourseStatements.js";
import { createSqliteEquipmentStatements } from "./infrastructure/persistence/createSqliteEquipmentStatements.js";
import { createSqliteLoanBowStatements } from "./infrastructure/persistence/createSqliteLoanBowStatements.js";
import { createSqliteAnnouncementStatements } from "./infrastructure/persistence/createSqliteAnnouncementStatements.js";
import { createSqliteReportingStatements } from "./infrastructure/persistence/createSqliteReportingStatements.js";
import { createSqliteRoleCommitteeStatements } from "./infrastructure/persistence/createSqliteRoleCommitteeStatements.js";
import { createSqliteScheduleTournamentStatements } from "./infrastructure/persistence/createSqliteScheduleTournamentStatements.js";
import { createAnnouncementGateway } from "./infrastructure/persistence/announcementGateway.js";
import { createAuditLogGateway } from "./infrastructure/persistence/auditLogGateway.js";
import { createEquipmentGateway } from "./infrastructure/persistence/equipmentGateway.js";
import { createMemberAuthGateway } from "./infrastructure/persistence/memberAuthGateway.js";
import { createMemberProfileGateway } from "./infrastructure/persistence/memberProfileGateway.js";
import { createLostArrowGateway } from "./infrastructure/persistence/lostArrowGateway.js";
import { createOutdoorTableGateway } from "./infrastructure/persistence/outdoorTableGateway.js";
import { createRangeRulesGateway } from "./infrastructure/persistence/rangeRulesGateway.js";
import { createGeneralInfoGateway } from "./infrastructure/persistence/generalInfoGateway.js";
import { createHandicapTableGateway } from "./infrastructure/persistence/handicapTableGateway.js";
import { createGoldenRecordsSyncGateway } from "./infrastructure/persistence/goldenRecordsSyncGateway.js";
import { createGoldenRecordsIntegrationGateway } from "./infrastructure/persistence/goldenRecordsIntegrationGateway.js";
import { createGoldenRecordsCurrentHandicapService } from "./infrastructure/golden-records/goldenRecordsCurrentHandicapService.js";
import { createGoldenRecordsIntegrationService } from "./infrastructure/golden-records/goldenRecordsIntegrationService.js";
import { createRoleCommitteeGateway } from "./infrastructure/persistence/roleCommitteeGateway.js";
import { createScheduleGateway } from "./infrastructure/persistence/scheduleGateway.js";
import { createSuggestionGateway } from "./infrastructure/persistence/suggestionGateway.js";
import { createMemberQuestionGateway } from "./infrastructure/persistence/memberQuestionGateway.js";
import { createCommitteeMinutesGateway } from "./infrastructure/persistence/committeeMinutesGateway.js";
import { createTournamentGateway } from "./infrastructure/persistence/tournamentGateway.js";
import { createMemberDistanceSignOffRepository } from "./infrastructure/persistence/memberDistanceSignOffRepository.js";
import {
  buildTournamentBracket,
  isTournamentMatchResolvedStatus,
} from "./domain/services/tournamentEngine.js";
import {
  evaluateTournamentRegistrationEligibility,
  evaluateTournamentRoundEligibility,
} from "./domain/services/tournamentEligibilityService.js";
import { parseTournamentRoundPlan } from "./domain/services/tournamentRoundPlan.js";
import {
  ARROW_COLOUR_VALUE_SET,
  ARROW_FLETCHING_COLOUR_VALUE_SET,
  ARROW_MATERIAL_OPTION_SET,
  ARROW_NOCK_COLOUR_VALUE_SET,
} from "../shared/arrowSchema.js";
import {
  createSecurityEventLogger,
  logServerError,
} from "./observability/securityEventLogger.js";
import { createAuditChangeLogger } from "./observability/auditChangeLogger.js";
import { registerTournamentRoutes } from "./presentation/http/registerTournamentRoutes.js";
import { registerMemberActivityRoutes } from "./presentation/http/registerMemberActivityRoutes.js";
import { registerScheduleRoutes } from "./presentation/http/registerScheduleRoutes.js";
import { registerAdminMemberRoutes } from "./presentation/http/registerAdminMemberRoutes.js";
import { registerAnnouncementRoutes } from "./presentation/http/registerAnnouncementRoutes.js";
import { registerAuditRoutes } from "./presentation/http/registerAuditRoutes.js";
import { registerAuthRoutes } from "./presentation/http/registerAuthRoutes.js";
import { registerEquipmentRoutes } from "./presentation/http/registerEquipmentRoutes.js";
import { registerLostArrowRoutes } from "./presentation/http/registerLostArrowRoutes.js";
import { registerOutdoorTableRoutes } from "./presentation/http/registerOutdoorTableRoutes.js";
import { registerRangeRulesRoutes } from "./presentation/http/registerRangeRulesRoutes.js";
import { registerGeneralInfoRoutes } from "./presentation/http/registerGeneralInfoRoutes.js";
import { registerHandicapTableRoutes } from "./presentation/http/registerHandicapTableRoutes.js";
import { registerSseRoutes } from "./presentation/http/registerSseRoutes.js";
import { registerSuggestionRoutes } from "./presentation/http/registerSuggestionRoutes.js";
import { registerMemberQuestionRoutes } from "./presentation/http/registerMemberQuestionRoutes.js";
import { registerCommitteeMinutesRoutes } from "./presentation/http/registerCommitteeMinutesRoutes.js";

const { databasePath, distDirectory, port } = serverRuntime;
const db = createDatabase(serverRuntime);
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
const GLOBAL_API_RATE_LIMIT_EXCLUDED_PATHS = new Set([
  "/api/public-events",
  "/api/server-events",
]);
const GENERAL_JSON_BODY_LIMIT = "256kb";
const COMMITTEE_PHOTO_JSON_BODY_LIMIT = "5mb";
const AUTH_RATE_LIMIT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/guest-login",
]);
const MUTATING_API_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/guest-login",
]);
const AUDIT_EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/rfid",
  "/api/auth/logout",
  "/api/auth/guest-login",
  "/api/range-rules",
  "/api/lost-arrows",
]);
const AUDIT_EXCLUDED_PATH_PREFIXES = [
  "/api/outdoor-table/",
  "/api/lost-arrows/",
];

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
  isLimitedPath: (req) =>
    req.path.startsWith("/api/") &&
    !GLOBAL_API_RATE_LIMIT_EXCLUDED_PATHS.has(req.path),
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

const sqliteUserDataStatements = await bootstrapPersistence({
  committeeRoleSeed: COMMITTEE_ROLE_SEED,
  currentPermissionKeys: CURRENT_PERMISSION_KEYS,
  currentPermissionSqlPlaceholders: CURRENT_PERMISSION_SQL_PLACEHOLDERS,
  db,
  defaultEquipmentCupboardLabel: DEFAULT_EQUIPMENT_CUPBOARD_LABEL,
  hashPassword,
  isPasswordHash,
  permissionDefinitions: PERMISSION_DEFINITIONS,
  runtime: serverRuntime,
  systemRoleDefinitions: SYSTEM_ROLE_DEFINITIONS,
});

const memberDistanceSignOffRepository = createMemberDistanceSignOffRepository(db, {
  allowedDisciplines: ALLOWED_DISCIPLINES,
  distanceYards: DISTANCE_SIGN_OFF_YARDS,
});

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

function createAuditMiddleware(recordAuditEvent) {
  // Mutating API calls are recorded after the response completes so the audit
  // event includes the final status code and request duration.
  return (req, res, next) => {
    const requestPath = req.originalUrl.split("?")[0];

    if (
      !MUTATING_API_METHODS.has(req.method) ||
      !req.path.startsWith("/api/") ||
      AUDIT_EXCLUDED_PATHS.has(req.path) ||
      AUDIT_EXCLUDED_PATH_PREFIXES.some((prefix) => requestPath.startsWith(prefix))
    ) {
      next();
      return;
    }

    const startedAt = Date.now();

    res.on("finish", () => {
      if (req.__skipGenericAuditEvent) {
        return;
      }

      const [loggedInDate, loggedInTime] = getUtcTimestampParts();

      try {
        void recordAuditEvent({
          actorUsername: getSessionUsername(req),
          action: `${req.method} ${req.route?.path ?? req.path}`,
          target: requestPath,
          statusCode: res.statusCode,
          ipAddress: getClientIp(req),
          userAgent: req.get("user-agent") ?? null,
          metadataJson: JSON.stringify({
            durationMs: Date.now() - startedAt,
            body: sanitizeAuditMetadata(req.body),
          }),
          createdAtDate: loggedInDate,
          createdAtTime: loggedInTime,
        }).catch((auditError) => {
          console.error("Failed to record audit event", auditError);
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
  beginners: "prospect",
  "have-a-go": "prospect",
  "taster-session": "prospect",
};

const COURSE_PARTICIPANT_PROGRAMME_TYPES = {
  beginners: "beginners",
  "have-a-go": "have-a-go",
  "taster-session": "taster-session",
};

const {
  deleteUserDisciplines,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  insertUserDiscipline,
  listAllUsers,
  updateGoldenRecordsId,
  updateUserMembershipStatus,
  updateUserPassword,
  upsertUser,
  upsertUserType,
} = sqliteUserDataStatements ?? {};

const sqliteRoleCommitteeStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteRoleCommitteeStatements(db)
    : null;

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
} = sqliteRoleCommitteeStatements ?? {};

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

const sqliteAnnouncementStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteAnnouncementStatements(db)
    : null;

const announcementGateway = createAnnouncementGateway({
  countSeenMembersByAnnouncementId:
    sqliteAnnouncementStatements?.countSeenMembersByAnnouncementId,
  createAnnouncement: sqliteAnnouncementStatements?.createAnnouncement,
  databaseEngine: serverRuntime.databaseEngine,
  findAnnouncementById: sqliteAnnouncementStatements?.findAnnouncementById,
  listActiveAnnouncements: sqliteAnnouncementStatements?.listActiveAnnouncements,
  listAnnouncements: sqliteAnnouncementStatements?.listAnnouncements,
  listSeenMembersByAnnouncementId:
    sqliteAnnouncementStatements?.listSeenMembersByAnnouncementId,
  markAnnouncementSeen: sqliteAnnouncementStatements?.markAnnouncementSeen,
  softDeleteAnnouncementById: sqliteAnnouncementStatements?.softDeleteAnnouncementById,
  pool: db.pool,
  updateAnnouncementById: sqliteAnnouncementStatements?.updateAnnouncementById,
});
const suggestionGateway = createSuggestionGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const memberQuestionGateway = createMemberQuestionGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const committeeMinutesGateway = createCommitteeMinutesGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const auditLogGateway = createAuditLogGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const rangeRulesGateway = createRangeRulesGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const generalInfoGateway = createGeneralInfoGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const handicapTableGateway = createHandicapTableGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const goldenRecordsSyncGateway = createGoldenRecordsSyncGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const goldenRecordsIntegrationGateway = createGoldenRecordsIntegrationGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});
const goldenRecordsCurrentHandicapService = createGoldenRecordsCurrentHandicapService(
  serverRuntime.goldenRecords,
);
const goldenRecordsIntegrationService = createGoldenRecordsIntegrationService(
  serverRuntime.goldenRecords,
  goldenRecordsIntegrationGateway,
);
const serverEventBus = createServerEventBus();
const publicServerEventBus = createServerEventBus();

let cachedAssignableRoleKeys = [];
let cachedKnownRoleKeys = new Set();
let cachedRolePermissionsByKey = new Map();
const LEGACY_NON_MEMBER_ROLE_KEYS = new Set([
  "beginner",
  "have-a-go",
  "non-member",
  "prospect",
]);

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

const sqliteLoanBowStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteLoanBowStatements(db)
    : null;
const { findLoanBowByUsername, upsertLoanBowByUsername } =
  sqliteLoanBowStatements ?? {};

const sqliteEquipmentStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteEquipmentStatements(db)
    : null;
const {
  closeEquipmentLoan,
  countEquipmentItemsByStorageLocation,
  deleteEquipmentStorageLocation,
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
} = sqliteEquipmentStatements ?? {};

const sqliteScheduleTournamentStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteScheduleTournamentStatements(db)
    : null;
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
  deleteTournamentMatchesByTournamentId,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentRoundsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findClubEventById,
  findCoachingSessionById,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findTournamentMatchByKey,
  findTournamentById,
  insertClubEvent,
  insertCoachingSession,
  insertCoachingSessionBooking,
  insertEventBooking,
  insertTournament,
  insertTournamentMatch,
  insertTournamentRegistration,
  insertTournamentRound,
  listAllCoachingSessionBookings,
  listAllEventBookings,
  listAllTournamentMatches,
  listAllTournamentRegistrations,
  listAllTournamentRounds,
  listAllTournamentScores,
  listBookingsByCoachingSessionId,
  listClubEvents,
  listCoachingSessions,
  listEventBookingsByEventId,
  listTournamentMatchesByTournamentId,
  listTournamentRegistrationsByTournamentId,
  listTournamentRoundsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  rejectClubEventById,
  rejectCoachingSessionById,
  updateTournamentMatchWorkflow,
  updateTournamentById,
  upsertTournamentScore,
} = sqliteScheduleTournamentStatements ?? {};

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

const sqliteBeginnersCourseStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteBeginnersCourseStatements(db)
    : null;
const {
  cancelBeginnersCourse,
  deleteBeginnersCourseParticipant,
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
  transferBeginnersCourseParticipant,
  updateBeginnersCourseApproval,
  updateBeginnersCourseLessonSchedule,
  updateBeginnersCourseParticipant,
  updateBeginnersCourseParticipantCase,
  updateBeginnersCourseSchedule,
} = sqliteBeginnersCourseStatements ?? {};

const tournamentGateway = createTournamentGateway({
  databaseEngine: serverRuntime.databaseEngine,
  deleteTournamentById,
  deleteTournamentMatchesByTournamentId,
  deleteTournamentRegistration,
  deleteTournamentRegistrationsByTournamentId,
  deleteTournamentRoundsByTournamentId,
  deleteTournamentScoresByTournamentId,
  findTournamentMatchByKey,
  findTournamentById,
  insertTournament,
  insertTournamentMatch,
  insertTournamentRegistration,
  insertTournamentRound,
  listAllTournamentMatches,
  listAllTournamentRegistrations,
  listAllTournamentRounds,
  listAllTournamentScores,
  listTournamentMatchesByTournamentId,
  listTournamentRegistrationsByTournamentId,
  listTournamentRoundsByTournamentId,
  listTournamentScoresByTournamentId,
  listTournaments,
  pool: db.pool,
  updateTournamentMatchWorkflow,
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

const sqliteAuthAuditStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteAuthAuditStatements(db)
    : null;
const { insertAuditEvent, insertGuestLoginEvent, insertLoginEvent } =
  sqliteAuthAuditStatements ?? {};

const recordAuditEvent = serverRuntime.databaseEngine === "sqlite"
  ? async (payload) => {
      insertAuditEvent.run(payload);
    }
  : async (payload) => {
      await db.pool.query(
        `
          INSERT INTO audit_events (
            actor_username,
            action,
            target,
            status_code,
            ip_address,
            user_agent,
            metadata_json,
            created_at_date,
            created_at_time,
            actor_user_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
        `,
        [
          payload.actorUsername,
          payload.action,
          payload.target,
          payload.statusCode,
          payload.ipAddress,
          payload.userAgent,
          payload.metadataJson,
          payload.createdAtDate,
          payload.createdAtTime,
        ],
      );
    };
const auditChangeLogger = createAuditChangeLogger({
  recordAuditEvent,
});

const sqliteReportingStatements =
  serverRuntime.databaseEngine === "sqlite"
    ? createSqliteReportingStatements(db)
    : null;
const {
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  findDisciplinesByUsername,
  findLatestRangeMembers,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
  listMemberJourneyParticipants,
  listReportingGuestLogins,
  listReportingMemberLogins,
  memberLoginsByDateForUserInRange,
  memberLoginsByDateInRange,
  memberLoginsByHourForUserInRange,
  memberLoginsByHourInRange,
  memberLoginsByWeekdayForUserInRange,
  memberLoginsByWeekdayInRange,
} = sqliteReportingStatements ?? {};

const activityReportingGateway = createActivityReportingGateway({
  countGuestLoginsInRange,
  countMemberLoginsForUserInRange,
  countMemberLoginsInRange,
  databaseEngine: serverRuntime.databaseEngine,
  findMemberCoachingBookingsByUserId,
  findMemberEventBookingsByUserId,
  findLatestRangeMembers,
  findRecentGuestLogins,
  findRecentRangeMembers,
  guestLoginsByDateInRange,
  guestLoginsByHourInRange,
  guestLoginsByWeekdayInRange,
  listAllUserDisciplines,
  listMemberJourneyParticipants,
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
  findRangePresenceExtensionByUsername:
    serverRuntime.databaseEngine === "sqlite"
      ? db.prepare(`
          SELECT
            username,
            active_until_date,
            active_until_time,
            updated_by_username,
            updated_at_date,
            updated_at_time
          FROM range_presence_extensions
          WHERE LOWER(username) = LOWER(?)
          LIMIT 1
        `)
      : null,
  findUserByCredentials,
  findUserByRfid,
  findUserByUsername,
  insertGuestLoginEvent,
  insertLoginEvent,
  listAllUsers,
  pool: db.pool,
  upsertRangePresenceExtension:
    serverRuntime.databaseEngine === "sqlite"
      ? db.prepare(`
          INSERT INTO range_presence_extensions (
            username,
            active_until_date,
            active_until_time,
            updated_by_username,
            updated_at_date,
            updated_at_time
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            active_until_date = excluded.active_until_date,
            active_until_time = excluded.active_until_time,
            updated_by_username = excluded.updated_by_username,
            updated_at_date = excluded.updated_at_date,
            updated_at_time = excluded.updated_at_time
        `)
      : null,
  updateGoldenRecordsId,
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

const lostArrowGateway = createLostArrowGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});

const outdoorTableGateway = createOutdoorTableGateway({
  databaseEngine: serverRuntime.databaseEngine,
  db,
  pool: db.pool,
});

const memberDirectoryGateway = {
  findDisciplinesByUsername: (username) =>
    memberAuthGateway.findDisciplinesByUsername(username),
  findLoanBowByUsername: (username) =>
    memberProfileGateway.findLoanBowByUsername(username),
  findUserByUsername: (username) => memberAuthGateway.findUserByUsername(username),
  listAllUsers: () => memberAuthGateway.listAllUsers(),
  updateGoldenRecordsId: (username, goldenRecordsId) =>
    memberAuthGateway.updateGoldenRecordsId(username, goldenRecordsId),
};
const goldenRecordsMemberSyncService = createGoldenRecordsMemberSyncService({
  distanceSignOffYards: DISTANCE_SIGN_OFF_YARDS,
  getUtcTimestampParts,
  goldenRecordsCurrentHandicapService,
  goldenRecordsSyncGateway,
  memberDirectoryGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
});

startGoldenRecordsSyncScheduler({
  hour: 1,
  minute: 0,
  syncAllMembers: () => goldenRecordsMemberSyncService.syncAllMembers(),
});

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
  deleteBeginnersCourseParticipant,
  deleteBeginnersLessonCoachesByLessonId,
  insertBeginnersCourse,
  insertBeginnersCourseLesson,
  insertBeginnersCourseParticipant,
  insertBeginnersLessonCoach,
  markBeginnersCourseParticipantConverted,
  transferBeginnersCourseParticipant,
  pool: db.pool,
  updateBeginnersCourseApproval,
  updateBeginnersCourseLessonSchedule,
  updateBeginnersCourseParticipant,
  updateBeginnersCourseParticipantCase,
  updateBeginnersCourseSchedule,
  updateUserPassword,
  upsertUser,
});

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

function buildMemberUserProfile(user, disciplines = [], meta = {}) {
  // Server-facing rows are converted to the normalized profile contract used by
  // session storage, permissions checks, and presentation helpers.
  const permissions = getPermissionsForRole(user.user_type);
  const membershipStatus = inferMembershipStatus(user);
  const programmeType = inferProgrammeType(user);

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
      emailAddress: user.email_address ?? "",
      archeryGbMembershipNumber: user.archery_gb_membership_number ?? null,
    },
    membership: {
      role: user.user_type,
      status: membershipStatus,
      programmeType,
      permissions,
      disciplines,
    },
    meta: {
      activeMember: Boolean(user.active_member),
      affiliateMember: Boolean(user.affiliate_member),
      juniorMember: Boolean(user.junior_member),
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
    goldenRecordsId: user.gr_id ?? "",
    archeryGbMembershipNumber: user.archery_gb_membership_number ?? "",
    emailAddress: user.email_address ?? "",
    password: "",
    rfidTag: user.rfid_tag ?? "",
    activeMember: Boolean(user.active_member),
    affiliateMember: Boolean(user.affiliate_member),
    juniorMember: Boolean(user.junior_member),
    membershipFeesDue: user.membership_fees_due ?? "",
    coachingVolunteer: Boolean(user.coaching_volunteer),
    userType: user.user_type,
    membershipStatus: inferMembershipStatus(user),
    programmeType: inferProgrammeType(user),
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
      status: "guest",
      programmeType: "none",
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

function inferMembershipStatus(user) {
  const normalizedStatus = String(user?.membership_status ?? "").trim().toLowerCase();

  if (MEMBERSHIP_STATUS_OPTIONS.includes(normalizedStatus)) {
    return normalizedStatus;
  }

  const normalizedRole = String(user?.user_type ?? "").trim().toLowerCase();

  if (LEGACY_NON_MEMBER_ROLE_KEYS.has(normalizedRole)) {
    return "non-member";
  }

  if (normalizedRole === "guest") {
    return "guest";
  }

  return "member";
}

function inferProgrammeType(user) {
  const normalizedProgrammeType = String(user?.programme_type ?? "").trim().toLowerCase();

  if (PROGRAMME_TYPE_OPTIONS.includes(normalizedProgrammeType)) {
    return normalizedProgrammeType;
  }

  const normalizedRole = String(user?.user_type ?? "").trim().toLowerCase();

  if (normalizedRole === "beginner") {
    return "beginners";
  }

  if (normalizedRole === "have-a-go") {
    return "have-a-go";
  }

  return "none";
}

const memberPersistenceService = createMemberPersistenceService({
  buildEditableMemberProfile,
  buildMemberUserProfile,
  deactivatedRfidSuffix: DEACTIVATED_RFID_SUFFIX,
  hashPassword,
  memberAuthGateway,
  memberProfileGateway,
  sanitizeDisciplines,
  sanitizeLoanBow,
});

if (serverRuntime.databaseEngine === "sqlite") {
  await memberPersistenceService.syncAllMemberStatusesWithFees();
}

app.use(async (req, _res, next) => {
  const actorUsername = getActorUsername(req);

  if (!actorUsername) {
    req.actorUser = null;
    next();
    return;
  }

  try {
    const actor = await memberPersistenceService.syncMemberStatusWithFees(
      await memberAuthGateway.findUserByUsername(actorUsername),
    );
    req.actorUser = actor?.active_member ? actor : null;
    next();
  } catch (error) {
    next(error);
  }
});
app.use(createAuditMiddleware(recordAuditEvent));

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

  const coordinatorUser = coordinatorUsername
    ? await memberDirectoryGateway.findUserByUsername(coordinatorUsername)
    : null;

  if (!coordinatorUsername || !coordinatorUser) {
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
      coordinatorUsername: coordinatorUser.username,
      firstLessonDate,
      startTime,
      endTime,
      lessonCount,
      beginnerCapacity,
    },
  };
}

function sanitizeBeginnersCourseReschedulePayload(payload) {
  const firstLessonDate =
    typeof payload?.firstLessonDate === "string" ? payload.firstLessonDate.trim() : "";
  const startTime =
    typeof payload?.startTime === "string" ? payload.startTime.trim() : "";
  const endTime =
    typeof payload?.endTime === "string" ? payload.endTime.trim() : "";

  if (!firstLessonDate) {
    return {
      success: false,
      status: 400,
      message: "Choose the new first lesson date.",
    };
  }

  if (!startTime || !endTime || endTime <= startTime) {
    return {
      success: false,
      status: 400,
      message: "Choose a valid lesson start and end time.",
    };
  }

  return {
    success: true,
    value: {
      firstLessonDate,
      startTime,
      endTime,
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
      message: "First name and surname are required for each attendee.",
    };
  }

  return {
    success: true,
    value: {
      firstName,
      surname,
      sizeCategory,
      heightText: heightText || null,
      drawLength:
        typeof payload?.drawLength === "string"
          ? payload.drawLength.trim().slice(0, 40) || null
          : null,
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

async function resolveCanonicalUsername(username) {
  const normalizedUsername = String(username ?? "").trim();

  if (!normalizedUsername) {
    return "";
  }

  const existingUser = await memberDirectoryGateway.findUserByUsername(
    normalizedUsername,
  );

  return existingUser?.username ?? normalizedUsername;
}

function normalizeCourseType(value) {
  if (value === "have-a-go" || value === "taster-session") {
    return value;
  }

  return "beginners";
}

function getCourseParticipantMembershipStatus() {
  return "non-member";
}

function getCourseParticipantProgrammeType(courseType) {
  return COURSE_PARTICIPANT_PROGRAMME_TYPES[normalizeCourseType(courseType)] ?? "none";
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
  return normalizeCourseType(courseType) !== "beginners"
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
  return COURSE_PARTICIPANT_USER_TYPES[normalizeCourseType(courseType)] ?? "non-member";
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
      drawLength: participant.draw_length ?? "",
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
        !LEGACY_NON_MEMBER_ROLE_KEYS.has(
          String(participant.participant_user_type ?? "").trim().toLowerCase(),
        ),
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

function buildCaseReservationMap(allParticipants, allCourses) {
  const coursesById = new Map(allCourses.map((course) => [course.id, course]));
  const reservationsByCaseId = new Map();

  for (const participant of allParticipants) {
    if (!participant.assigned_case_id || participant.converted_to_member) {
      continue;
    }

    const course = coursesById.get(participant.course_id);

    if (!course || Boolean(course.is_cancelled)) {
      continue;
    }

    if (!reservationsByCaseId.has(participant.assigned_case_id)) {
      reservationsByCaseId.set(participant.assigned_case_id, {
        participantId: participant.id,
        participantUsername: participant.username,
        participantName: `${participant.first_name} ${participant.surname}`.trim(),
        courseId: participant.course_id,
        courseType: normalizeCourseType(course.course_type),
      });
    }
  }

  return reservationsByCaseId;
}

async function findBeginnersCourseAuditSnapshot(courseId, courseType = null) {
  let resolvedCourseType = courseType ? normalizeCourseType(courseType) : null;

  if (!resolvedCourseType) {
    const course = await beginnersCourseReadGateway.findCourseById(courseId);

    if (!course) {
      return null;
    }

    resolvedCourseType = normalizeCourseType(course.course_type);
  }

  const course = (await buildBeginnersCourseDashboard(resolvedCourseType)).find(
    (entry) => String(entry.id) === String(courseId),
  );

  if (!course) {
    return null;
  }

  return {
    ...course,
    courseType: resolvedCourseType,
  };
}

async function findBeginnersParticipantAuditSnapshot(participantId, courseType = null) {
  const participant = await beginnersCourseReadGateway.findParticipantById(participantId);

  if (!participant) {
    return null;
  }

  const course = await findBeginnersCourseAuditSnapshot(participant.course_id, courseType);
  const participantEntry =
    course?.beginners.find((entry) => String(entry.id) === String(participantId)) ?? null;

  if (!participantEntry || !course) {
    return null;
  }

  return {
    ...participantEntry,
    courseId: course.id,
    courseType: course.courseType,
    courseFirstLessonDate: course.firstLessonDate,
  };
}

async function findBeginnersLessonAuditSnapshot(lessonId, courseType = null) {
  const lesson = await beginnersCourseReadGateway.findLessonById(lessonId);

  if (!lesson) {
    return null;
  }

  const course = await findBeginnersCourseAuditSnapshot(lesson.course_id, courseType);
  const lessonEntry =
    course?.lessons.find((entry) => String(entry.id) === String(lessonId)) ?? null;

  if (!lessonEntry || !course) {
    return null;
  }

  return {
    ...lessonEntry,
    courseId: course.id,
    courseType: course.courseType,
    courseFirstLessonDate: course.firstLessonDate,
  };
}

function buildBeginnersCourseAuditLabel(course) {
  if (!course) {
    return "Beginners course";
  }

  return course.courseType === "have-a-go"
    ? `Have a Go ${course.firstLessonDate}`
    : `Beginners course ${course.firstLessonDate}`;
}

function buildBeginnersParticipantAuditLabel(participant) {
  return participant?.fullName?.trim() || participant?.username || "Beginners participant";
}

function buildBeginnersLessonAuditLabel(lesson) {
  if (!lesson) {
    return "Beginners lesson";
  }

  return `Lesson ${lesson.lessonNumber} ${lesson.date}`;
}

function buildBeginnersRescheduleNotification(course) {
  if (!course) {
    return null;
  }

  const courseType = normalizeCourseType(course.courseType ?? course.course_type);
  const label =
    courseType === "taster-session"
      ? "Taster Session"
      : courseType === "have-a-go"
        ? "Have a Go session"
        : "Beginners course";

  return {
    courseId: course.id,
    courseType,
    firstLessonDate: course.firstLessonDate ?? course.first_lesson_date ?? "",
    id: `beginners-reschedule-${courseType}-${course.id}-${course.firstLessonDate ?? course.first_lesson_date ?? ""}-${course.startTime ?? course.start_time ?? ""}-${course.endTime ?? course.end_time ?? ""}`,
    message: `${label} on ${formatDate(course.firstLessonDate ?? course.first_lesson_date ?? "")} was rescheduled to ${formatClockTime(course.startTime ?? course.start_time ?? "")}-${formatClockTime(course.endTime ?? course.end_time ?? "")}.`,
    title: `${label} rescheduled`,
    targetPath:
      courseType === "taster-session"
        ? "/beginners-courses?tab=taster-session"
        : "/beginners-courses",
  };
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

function hasScheduleEntryStarted(date, startTime) {
  if (!date || !startTime) {
    return false;
  }

  const normalizedStartTime = /^\d{2}:\d{2}$/.test(startTime)
    ? `${startTime}:00`
    : startTime;
  const entryStart = new Date(`${date}T${normalizedStartTime}`);

  if (Number.isNaN(entryStart.getTime())) {
    return false;
  }

  return entryStart.getTime() <= Date.now();
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
  const [registrations, rounds, scores, matches] = await Promise.all([
    tournamentGateway.listAllTournamentRegistrations(),
    tournamentGateway.listAllTournamentRounds(),
    tournamentGateway.listAllTournamentScores(),
    tournamentGateway.listAllTournamentMatches(),
  ]);
  const registrationsByTournamentId = groupRowsBy(
    registrations,
    (registration) => registration.tournament_id,
  );
  const roundsByTournamentId = groupRowsBy(
    rounds,
    (round) => round.tournament_id,
  );
  const scoresByTournamentId = groupRowsBy(
    scores,
    (score) => score.tournament_id,
  );
  const matchesByTournamentId = groupRowsBy(
    matches,
    (match) => match.tournament_id,
  );

  return {
    matchesByTournamentId,
    registrationsByTournamentId,
    roundsByTournamentId,
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

  serverEventBus.broadcastToAll("rfid.scan", {
    sequence: latestRfidScan.sequence,
    rfidTag: latestRfidScan.rfidTag,
    scannedAt: latestRfidScan.scannedAt,
    source: latestRfidScan.source,
    scanType: latestRfidScan.scanType,
    cardBrand: latestRfidScan.cardBrand,
  });
  publicServerEventBus.broadcastToAll("rfid.scan", {
    sequence: latestRfidScan.sequence,
    rfidTag: latestRfidScan.rfidTag,
    scannedAt: latestRfidScan.scannedAt,
    source: latestRfidScan.source,
    scanType: latestRfidScan.scanType,
    cardBrand: latestRfidScan.cardBrand,
  });
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

function buildClubEvent(event, bookings = [], actor = null) {
  const actorUsername = actor?.username ?? null;
  const canApprove = actorHasPermission(actor, PERMISSIONS.APPROVE_EVENTS);
  const eventTypes = normalizeClubEventTypes(event);
  const canViewBookings = canActorViewEventBookings(actor, event);

  return {
    id: event.id,
    date: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    title: event.title,
    details: event.details?.trim() || "",
    type: eventTypes[0],
    types: eventTypes,
    venue: normalizeVenue(event.venue),
    bookings: canViewBookings ? bookings : [],
    bookingCount: bookings.length,
    canViewBookings,
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

function canActorViewEventBookings(actor, event) {
  const actorUsername = actor?.username ?? null;

  if (!actorUsername) {
    return false;
  }

  if ((event?.submitted_by_username ?? null) === actorUsername) {
    return true;
  }

  const roleKey = String(actor?.user_type ?? "").trim().toLowerCase();

  return roleKey === "admin" || roleKey === "developer";
}

function normalizeClubEventTypes(event) {
  const parsedTypes =
    typeof event?.types === "string" && event.types.trim().startsWith("[")
      ? safelyParseJsonArray(event.types)
      : [];
  const normalizedTypes = [...new Set(
    parsedTypes
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )];

  if (normalizedTypes.length > 0) {
    return normalizedTypes;
  }

  return typeof event?.type === "string" && event.type.trim()
    ? [event.type.trim()]
    : [];
}

function safelyParseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function addUtcDaysToDateString(dateString, daysToAdd) {
  const parsed = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  parsed.setUTCDate(parsed.getUTCDate() + Number(daysToAdd || 0));
  return parsed.toISOString().slice(0, 10);
}

function buildAutomaticRoundTitles(defaultRoundNames = [], totalRounds) {
  const nonGenericNames = defaultRoundNames.filter(
    (name) => !/^round\s+\d+$/i.test(String(name ?? "").trim()),
  );
  const specialSuffix =
    nonGenericNames.length > 0 ? nonGenericNames : [];
  const genericCount = Math.max(totalRounds - specialSuffix.length, 0);
  const genericTitles = Array.from({ length: genericCount }, (_, index) => `Round ${index + 1}`);

  return [...genericTitles, ...specialSuffix].slice(-totalRounds);
}

function normalizePersistedTournamentRounds(roundRows = []) {
  return roundRows
    .map((round, index) => ({
      roundNumber:
        Number.isInteger(round?.round_number) && round.round_number > 0
          ? round.round_number
          : Number.isInteger(round?.roundNumber) && round.roundNumber > 0
            ? round.roundNumber
            : index + 1,
      title:
        typeof round?.title === "string" && round.title.trim()
          ? round.title.trim()
          : `Round ${index + 1}`,
      publishDate: round?.publish_date ?? round?.publishDate ?? null,
      submissionDeadline:
        round?.submission_deadline ?? round?.submissionDeadline ?? null,
      status:
        typeof round?.status === "string" && round.status.trim()
          ? round.status.trim()
          : "scheduled",
    }))
    .sort((left, right) => left.roundNumber - right.roundNumber);
}

function buildAutomaticRoundSchedule({
  automaticConfig,
  defaultRoundNames,
  totalRounds,
}) {
  if (!automaticConfig || totalRounds <= 0) {
    return [];
  }

  const titles = buildAutomaticRoundTitles(defaultRoundNames, totalRounds);
  const rounds = [];
  let publishDate = automaticConfig.firstRoundStartDate;

  for (let index = 0; index < totalRounds; index += 1) {
    const submissionDeadline = addUtcDaysToDateString(
      publishDate,
      automaticConfig.roundWindowDays,
    );

    rounds.push({
      roundNumber: index + 1,
      title: titles[index] ?? `Round ${index + 1}`,
      publishDate,
      submissionDeadline,
      status: "scheduled",
    });

    publishDate = addUtcDaysToDateString(
      submissionDeadline,
      automaticConfig.roundRestDays + 1,
    );
  }

  return rounds;
}

function getTournamentTemplateDefinition(tournament) {
  const templateKey = tournament?.template_key ?? tournament?.templateKey ?? null;

  if (templateKey) {
    const matchingTemplate = TOURNAMENT_TEMPLATE_OPTIONS.find(
      (template) => template.key === templateKey,
    );

    if (matchingTemplate) {
      return matchingTemplate;
    }
  }

  if (tournament?.tournament_type === "head-to-head") {
    return (
      TOURNAMENT_TEMPLATE_OPTIONS.find(
        (template) => template.key === "standard-knockout",
      ) ?? null
    );
  }

  return null;
}

function buildTournamentMatchId(tournamentId, roundNumber, matchNumber) {
  return `tournament-${tournamentId}-round-${roundNumber}-match-${matchNumber}`;
}

function normalizePersistedTournamentMatches(matchRows = []) {
  return matchRows
    .map((match) => ({
      tournamentId: match?.tournament_id ?? match?.tournamentId ?? null,
      roundNumber:
        Number.isInteger(match?.round_number) && match.round_number > 0
          ? match.round_number
          : Number.isInteger(match?.roundNumber) && match.roundNumber > 0
            ? match.roundNumber
            : 1,
      matchNumber:
        Number.isInteger(match?.match_number) && match.match_number > 0
          ? match.match_number
          : Number.isInteger(match?.matchNumber) && match.matchNumber > 0
            ? match.matchNumber
            : 1,
      leftMemberUsername:
        match?.left_member_username ?? match?.leftMemberUsername ?? null,
      rightMemberUsername:
        match?.right_member_username ?? match?.rightMemberUsername ?? null,
      leftScore: match?.left_score ?? match?.leftScore ?? null,
      rightScore: match?.right_score ?? match?.rightScore ?? null,
      winnerUsername: match?.winner_username ?? match?.winnerUsername ?? null,
      submittedByUsername:
        match?.submitted_by_username ?? match?.submittedByUsername ?? null,
      submittedAt:
        match?.submitted_at_date && match?.submitted_at_time
          ? `${match.submitted_at_date}T${match.submitted_at_time}`
          : match?.submittedAt ?? null,
      confirmedByUsername:
        match?.confirmed_by_username ?? match?.confirmedByUsername ?? null,
      confirmedAt:
        match?.confirmed_at_date && match?.confirmed_at_time
          ? `${match.confirmed_at_date}T${match.confirmed_at_time}`
          : match?.confirmedAt ?? null,
      disputedByUsername:
        match?.disputed_by_username ?? match?.disputedByUsername ?? null,
      disputedAt:
        match?.disputed_at_date && match?.disputed_at_time
          ? `${match.disputed_at_date}T${match.disputed_at_time}`
          : match?.disputedAt ?? null,
      disputeReason: match?.dispute_reason ?? match?.disputeReason ?? null,
      handicapAllowancePercent:
        match?.handicap_allowance_percent ?? match?.handicapAllowancePercent ?? null,
      leftHandicapValue:
        match?.left_handicap_value ?? match?.leftHandicapValue ?? null,
      leftHandicapType:
        match?.left_handicap_type ?? match?.leftHandicapType ?? null,
      leftHandicapBowClass:
        match?.left_handicap_bow_class ?? match?.leftHandicapBowClass ?? null,
      leftHandicapDiscipline:
        match?.left_handicap_discipline ?? match?.leftHandicapDiscipline ?? null,
      leftReferenceScore:
        match?.left_reference_score ?? match?.leftReferenceScore ?? null,
      leftAllowancePoints:
        match?.left_allowance_points ?? match?.leftAllowancePoints ?? null,
      leftAdjustedScore:
        match?.left_adjusted_score ?? match?.leftAdjustedScore ?? null,
      leftHandicapTableKey:
        match?.left_handicap_table_key ?? match?.leftHandicapTableKey ?? null,
      leftHandicapTableTitle:
        match?.left_handicap_table_title ?? match?.leftHandicapTableTitle ?? null,
      rightHandicapValue:
        match?.right_handicap_value ?? match?.rightHandicapValue ?? null,
      rightHandicapType:
        match?.right_handicap_type ?? match?.rightHandicapType ?? null,
      rightHandicapBowClass:
        match?.right_handicap_bow_class ?? match?.rightHandicapBowClass ?? null,
      rightHandicapDiscipline:
        match?.right_handicap_discipline ?? match?.rightHandicapDiscipline ?? null,
      rightReferenceScore:
        match?.right_reference_score ?? match?.rightReferenceScore ?? null,
      rightAllowancePoints:
        match?.right_allowance_points ?? match?.rightAllowancePoints ?? null,
      rightAdjustedScore:
        match?.right_adjusted_score ?? match?.rightAdjustedScore ?? null,
      rightHandicapTableKey:
        match?.right_handicap_table_key ?? match?.rightHandicapTableKey ?? null,
      rightHandicapTableTitle:
        match?.right_handicap_table_title ?? match?.rightHandicapTableTitle ?? null,
      status:
        typeof match?.status === "string" && match.status.trim()
          ? match.status.trim()
          : "scheduled",
    }))
    .sort(
      (left, right) =>
        left.roundNumber - right.roundNumber || left.matchNumber - right.matchNumber,
    );
}

function mapBracketMatchToEngineMatch(match, round, tournament, scoreWindow, actorUsername = null) {
  const requiresConfirmation =
    tournament?.template?.capabilities?.supportsMatchConfirmation ?? false;
  const actorIsCompetitorA =
    actorUsername && match.leftParticipant?.username === actorUsername;
  const actorIsCompetitorB =
    actorUsername && match.rightParticipant?.username === actorUsername;
  const submittedByUsername = match.submittedByUsername ?? null;
  const waitingForOpponentConfirmation =
    match.status === "awaiting_opponent_confirmation" &&
    submittedByUsername &&
    submittedByUsername !== actorUsername;
  const competitorAIsRoundEligible = match.leftEligibility?.round?.isEligible !== false;
  const competitorBIsRoundEligible = match.rightEligibility?.round?.isEligible !== false;
  const roundEligibilityReason =
    match.leftEligibility?.round?.reason ?? match.rightEligibility?.round?.reason ?? null;
  const canSubmitResult = Boolean(
    actorUsername &&
      (actorIsCompetitorA || actorIsCompetitorB) &&
      match.leftParticipant &&
      match.rightParticipant &&
      competitorAIsRoundEligible &&
      competitorBIsRoundEligible &&
      ["scheduled", "pending", "awaiting_result"].includes(match.status),
  );
  const canConfirmResult = Boolean(
    actorUsername &&
      waitingForOpponentConfirmation &&
      (actorIsCompetitorA || actorIsCompetitorB),
  );
  const canDisputeResult = canConfirmResult;
  const leftScore = match.leftScore ?? null;
  const rightScore = match.rightScore ?? null;
  const hasFinalWinner = Boolean(match.winner?.username);
  const retirement =
    match.status === "retired_both"
      ? {
          competitorA: true,
          competitorB: true,
        }
      : hasFinalWinner &&
          Number.isInteger(rightScore) &&
          leftScore === null &&
          match.winner?.username === match.rightParticipant?.username
        ? {
            competitorA: true,
            competitorB: false,
          }
        : hasFinalWinner &&
            Number.isInteger(leftScore) &&
            rightScore === null &&
            match.winner?.username === match.leftParticipant?.username
          ? {
              competitorA: false,
              competitorB: true,
            }
          : null;

  return {
    id: match.id,
    roundNumber: round.roundNumber,
    roundTitle: round.title,
    status: match.status,
    competitorA: match.leftParticipant ?? null,
    competitorB: match.rightParticipant ?? null,
    score: {
      competitorA: leftScore,
      competitorB: rightScore,
    },
    winner: match.winner ?? null,
    retirement,
    submissionDeadline: scoreWindow?.endDate ?? null,
    handicap:
      match.leftHandicapValue !== null ||
      match.rightHandicapValue !== null ||
      match.leftAdjustedScore !== null ||
      match.rightAdjustedScore !== null
        ? {
            allowancePercent: match.handicapAllowancePercent ?? null,
            competitorA: {
              allowancePoints: match.leftAllowancePoints ?? null,
              adjustedScore: match.leftAdjustedScore ?? null,
              bowClass: match.leftHandicapBowClass ?? null,
              discipline: match.leftHandicapDiscipline ?? null,
              handicapType: match.leftHandicapType ?? null,
              handicapValue: match.leftHandicapValue ?? null,
              referenceScore: match.leftReferenceScore ?? null,
              tableKey: match.leftHandicapTableKey ?? null,
              tableTitle: match.leftHandicapTableTitle ?? null,
            },
            competitorB: {
              allowancePoints: match.rightAllowancePoints ?? null,
              adjustedScore: match.rightAdjustedScore ?? null,
              bowClass: match.rightHandicapBowClass ?? null,
              discipline: match.rightHandicapDiscipline ?? null,
              handicapType: match.rightHandicapType ?? null,
              handicapValue: match.rightHandicapValue ?? null,
              referenceScore: match.rightReferenceScore ?? null,
              tableKey: match.rightHandicapTableKey ?? null,
              tableTitle: match.rightHandicapTableTitle ?? null,
            },
          }
        : null,
    workflow: {
      resultSubmissionMode:
        tournament?.template?.defaults?.resultWorkflow ?? "single-submit",
      requiresOpponentConfirmation: requiresConfirmation,
      submittedByUsername,
      submittedAt: match.submittedAt ?? null,
      confirmedByUsername: match.confirmedByUsername ?? null,
      confirmedAt: match.confirmedAt ?? null,
      disputedByUsername: match.disputedByUsername ?? null,
      disputedAt: match.disputedAt ?? null,
      disputeReason: match.disputeReason ?? null,
      actorRole: actorIsCompetitorA
        ? "competitorA"
        : actorIsCompetitorB
          ? "competitorB"
          : null,
      ineligibilityReason: roundEligibilityReason,
      canSubmitResult,
      canConfirmResult,
      canDisputeResult,
    },
  };
}

function buildTournamentEngine(rounds, tournamentRecord, actorUsername = null) {
  const template = getTournamentTemplateDefinition(tournamentRecord);
  const engineRounds = rounds.map((round) => {
    const configuredRound =
      tournamentRecord.roundSchedule?.find(
        (entry) => entry.roundNumber === round.roundNumber,
      ) ?? null;
    const matchStatuses = round.matches.map((match) => match.status);
    const isComplete =
      matchStatuses.length > 0 &&
      matchStatuses.every((status) => isTournamentMatchResolvedStatus(status));

    return {
      roundNumber: round.roundNumber,
      title: configuredRound?.title ?? round.title,
      status: isComplete ? "completed" : "pending",
      submissionDeadline:
        configuredRound?.submissionDeadline ??
        tournamentRecord.scoreWindow?.endDate ??
        null,
      matches: round.matches.map((match) =>
        mapBracketMatchToEngineMatch(
          match,
          {
            ...round,
            title: configuredRound?.title ?? round.title,
          },
          { ...tournamentRecord, template },
          {
            ...tournamentRecord.scoreWindow,
            endDate:
              configuredRound?.submissionDeadline ??
              tournamentRecord.scoreWindow?.endDate ??
              null,
          },
          actorUsername,
        ),
      ),
    };
  });

  return {
    format: template?.format ?? "bracket",
    template: template
      ? {
          key: template.key,
          label: template.label,
          description: template.description,
          roundType: template.roundType,
          capabilities: template.capabilities,
          defaults: template.defaults ?? {},
          eligibilityRules: template.eligibilityRules ?? null,
        }
      : null,
    lifecycle: {
      registrationWindow: tournamentRecord.registrationWindow,
      drawDate: tournamentRecord.drawDate ?? null,
      activeRoundNumber: tournamentRecord.currentRoundNumber ?? null,
      scoreWindow: tournamentRecord.scoreWindow,
    },
    rounds: engineRounds,
    matches: engineRounds.flatMap((round) => round.matches),
  };
}

function buildTournament(
  tournament,
  registrations = [],
  scores = [],
  actorUsername = null,
  roundRows = [],
  matchRows = [],
  options = {},
) {
  const eligibilityByUsername = options.eligibilityByUsername ?? new Map();
  const template = getTournamentTemplateDefinition(tournament);
  const eligibilityRules = template?.eligibilityRules ?? null;
  const registrationLookup = new Set(
    registrations.map((entry) => entry.member_username),
  );
  const scoresByRound = new Map();

  for (const score of scores) {
    if (!scoresByRound.has(score.round_number)) {
      scoresByRound.set(score.round_number, new Map());
    }

    scoresByRound
      .get(score.round_number)
      .set(score.member_username, score.score);
  }

  const persistedMatches = normalizePersistedTournamentMatches(matchRows);
  const persistedMatchesByKey = new Map(
    persistedMatches.map((match) => [
      `${match.roundNumber}:${match.matchNumber}`,
      match,
    ]),
  );
  const roundPlan = parseTournamentRoundPlan(tournament.round_schedule_json);
  const normalizedRegistrations = registrations.map((registration) => {
    const username = registration.member_username;
    const eligibilitySnapshot = eligibilityByUsername.get(username) ?? null;
    const registrationEligibility = evaluateTournamentRegistrationEligibility({
      eligibilityRules,
      snapshot: eligibilitySnapshot,
      tournament,
    });

    return {
      bowCode: registration.bow_code ?? registration.bowCode ?? null,
      username,
      fullName: `${registration.first_name} ${registration.surname}`,
      role: registration.user_type,
      registeredAt: registration.registered_at,
      eligibility: {
        hasCurrentHandicap: eligibilitySnapshot?.hasCurrentHandicap ?? null,
        qualifyingRoundCount: eligibilitySnapshot?.qualifyingRoundCount ?? 0,
        registration: registrationEligibility,
      },
    };
  });
  const bracket = buildTournamentBracket(
    normalizedRegistrations,
    scoresByRound,
    persistedMatchesByKey,
    {
      frozenDrawOrderUsernames: roundPlan.draw?.orderUsernames ?? [],
      supportsHighestLoserProgression:
        template?.capabilities?.supportsHighestLoserProgression ?? false,
    },
  );
  const persistedRounds = normalizePersistedTournamentRounds(roundRows);
  const generatedRoundSchedule =
    roundPlan.automaticConfig
      ? buildAutomaticRoundSchedule({
          automaticConfig: roundPlan.automaticConfig,
          defaultRoundNames: template?.defaults?.defaultRoundNames ?? [],
          totalRounds: bracket.rounds.length,
        })
      : [];
  const roundSchedule =
    roundPlan.automaticConfig
      ? generatedRoundSchedule
      : persistedRounds.length > 0
        ? persistedRounds
        : roundPlan.manualSchedule;
  const today = toUtcDateString(new Date());
  const registrationUpcoming = today < tournament.registration_start_date;
  const registrationOpen =
    today >= tournament.registration_start_date &&
    today <= tournament.registration_end_date;
  const registrationClosed = today > tournament.registration_end_date;
  const drawMetadata = roundPlan.draw;
  const hasManualMatchActivity = persistedMatches.some((match) => {
    const hasParticipants =
      Boolean(match.leftMemberUsername ?? null) || Boolean(match.rightMemberUsername ?? null);

    if (!hasParticipants) {
      return false;
    }

    return (
      Number.isInteger(match.leftScore) ||
      Number.isInteger(match.rightScore) ||
      Boolean(match.submittedByUsername) ||
      Boolean(match.confirmedByUsername) ||
      Boolean(match.disputedByUsername) ||
      Boolean(match.disputeReason) ||
      ["awaiting_opponent_confirmation", "finalised", "walkover", "disqualified", "retired_both"].includes(
        String(match.status ?? "").trim(),
      )
    );
  });
  const currentRoundNumber = bracket.currentRoundNumber;
  const currentRound = bracket.rounds.find(
    (round) => round.roundNumber === currentRoundNumber,
  );
  const currentRoundSchedule =
    roundSchedule.find((round) => round.roundNumber === currentRoundNumber) ?? null;
  const actorEligibilitySnapshot = actorUsername
    ? (eligibilityByUsername.get(actorUsername) ?? null)
    : null;
  const actorRegistrationEligibility = evaluateTournamentRegistrationEligibility({
    eligibilityRules,
    snapshot: actorEligibilitySnapshot,
    tournament,
  });
  const actorCurrentRoundEligibility =
    actorUsername && currentRoundNumber
      ? evaluateTournamentRoundEligibility({
          eligibilityRules,
          roundNumber: currentRoundNumber,
          snapshot: actorEligibilitySnapshot,
          tournament,
        })
      : null;
  const scoreSubmissionOpen = Boolean(
    registrationClosed &&
      currentRoundSchedule?.publishDate &&
      currentRoundSchedule?.submissionDeadline &&
      today >= currentRoundSchedule.publishDate &&
      today <= currentRoundSchedule.submissionDeadline,
  );
  const enrichedBracketRounds = bracket.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match, index) => {
      const matchNumber = index + 1;
      const persistedMatch =
        persistedMatchesByKey.get(`${round.roundNumber}:${matchNumber}`) ?? null;
      const participantsMatchPersistedRecord =
        persistedMatch &&
        (persistedMatch.leftMemberUsername ?? null) ===
          (match.leftParticipant?.username ?? null) &&
        (persistedMatch.rightMemberUsername ?? null) ===
          (match.rightParticipant?.username ?? null);
      const isCurrentRound = round.roundNumber === currentRoundNumber;
      const leftEligibilitySnapshot =
        eligibilityByUsername.get(match.leftParticipant?.username ?? null) ?? null;
      const rightEligibilitySnapshot =
        eligibilityByUsername.get(match.rightParticipant?.username ?? null) ?? null;
      const leftRoundEligibility = match.leftParticipant
        ? evaluateTournamentRoundEligibility({
            eligibilityRules,
            roundNumber: round.roundNumber,
            snapshot: leftEligibilitySnapshot,
            tournament,
          })
        : null;
      const rightRoundEligibility = match.rightParticipant
        ? evaluateTournamentRoundEligibility({
            eligibilityRules,
            roundNumber: round.roundNumber,
            snapshot: rightEligibilitySnapshot,
            tournament,
          })
        : null;
      const defaultStatus =
        match.status === "bye" || match.status === "empty"
          ? match.status
          : isTournamentMatchResolvedStatus(match.status)
            ? "finalised"
            : isCurrentRound && scoreSubmissionOpen
              ? "awaiting_result"
              : "scheduled";
      const progressedStatus =
        currentRoundNumber &&
        round.roundNumber < currentRoundNumber &&
        ["finalised", "walkover", "disqualified"].includes(
          participantsMatchPersistedRecord && persistedMatch?.status
            ? persistedMatch.status
            : defaultStatus,
        )
          ? "progressed"
          : null;

      return {
        ...match,
        id: buildTournamentMatchId(tournament.id, round.roundNumber, matchNumber),
        status:
          progressedStatus ??
          (participantsMatchPersistedRecord && persistedMatch?.status
            ? persistedMatch.status
            : defaultStatus),
        leftScore:
          participantsMatchPersistedRecord &&
          typeof persistedMatch?.leftScore === "number"
            ? persistedMatch.leftScore
            : match.leftScore,
        rightScore:
          participantsMatchPersistedRecord &&
          typeof persistedMatch?.rightScore === "number"
            ? persistedMatch.rightScore
            : match.rightScore,
        winner:
          participantsMatchPersistedRecord && persistedMatch?.winnerUsername
            ? [match.leftParticipant, match.rightParticipant].find(
                (participant) =>
                  participant?.username === persistedMatch.winnerUsername,
              ) ?? match.winner
            : match.winner,
        submittedByUsername:
          participantsMatchPersistedRecord
            ? persistedMatch?.submittedByUsername ?? null
            : null,
        submittedAt:
          participantsMatchPersistedRecord ? persistedMatch?.submittedAt ?? null : null,
        leftEligibility:
          match.leftParticipant || leftEligibilitySnapshot
            ? {
                registration: evaluateTournamentRegistrationEligibility({
                  eligibilityRules,
                  snapshot: leftEligibilitySnapshot,
                  tournament,
                }),
                round: leftRoundEligibility,
              }
            : null,
        rightEligibility:
          match.rightParticipant || rightEligibilitySnapshot
            ? {
                registration: evaluateTournamentRegistrationEligibility({
                  eligibilityRules,
                  snapshot: rightEligibilitySnapshot,
                  tournament,
                }),
                round: rightRoundEligibility,
              }
            : null,
        confirmedByUsername:
          participantsMatchPersistedRecord
            ? persistedMatch?.confirmedByUsername ?? null
            : null,
        confirmedAt:
          participantsMatchPersistedRecord ? persistedMatch?.confirmedAt ?? null : null,
        disputedByUsername:
          participantsMatchPersistedRecord
            ? persistedMatch?.disputedByUsername ?? null
            : null,
        disputedAt:
          participantsMatchPersistedRecord ? persistedMatch?.disputedAt ?? null : null,
        disputeReason:
          participantsMatchPersistedRecord ? persistedMatch?.disputeReason ?? null : null,
      };
    }),
  }));
  const actorMatch =
    enrichedBracketRounds
      .find((round) => round.roundNumber === currentRoundNumber)
      ?.matches.find(
      (match) =>
        match.leftParticipant?.username === actorUsername ||
        match.rightParticipant?.username === actorUsername,
    ) ?? null;
  const actorScore =
    actorUsername && currentRoundNumber
      ? (scoresByRound.get(currentRoundNumber)?.get(actorUsername) ?? null)
      : null;
  const scoreWindowStartDate =
    roundSchedule[0]?.publishDate ??
    roundPlan.automaticConfig?.firstRoundStartDate ??
    tournament.score_submission_start_date;
  const scoreWindowEndDate =
    roundSchedule[roundSchedule.length - 1]?.submissionDeadline ??
    tournament.score_submission_end_date;
  const baseTournamentRecord = {
    id: tournament.id,
    name: tournament.name,
    type: tournament.tournament_type,
    typeLabel: getTournamentTypeLabel(tournament.tournament_type),
    templateKey: template?.key ?? null,
    templateLabel: template?.label ?? null,
    roundOneStartDate:
      roundPlan.automaticConfig?.firstRoundStartDate ??
      roundSchedule[0]?.publishDate ??
      tournament.draw_date ??
      null,
    roundWindowDays: roundPlan.automaticConfig?.roundWindowDays ?? null,
    roundRestDays: roundPlan.automaticConfig?.roundRestDays ?? null,
    roundSchedule,
    draw: {
      canRedraw: Boolean(
        canManageTournamentDraw(template) &&
          registrationClosed &&
          normalizedRegistrations.length > 1 &&
          !hasManualMatchActivity,
      ),
      generatedAt: drawMetadata?.generatedAt ?? null,
      isRandomized: Boolean(drawMetadata?.orderUsernames?.length),
    },
    eligibility: actorUsername
      ? {
          actor: {
            currentRound: actorCurrentRoundEligibility,
            hasCurrentHandicap: actorEligibilitySnapshot?.hasCurrentHandicap ?? null,
            qualifyingRoundCount: actorEligibilitySnapshot?.qualifyingRoundCount ?? 0,
            registration: actorRegistrationEligibility,
          },
        }
      : null,
    registrationWindow: {
      startDate: tournament.registration_start_date,
      endDate: tournament.registration_end_date,
      isUpcoming: registrationUpcoming,
      isOpen: registrationOpen,
      isClosed: registrationClosed,
    },
    scoreWindow: {
      startDate: scoreWindowStartDate,
      endDate: scoreWindowEndDate,
      isOpen: scoreSubmissionOpen,
    },
    createdBy: {
      username: tournament.created_by,
      fullName: `${tournament.created_by_first_name} ${tournament.created_by_surname}`,
    },
    registrations: normalizedRegistrations,
    registrationCount: normalizedRegistrations.length,
    bracket: {
      ...bracket,
      rounds: enrichedBracketRounds,
    },
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
      actorMatch.rightParticipant &&
      actorMatch.status !== "awaiting_opponent_confirmation" &&
      actorMatch.status !== "disputed",
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
      typeof actorScore !== "number" &&
      actorMatch.status !== "awaiting_opponent_confirmation" &&
      actorMatch.status !== "disputed",
    ),
  };

  return {
    ...baseTournamentRecord,
    currentMatch: actorMatch
      ? mapBracketMatchToEngineMatch(
          actorMatch,
          {
            roundNumber: currentRoundNumber,
            title: currentRoundSchedule?.title ?? `Round ${currentRoundNumber}`,
          },
          { ...baseTournamentRecord, template },
          {
            ...baseTournamentRecord.scoreWindow,
            endDate:
              currentRoundSchedule?.submissionDeadline ??
              baseTournamentRecord.scoreWindow?.endDate ??
              null,
          },
          actorUsername,
        )
      : null,
    engine: buildTournamentEngine(enrichedBracketRounds, baseTournamentRecord, actorUsername),
  };
}

function canManageTournamentDraw(template) {
  return template?.capabilities?.supportsRandomizedDraw ?? false;
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

function sanitizeEquipmentDetailText(value, maxLength = 60) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function sanitizeInchMeasurement(value, maxLength = 20) {
  const sanitized = sanitizeEquipmentDetailText(value, maxLength);

  if (!sanitized) {
    return "";
  }

  return sanitized
    .replace(/\s*(?:inches|inch|in)\s*$/i, "")
    .replace(/"+$/g, "")
    .trim();
}

function sanitizeEquipmentDetailOption(value, allowedValues) {
  return allowedValues.includes(value) ? value : "";
}

function sanitizeEquipmentSharedOption(value, allowedValues) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return allowedValues.has(trimmed) ? trimmed : "";
}

function sanitizeEquipmentDetails(payload, equipmentType) {
  switch (equipmentType) {
    case EQUIPMENT_TYPES.RISER:
      return {
        makeModel: sanitizeEquipmentDetailText(payload?.makeModel, 80),
        length: sanitizeInchMeasurement(payload?.equipmentLength, 20),
        handedness: sanitizeEquipmentDetailOption(payload?.handedness, ["left", "right"]),
        colour: sanitizeEquipmentDetailText(payload?.colour, 40),
      };
    case EQUIPMENT_TYPES.LIMB:
      return {
        makeModel: sanitizeEquipmentDetailText(payload?.makeModel, 80),
        length: sanitizeEquipmentDetailOption(payload?.equipmentLength, ["XS", "S", "M", "L"]),
        poundage: sanitizeEquipmentDetailText(payload?.poundage, 20),
      };
    case EQUIPMENT_TYPES.QUIVER:
      return {
        handedness: sanitizeEquipmentDetailOption(payload?.handedness, [
          "left",
          "right",
          "ambidextrous",
        ]),
      };
    case EQUIPMENT_TYPES.ARM_GUARD:
      return {
        length: sanitizeEquipmentDetailOption(payload?.equipmentLength, [
          "short",
          "long",
          "extra-long",
        ]),
      };
    case EQUIPMENT_TYPES.FINGER_TAB:
    case EQUIPMENT_TYPES.CHEST_GUARD:
      return {
        fitSize: sanitizeEquipmentDetailOption(payload?.fitSize, ["XS", "S", "M", "L", "XL"]),
        handedness: sanitizeEquipmentDetailOption(payload?.handedness, [
          "left",
          "right",
          "ambidextrous",
        ]),
      };
    case EQUIPMENT_TYPES.ARROWS:
      return {
        arrowMaterial: sanitizeEquipmentSharedOption(
          payload?.arrowMaterial,
          ARROW_MATERIAL_OPTION_SET,
        ),
        arrowColour: sanitizeEquipmentSharedOption(
          payload?.arrowColour,
          ARROW_COLOUR_VALUE_SET,
        ),
        arrowIdentifier: sanitizeEquipmentDetailText(payload?.arrowIdentifier, 64),
        fletchingColour1: sanitizeEquipmentSharedOption(
          payload?.fletchingColour1,
          ARROW_FLETCHING_COLOUR_VALUE_SET,
        ),
        fletchingColour2: sanitizeEquipmentSharedOption(
          payload?.fletchingColour2,
          ARROW_FLETCHING_COLOUR_VALUE_SET,
        ),
        fletchingColour3: sanitizeEquipmentSharedOption(
          payload?.fletchingColour3,
          ARROW_FLETCHING_COLOUR_VALUE_SET,
        ),
        nockColour: sanitizeEquipmentSharedOption(
          payload?.nockColour,
          ARROW_NOCK_COLOUR_VALUE_SET,
        ),
        spine: sanitizeEquipmentDetailText(payload?.arrowSpine, 20),
      };
    default:
      return {};
  }
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
  const details = parseEquipmentDetails(item.details_json);

  if (item.equipment_type === EQUIPMENT_TYPES.CASE) {
    const caseSize = item.size_category === "junior" ? "Compound" : "Recurve";
    return `${caseSize} ${typeLabel} ${item.item_number || ""}`.trim();
  }

  if (item.equipment_type === EQUIPMENT_TYPES.QUIVER) {
    const quiverGroup = item.size_category === "junior" ? "Junior" : "Adult";
    return `${quiverGroup} ${typeLabel} ${item.item_number || ""}`.trim();
  }

  if (item.equipment_type === EQUIPMENT_TYPES.LONG_ROD) {
    const rodLength = item.size_category === "junior" ? "Long" : "Short";
    return `${rodLength} ${typeLabel} ${item.item_number || ""}`.trim();
  }

  if (item.equipment_type === EQUIPMENT_TYPES.ARROWS) {
    const arrowParts = [`${item.arrow_quantity} x ${item.arrow_length}"`, typeLabel];
    if (details.spine) {
      arrowParts.push(`Spine ${details.spine}`);
    }
    return arrowParts.join(" ");
  }

  if (item.item_number) {
    return `${typeLabel} ${item.item_number}`.trim();
  }

  return `${typeLabel}`.trim();
}

function parseEquipmentDetails(detailsJson) {
  if (typeof detailsJson !== "string" || !detailsJson.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(detailsJson);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildArrowFletchingSummary(details) {
  const fletchingColours = [
    details.fletchingColour1,
    details.fletchingColour2,
    details.fletchingColour3,
  ].filter(Boolean);

  if (fletchingColours.length > 0) {
    return `Fletch ${fletchingColours.join("/")}`;
  }

  if (details.fletchingColour) {
    return `Fletch ${details.fletchingColour}`;
  }

  return "";
}

function buildEquipmentDetailSummary(item, details) {
  switch (item.equipment_type) {
    case EQUIPMENT_TYPES.RISER:
      return [
        details.makeModel,
        details.length ? `${sanitizeInchMeasurement(details.length, 20)}"` : "",
        details.handedness ? `${details.handedness}-handed` : "",
        details.colour ? `${details.colour} finish` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    case EQUIPMENT_TYPES.LIMB:
      return [
        details.makeModel,
        details.length || "",
        details.poundage ? `${details.poundage} lb` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    case EQUIPMENT_TYPES.QUIVER:
      return [details.handedness].filter(Boolean).join(" | ");
    case EQUIPMENT_TYPES.ARM_GUARD:
      return [details.length].filter(Boolean).join(" | ");
    case EQUIPMENT_TYPES.FINGER_TAB:
    case EQUIPMENT_TYPES.CHEST_GUARD:
      return [details.fitSize, details.handedness].filter(Boolean).join(" | ");
    case EQUIPMENT_TYPES.ARROWS:
      return [
        details.arrowMaterial,
        details.arrowColour,
        details.arrowIdentifier ? `marked ${details.arrowIdentifier}` : "",
        buildArrowFletchingSummary(details),
        details.nockColour ? `Nock ${details.nockColour}` : "",
        details.spine ? `Spine ${details.spine}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    default:
      return "";
  }
}

function buildEquipmentIdentity(item) {
  const details = parseEquipmentDetails(item.details_json);

  return {
    id: item.id,
    type: item.equipment_type,
    typeLabel: EQUIPMENT_TYPE_LABELS[item.equipment_type] ?? item.equipment_type,
    label: buildEquipmentDisplayLabel(item),
    number: item.item_number ?? "",
    sizeCategory: item.size_category,
    arrowLength: item.arrow_length ?? null,
    arrowQuantity: item.arrow_quantity ?? null,
    details,
    detailSummary: buildEquipmentDetailSummary(item, details),
    status: item.status,
  };
}

async function buildEquipmentMaps() {
  const [items, loans, allParticipants, allCourses] = await Promise.all([
    equipmentGateway.listEquipmentItems(),
    equipmentGateway.listEquipmentLoans(),
    beginnersCourseReadGateway.listParticipants(),
    beginnersCourseReadGateway.listCourses(),
  ]);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const contentsByCaseId = new Map();
  const openLoanByItemId = new Map();
  const caseReservationByCaseId = buildCaseReservationMap(allParticipants, allCourses);

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
    caseReservationByCaseId,
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
  const currentReservation = maps.caseReservationByCaseId.get(item.id) ?? null;
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
    currentReservation,
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
  const details = sanitizeEquipmentDetails(payload, equipmentType);

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

  return {
    success: true,
    value: {
      equipmentType,
      itemNumber: itemNumber || null,
      sizeCategory,
      arrowLength: equipmentType === EQUIPMENT_TYPES.ARROWS ? arrowLength : null,
      arrowQuantity: equipmentType === EQUIPMENT_TYPES.ARROWS ? arrowQuantity : 1,
      detailsJson: JSON.stringify(details),
    },
  };
}

function sanitizeEquipmentCorrectionPayload(payload, existingItem) {
  return sanitizeEquipmentCreatePayload({
    ...payload,
    equipmentType: existingItem?.equipment_type,
  });
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

const [handicapTablesUpdatedAtDate, handicapTablesUpdatedAtTime] = getUtcTimestampParts();
await handicapTableGateway.syncSourceTables({
  updatedAtDate: handicapTablesUpdatedAtDate,
  updatedAtTime: handicapTablesUpdatedAtTime,
  updatedByUsername: null,
});

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
  if (!user || !participant) {
    return true;
  }

  const normalizedRole = String(user.user_type ?? "").trim().toLowerCase();

  if (!LEGACY_NON_MEMBER_ROLE_KEYS.has(normalizedRole)) {
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
  announcementGateway,
  app,
  auditChangeLogger,
  buildGuestUserProfile,
  buildMemberUserProfile,
  getDeactivatedRfidTag,
  getSessionUsername,
  getUtcTimestampParts,
  hashPassword,
  memberAuthGateway,
  rfidReaderStatus,
  serverEventBus,
  syncMemberStatusWithFees: (...args) =>
    memberPersistenceService.syncMemberStatusWithFees(...args),
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
  auditChangeLogger,
  buildCommitteeRole,
  buildEditableMemberProfile,
  buildLoanBowRecord,
  buildMemberUserProfile,
  buildUniqueRoleKeyFromTitle,
  CURRENT_PERMISSION_KEY_SET,
  DISTANCE_SIGN_OFF_YARDS,
  goldenRecordsCurrentHandicapService,
  goldenRecordsIntegrationService,
  goldenRecordsMemberSyncService,
  getActorUser,
  getUtcTimestampParts,
  getPermissionsForRole,
  listAssignableRoleKeys,
  listProfilePageMembers,
  memberDirectoryGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
  PERMISSIONS,
  refreshRoleAccessSnapshot,
  roleCommitteeGateway,
  sanitizeLoanBow,
  sanitizeLoanBowReturn,
  saveLoanBowRecord,
  saveMemberProfile: (...args) => memberPersistenceService.saveMemberProfile(...args),
  serverEventBus,
  TOURNAMENT_TYPE_OPTIONS,
  verifyPassword,
});

registerEquipmentRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
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
  sanitizeEquipmentCorrectionPayload,
  sanitizeEquipmentCreatePayload,
  serverEventBus,
  validateCaseAssignment,
});

registerAnnouncementRoutes({
  actorHasPermission,
  announcementGateway,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  serverEventBus,
  toUtcDateString,
});
registerSuggestionRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  suggestionGateway,
});
registerMemberQuestionRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  memberQuestionGateway,
  PERMISSIONS,
  roleCommitteeGateway,
  serverEventBus,
});
registerCommitteeMinutesRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  committeeMinutesGateway,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  roleCommitteeGateway,
  serverEventBus,
});
registerAuditRoutes({
  actorHasPermission,
  app,
  auditLogGateway,
  getActorUser,
  PERMISSIONS,
});
registerRangeRulesRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  rangeRulesGateway,
  serverEventBus,
});
registerGeneralInfoRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  generalInfoGateway,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  serverEventBus,
});
registerHandicapTableRoutes({
  actorHasPermission,
  app,
  getActorUser,
  getUtcTimestampParts,
  handicapTableGateway,
  PERMISSIONS,
});

registerSseRoutes({
  app,
  getActorUser,
  getPermissionsForRole,
  publicServerEventBus,
  serverEventBus,
});
registerLostArrowRoutes({
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  lostArrowGateway,
  memberAuthGateway,
  serverEventBus,
});
registerOutdoorTableRoutes({
  app,
  actorHasPermission,
  auditChangeLogger,
  goldenRecordsSyncGateway,
  getActorUser,
  getUtcTimestampParts,
  memberAuthGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
  PERMISSIONS,
  serverEventBus,
});

function broadcastCalendarUpdated(scope = "calendar") {
  serverEventBus.broadcastToAll("calendar.updated", {
    changedAt: new Date().toISOString(),
    scope,
  });
}

function broadcastApprovalsUpdated(scope = "approvals") {
  serverEventBus.broadcastToAnyPermission([
    PERMISSIONS.APPROVE_EVENTS,
    PERMISSIONS.APPROVE_COACHING_SESSIONS,
    PERMISSIONS.APPROVE_BEGINNERS_COURSES,
    PERMISSIONS.APPROVE_HAVE_A_GO_SESSIONS,
  ], "approvals.updated", {
    changedAt: new Date().toISOString(),
    scope,
  });
}

function broadcastBeginnersUpdated(courseType = "beginners", scope = "beginners") {
  serverEventBus.broadcastToAll("beginners.updated", {
    changedAt: new Date().toISOString(),
    courseType,
    scope,
  });
}

function broadcastMembersUpdated(scope = "members", username = null) {
  const payload = {
    changedAt: new Date().toISOString(),
    scope,
    username,
  };

  serverEventBus.broadcastToAnyPermission([
    PERMISSIONS.MANAGE_MEMBERS,
    PERMISSIONS.SIGN_OFF_DISTANCES,
    PERMISSIONS.MANAGE_COMMITTEE_ROLES,
    "manage_loan_bows",
  ], "members.updated", payload);

  if (username) {
    serverEventBus.broadcastToUsers([username], "members.updated", payload);
  }
}

function broadcastEquipmentUpdated(scope = "equipment") {
  serverEventBus.broadcastToAnyPermission([
    PERMISSIONS.ADD_DECOMMISSION_EQUIPMENT,
    PERMISSIONS.ASSIGN_EQUIPMENT,
    PERMISSIONS.RETURN_EQUIPMENT,
    PERMISSIONS.UPDATE_EQUIPMENT_STORAGE,
    PERMISSIONS.MANAGE_EQUIPMENT_STORAGE_LOCATIONS,
  ], "equipment.updated", {
    changedAt: new Date().toISOString(),
    scope,
  });
}

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
    .filter(
      (user) =>
        !LEGACY_NON_MEMBER_ROLE_KEYS.has(
          String(user.user_type ?? "").trim().toLowerCase(),
        ),
    )
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
      reservedParticipantUsername:
        caseItem.currentReservation?.participantUsername ?? "",
      reservedParticipantName:
        caseItem.currentReservation?.participantName ?? "",
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

  const actorUsername = await resolveCanonicalUsername(actor.username);
  const [date, time] = getUtcTimestampParts();
  const courseId = await beginnersCourseWriteGateway.createCourseWithLessons({
    actorUsername,
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
  const createdCourse = await findBeginnersCourseAuditSnapshot(courseId, courseType);

  if (auditChangeLogger && createdCourse) {
    void auditChangeLogger.recordEntityChange({
      action: "created",
      actorUsername,
      after: createdCourse,
      before: null,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(courseId),
      entityLabel: buildBeginnersCourseAuditLabel(createdCourse),
      entityType: "beginners_course",
      req,
      statusCode: 201,
      target: `/api/beginners-courses/${courseId}`,
    }).catch((auditError) => {
      console.error("Failed to record beginners course audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.create");
  broadcastApprovalsUpdated("beginners.create");
  broadcastCalendarUpdated("beginners.create");

  res.status(201).json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (course) => course.id === courseId,
      ) ?? null,
  });
});

app.post("/api/beginners-courses/:id/reschedule", async (req, res) => {
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

  if (!actorHasPermission(actor, coursePermissions.manage)) {
    res.status(403).json({
      success: false,
      message:
        courseType === "taster-session"
          ? "You do not have permission to reschedule Taster Sessions."
          : "You do not have permission to reschedule beginners courses.",
    });
    return;
  }

  if (courseType === "have-a-go") {
    res.status(400).json({
      success: false,
      message: "Have a Go sessions cannot be rescheduled from this screen.",
    });
    return;
  }

  if (course.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "Cancelled sessions cannot be rescheduled.",
    });
    return;
  }

  if (hasScheduleEntryStarted(course.first_lesson_date, course.start_time)) {
    res.status(400).json({
      success: false,
      message: "Only future sessions can be rescheduled.",
    });
    return;
  }

  const sanitized = sanitizeBeginnersCourseReschedulePayload(req.body);

  if (!sanitized.success) {
    res.status(sanitized.status).json(sanitized);
    return;
  }

  const sameDayMove = course.first_lesson_date === sanitized.value.firstLessonDate;
  const nextApprovalStatus = sameDayMove ? (course.approval_status ?? "pending") : "pending";
  const actorUsername = await resolveCanonicalUsername(actor.username);
  const [changedAtDate, changedAtTime] = getUtcTimestampParts();
  const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

  await beginnersCourseWriteGateway.rescheduleCourse({
    approvalStatus: nextApprovalStatus,
    approvedAtDate: sameDayMove ? course.approved_at_date ?? null : null,
    approvedAtTime: sameDayMove ? course.approved_at_time ?? null : null,
    approvedByUsername: sameDayMove ? course.approved_by_username ?? null : null,
    courseId: course.id,
    endTime: sanitized.value.endTime,
    firstLessonDate: sanitized.value.firstLessonDate,
    lessonDates: buildBeginnersLessonDates(
      sanitized.value.firstLessonDate,
      course.lesson_count,
    ),
    rejectionReason: null,
    startTime: sanitized.value.startTime,
  });

  const updatedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

  if (auditChangeLogger && updatedCourse) {
    void auditChangeLogger.recordEntityChange({
      action: "rescheduled",
      actorUsername,
      after: updatedCourse,
      before: previousCourse,
      changedAtDate,
      changedAtTime,
      entityId: String(course.id),
      entityLabel: buildBeginnersCourseAuditLabel(updatedCourse),
      entityType: "beginners_course",
      req,
      target: `/api/beginners-courses/${course.id}/reschedule`,
    }).catch((auditError) => {
      console.error("Failed to record beginners course reschedule audit event", auditError);
    });
  }

  if (sameDayMove && updatedCourse) {
    serverEventBus.broadcastToAnyPermission(
      [coursePermissions.approve],
      "beginners.rescheduled",
      buildBeginnersRescheduleNotification(updatedCourse),
    );
  }

  broadcastBeginnersUpdated(courseType, "beginners.reschedule");
  broadcastCalendarUpdated("beginners.reschedule");
  if (!sameDayMove) {
    broadcastApprovalsUpdated("beginners.reschedule");
  }

  res.json({
    success: true,
    approvalReset: !sameDayMove,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === course.id,
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

  const actorUsername = await resolveCanonicalUsername(actor.username);
  const [date, time] = getUtcTimestampParts();
  const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
  await beginnersCourseWriteGateway.reviewCourse({
    approvalStatus: "approved",
    approvedAtDate: date,
    approvedAtTime: time,
    approvedByUsername: actorUsername,
    courseId: course.id,
    rejectionReason: null,
  });
  const approvedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

  if (auditChangeLogger && approvedCourse) {
    void auditChangeLogger.recordEntityChange({
      action: "approved",
      actorUsername,
      after: approvedCourse,
      before: previousCourse,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(course.id),
      entityLabel: buildBeginnersCourseAuditLabel(approvedCourse),
      entityType: "beginners_course",
      req,
      target: `/api/beginners-courses/${course.id}/approve`,
    }).catch((auditError) => {
      console.error("Failed to record beginners course audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.approve");
  broadcastApprovalsUpdated("beginners.approve");
  broadcastCalendarUpdated("beginners.approve");

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

  const actorUsername = await resolveCanonicalUsername(actor.username);
  const [date, time] = getUtcTimestampParts();
  const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
  await beginnersCourseWriteGateway.reviewCourse({
    approvalStatus: "rejected",
    approvedAtDate: date,
    approvedAtTime: time,
    approvedByUsername: actorUsername,
    courseId: course.id,
    rejectionReason,
  });
  const rejectedCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

  if (auditChangeLogger && rejectedCourse) {
    void auditChangeLogger.recordEntityChange({
      action: "rejected",
      actorUsername,
      after: rejectedCourse,
      before: previousCourse,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(course.id),
      entityLabel: buildBeginnersCourseAuditLabel(rejectedCourse),
      entityType: "beginners_course",
      req,
      target: `/api/beginners-courses/${course.id}/reject`,
    }).catch((auditError) => {
      console.error("Failed to record beginners course audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.reject");
  broadcastApprovalsUpdated("beginners.reject");
  broadcastCalendarUpdated("beginners.reject");

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
    String(actor.username ?? "").localeCompare(
      String(course.coordinator_username ?? ""),
      undefined,
      { sensitivity: "accent" },
    ) === 0;

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

  const actorUsername = await resolveCanonicalUsername(actor.username);
  const [date, time] = getUtcTimestampParts();
  const previousCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);
  await beginnersCourseWriteGateway.cancelCourse({
    actorUsername,
    cancelledAtDate: date,
    cancelledAtTime: time,
    courseId: course.id,
    reason: cancellationReason,
  });
  const cancelledCourse = await findBeginnersCourseAuditSnapshot(course.id, courseType);

  if (auditChangeLogger && cancelledCourse) {
    void auditChangeLogger.recordEntityChange({
      action: "cancelled",
      actorUsername,
      after: cancelledCourse,
      before: previousCourse,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(course.id),
      entityLabel: buildBeginnersCourseAuditLabel(cancelledCourse),
      entityType: "beginners_course",
      req,
      target: `/api/beginners-courses/${course.id}`,
    }).catch((auditError) => {
      console.error("Failed to record beginners course audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.cancel");
  broadcastApprovalsUpdated("beginners.cancel");
  broadcastCalendarUpdated("beginners.cancel");

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
  const userResult = await memberPersistenceService.saveMemberProfile({
    username,
    firstName: sanitized.value.firstName,
    surname: sanitized.value.surname,
    archeryGbMembershipNumber: "",
    password,
    rfidTag: "",
    activeMember: true,
    affiliateMember: false,
    juniorMember: false,
    membershipFeesDue: "",
    coachingVolunteer: false,
    userType: getCourseParticipantUserType(courseType),
    membershipStatus: getCourseParticipantMembershipStatus(),
    programmeType: getCourseParticipantProgrammeType(courseType),
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
    originCourseType: courseType,
    participant: sanitized.value,
    username,
  });
  const createdParticipant = await beginnersCourseReadGateway.findParticipantByUsername(username);
  const createdParticipantSnapshot = createdParticipant
    ? await findBeginnersParticipantAuditSnapshot(createdParticipant.id, courseType)
    : null;

  if (auditChangeLogger && createdParticipantSnapshot) {
    void auditChangeLogger.recordEntityChange({
      action: "created",
      actorUsername: actor.username,
      after: createdParticipantSnapshot,
      before: null,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(createdParticipant.id),
      entityLabel: buildBeginnersParticipantAuditLabel(createdParticipantSnapshot),
      entityType: "beginners_participant",
      req,
      statusCode: 201,
      target: `/api/beginners-course-participants/${createdParticipant.id}`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.participant-create");
  broadcastMembersUpdated("beginners.participant-create", username);

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
  const [resetAtDate, resetAtTime] = getUtcTimestampParts();
  await beginnersCourseWriteGateway.resetParticipantPassword({
    passwordHash: hashPassword(password),
    username: participant.username,
  });

  if (auditChangeLogger) {
    void auditChangeLogger.recordEntityChange({
      action: "password_reset",
      actorUsername: actor.username,
      after: {
        passwordReset: true,
        username: participant.username,
      },
      before: {
        passwordReset: false,
        username: participant.username,
      },
      changedAtDate: resetAtDate,
      changedAtTime: resetAtTime,
      entityId: String(participant.id),
      entityLabel: `${participant.first_name} ${participant.surname}`.trim(),
      entityType: "beginners_participant_credentials",
      req,
      target: `/api/beginners-course-participants/${participant.id}/reset-password`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.password-reset");
  broadcastMembersUpdated("beginners.password-reset", participant.username);

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
  const previousParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );

  await beginnersCourseWriteGateway.updateParticipant({
    existingUser,
    participant: sanitized.value,
    participantId: participant.id,
  });
  const updatedParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );
  const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

  if (auditChangeLogger && updatedParticipant) {
    void auditChangeLogger.recordEntityChange({
      action: "updated",
      actorUsername: actor.username,
      after: updatedParticipant,
      before: previousParticipant,
      changedAtDate: updatedAtDate,
      changedAtTime: updatedAtTime,
      entityId: String(participant.id),
      entityLabel: buildBeginnersParticipantAuditLabel(updatedParticipant),
      entityType: "beginners_participant",
      req,
      target: `/api/beginners-course-participants/${participant.id}`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.participant-update");
  broadcastMembersUpdated("beginners.participant-update", participant.username);

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === participant.course_id,
      ) ?? null,
  });
});

app.delete("/api/beginners-course-participants/:id", async (req, res) => {
  const actor = getActorUser(req);
  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Participant record not found.",
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
        courseType === "taster-session"
          ? "You do not have permission to remove Taster Session attendees."
          : "You do not have permission to remove beginners.",
    });
    return;
  }

  if (courseType === "have-a-go") {
    res.status(400).json({
      success: false,
      message: "Have a Go participants cannot be removed from this screen.",
    });
    return;
  }

  if (participant.converted_to_member) {
    res.status(400).json({
      success: false,
      message: "Converted beginners cannot be removed from the course register.",
    });
    return;
  }

  const existingUser = await memberDirectoryGateway.findUserByUsername(participant.username);
  const previousParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );

  if (existingUser) {
    const saveResult = await memberPersistenceService.saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
      emailAddress: existingUser.email_address ?? "",
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag ?? "",
      activeMember: false,
      affiliateMember: Boolean(existingUser.affiliate_member),
      juniorMember: Boolean(existingUser.junior_member),
      membershipFeesDue: existingUser.membership_fees_due ?? "",
      coachingVolunteer: Boolean(existingUser.coaching_volunteer),
      userType: existingUser.user_type,
      membershipStatus: existingUser.membership_status,
      programmeType: existingUser.programme_type,
      disciplines: await memberDirectoryGateway.findDisciplinesByUsername(existingUser.username),
      loanBow: buildLoanBowRecord(
        await memberDirectoryGateway.findLoanBowByUsername(existingUser.username),
      ),
      existingUser,
    });

    if (!saveResult.success) {
      res.status(saveResult.status).json(saveResult);
      return;
    }
  }

  await beginnersCourseWriteGateway.deleteParticipant(participant.id);

  const [removedAtDate, removedAtTime] = getUtcTimestampParts();
  if (auditChangeLogger) {
    void auditChangeLogger.recordEntityChange({
      action: "removed",
      actorUsername: actor.username,
      after: null,
      before: previousParticipant,
      changedAtDate: removedAtDate,
      changedAtTime: removedAtTime,
      entityId: String(participant.id),
      entityLabel: `${participant.first_name} ${participant.surname}`.trim(),
      entityType: "beginners_participant",
      req,
      target: `/api/beginners-course-participants/${participant.id}`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant removal audit event", auditError);
    });
  }

  broadcastBeginnersUpdated(courseType, "beginners.participant-delete");
  broadcastMembersUpdated("beginners.participant-delete", participant.username);

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard(courseType)).find(
        (entry) => entry.id === participant.course_id,
      ) ?? null,
  });
});

app.post("/api/beginners-course-participants/:id/transfer-to-beginners-course", async (req, res) => {
  const actor = getActorUser(req);

  const participant = await beginnersCourseReadGateway.findParticipantById(req.params.id);

  if (!participant) {
    res.status(404).json({
      success: false,
      message: "Participant record not found.",
    });
    return;
  }

  const sourceCourse = await beginnersCourseReadGateway.findCourseById(participant.course_id);
  const sourceCourseType = normalizeCourseType(sourceCourse?.course_type);

  if (!actor || !actorHasPermission(actor, getCourseTypePermissions(sourceCourseType).manage)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to transfer taster participants.",
    });
    return;
  }

  if (sourceCourseType !== "taster-session") {
    res.status(400).json({
      success: false,
      message: "Only Taster Session participants can be transferred to a beginners course.",
    });
    return;
  }

  const targetCourseId = Number.parseInt(String(req.body?.targetCourseId ?? ""), 10);
  if (!Number.isInteger(targetCourseId)) {
    res.status(400).json({
      success: false,
      message: "Choose a beginners course to transfer this participant onto.",
    });
    return;
  }

  const targetCourse = await beginnersCourseReadGateway.findCourseById(targetCourseId);
  const targetCourseType = normalizeCourseType(targetCourse?.course_type);

  if (!targetCourse || targetCourseType !== "beginners") {
    res.status(404).json({
      success: false,
      message: "Beginners course not found.",
    });
    return;
  }

  if (targetCourse.is_cancelled) {
    res.status(400).json({
      success: false,
      message: "Cancelled beginners courses cannot accept transfers.",
    });
    return;
  }

  if (targetCourse.approval_status !== "approved") {
    res.status(400).json({
      success: false,
      message: "Approve the beginners course before transferring participants onto it.",
    });
    return;
  }

  if (hasScheduleEntryStarted(targetCourse.first_lesson_date, targetCourse.start_time)) {
    res.status(400).json({
      success: false,
      message:
        "Only future beginners courses can accept transfers from a Taster Session.",
    });
    return;
  }

  if (
    (await beginnersCourseReadGateway.listParticipantsByCourseId(targetCourse.id)).length >=
    targetCourse.beginner_capacity
  ) {
    res.status(400).json({
      success: false,
      message: "This beginners course is already full.",
    });
    return;
  }

  const existingUser = await memberDirectoryGateway.findUserByUsername(participant.username);
  if (!existingUser) {
    res.status(404).json({
      success: false,
      message: "The participant account could not be found.",
    });
    return;
  }

  const previousParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    sourceCourseType,
  );
  const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();

  const saveUserResult = await memberPersistenceService.saveMemberProfile({
    username: existingUser.username,
    firstName: existingUser.first_name,
    surname: existingUser.surname,
    archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
    emailAddress: existingUser.email_address ?? "",
    password: null,
    rfidTag: existingUser.rfid_tag ?? "",
    activeMember: Boolean(existingUser.active_member),
    affiliateMember: Boolean(existingUser.affiliate_member),
    juniorMember: Boolean(existingUser.junior_member),
    membershipFeesDue: existingUser.membership_fees_due ?? "",
    coachingVolunteer: Boolean(existingUser.coaching_volunteer),
    userType: getCourseParticipantUserType("beginners"),
    membershipStatus: getCourseParticipantMembershipStatus(),
    programmeType: getCourseParticipantProgrammeType("beginners"),
    disciplines: (
      await memberDirectoryGateway.findDisciplinesByUsername(existingUser.username)
    ).map((entry) => entry.discipline),
    loanBow: buildLoanBowRecord(
      await memberDirectoryGateway.findLoanBowByUsername(existingUser.username),
    ),
    existingUser,
  });

  if (!saveUserResult.success) {
    res.status(saveUserResult.status).json(saveUserResult);
    return;
  }

  await beginnersCourseWriteGateway.transferParticipantToCourse({
    courseId: targetCourse.id,
    participantId: participant.id,
  });

  const transferredParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    "beginners",
  );

  if (auditChangeLogger && transferredParticipant) {
    void auditChangeLogger.recordEntityChange({
      action: "updated",
      actorUsername: actor.username,
      after: transferredParticipant,
      before: previousParticipant,
      changedAtDate: updatedAtDate,
      changedAtTime: updatedAtTime,
      entityId: String(participant.id),
      entityLabel: buildBeginnersParticipantAuditLabel(transferredParticipant),
      entityType: "beginners_participant",
      req,
      target: `/api/beginners-course-participants/${participant.id}/transfer-to-beginners-course`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant transfer audit event", auditError);
    });
  }

  broadcastBeginnersUpdated(sourceCourseType, "beginners.participant-transfer");
  broadcastBeginnersUpdated("beginners", "beginners.participant-transfer");
  broadcastMembersUpdated("beginners.participant-transfer", participant.username);

  res.json({
    success: true,
    course:
      (await buildBeginnersCourseDashboard("beginners")).find(
        (entry) => entry.id === targetCourse.id,
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

  if (
    LEGACY_NON_MEMBER_ROLE_KEYS.has(
      String(existingUser.user_type ?? "").trim().toLowerCase(),
    )
  ) {
    const conversionResult = await memberPersistenceService.saveMemberProfile({
      username: existingUser.username,
      firstName: existingUser.first_name,
      surname: existingUser.surname,
      archeryGbMembershipNumber: existingUser.archery_gb_membership_number ?? "",
      password: existingUser.password,
      rfidTag: existingUser.rfid_tag ?? "",
      activeMember: Boolean(existingUser.active_member),
      affiliateMember: Boolean(existingUser.affiliate_member),
      juniorMember: Boolean(existingUser.junior_member),
      membershipFeesDue: existingUser.membership_fees_due ?? "",
      coachingVolunteer: Boolean(existingUser.coaching_volunteer),
      userType: "general",
      membershipStatus: "member",
      programmeType: "none",
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

  const courseType = normalizeCourseType(course.course_type);
  const previousParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );
  const [convertedAtDate, convertedAtTime] = getUtcTimestampParts();

  try {
    if (participant.assigned_case_id) {
      const caseItem = await equipmentGateway.findEquipmentItemById(
        participant.assigned_case_id,
      );

      if (!caseItem || caseItem.equipment_type !== EQUIPMENT_TYPES.CASE) {
        res.status(400).json({
          success: false,
          message: "The assigned case could not be found.",
        });
        return;
      }

      if (caseItem.status !== "active") {
        res.status(400).json({
          success: false,
          message: "The assigned case is not active.",
        });
        return;
      }

      if (
        caseItem.location_type === EQUIPMENT_LOCATION_TYPES.MEMBER &&
        caseItem.location_member_username &&
        caseItem.location_member_username !== existingUser.username
      ) {
        res.status(400).json({
          success: false,
          message: "The assigned case is already with another member.",
        });
        return;
      }

      if (await equipmentGateway.findOpenEquipmentLoanByItemId(caseItem.id)) {
        res.status(400).json({
          success: false,
          message: "The assigned case is already on loan.",
        });
        return;
      }

      const caseContents = await equipmentGateway.listEquipmentItemsByCaseId(caseItem.id);

      for (const content of caseContents) {
        if (await equipmentGateway.findOpenEquipmentLoanByItemId(content.id)) {
          res.status(400).json({
            success: false,
            message: "The assigned case contains equipment that is already on loan.",
          });
          return;
        }
      }

      await equipmentGateway.createEquipmentLoan(
        caseItem.id,
        existingUser.username,
        actor.username,
        convertedAtDate,
        convertedAtTime,
        null,
      );
      await equipmentGateway.updateEquipmentItemStorage({
        id: caseItem.id,
        locationType: EQUIPMENT_LOCATION_TYPES.MEMBER,
        locationLabel: null,
        locationCaseId: null,
        locationMemberUsername: existingUser.username,
        storageByUsername: actor.username,
        storageAtDate: convertedAtDate,
        storageAtTime: convertedAtTime,
      });
      await equipmentGateway.updateEquipmentAssignmentMetadata({
        id: caseItem.id,
        assignedByUsername: actor.username,
        assignedAtDate: convertedAtDate,
        assignedAtTime: convertedAtTime,
      });

      for (const content of caseContents) {
        await equipmentGateway.createEquipmentLoan(
          content.id,
          existingUser.username,
          actor.username,
          convertedAtDate,
          convertedAtTime,
          caseItem.id,
        );
        await equipmentGateway.updateEquipmentAssignmentMetadata({
          id: content.id,
          assignedByUsername: actor.username,
          assignedAtDate: convertedAtDate,
          assignedAtTime: convertedAtTime,
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to convert the beginner with the assigned case.",
    });
    return;
  }

  await beginnersCourseWriteGateway.markParticipantConverted({
    actorUsername: actor.username,
    convertedAtDate,
    convertedAtTime,
    participantId: participant.id,
  });
  const convertedParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );

  if (auditChangeLogger && convertedParticipant) {
    void auditChangeLogger.recordEntityChange({
      action: "converted",
      actorUsername: actor.username,
      after: convertedParticipant,
      before: previousParticipant,
      changedAtDate: convertedAtDate,
      changedAtTime: convertedAtTime,
      entityId: String(participant.id),
      entityLabel: buildBeginnersParticipantAuditLabel(convertedParticipant),
      entityType: "beginners_participant",
      req,
      target: `/api/beginners-course-participants/${participant.id}/convert`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.participant-convert");
  broadcastMembersUpdated("beginners.participant-convert", participant.username);

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
  const nextCase = nextCaseId
    ? await equipmentGateway.findEquipmentItemById(nextCaseId)
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
      await equipmentGateway.findOpenEquipmentLoanByItemId(nextCase.id) &&
      nextCase.location_member_username !== participant.username
    ) {
      res.status(400).json({
        success: false,
        message: "That case is already on loan.",
      });
      return;
    }
  }

  const previousParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );
  try {
    if (nextCase) {
      await equipmentGateway.updateEquipmentAssignmentMetadata({
        id: nextCase.id,
        assignedByUsername: actor.username,
        assignedAtDate: date,
        assignedAtTime: time,
      });
    }

    await beginnersCourseWriteGateway.updateParticipantCase({
      actorUsername: actor.username,
      assignedAtDate: date,
      assignedAtTime: time,
      assignedCaseId: nextCase?.id ?? null,
      participantId: participant.id,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Unable to assign course equipment.",
    });
    return;
  }
  const updatedParticipant = await findBeginnersParticipantAuditSnapshot(
    participant.id,
    courseType,
  );

  if (auditChangeLogger && updatedParticipant) {
    void auditChangeLogger.recordEntityChange({
      action: "case_assigned",
      actorUsername: actor.username,
      after: updatedParticipant,
      before: previousParticipant,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(participant.id),
      entityLabel: buildBeginnersParticipantAuditLabel(updatedParticipant),
      entityType: "beginners_participant",
      req,
      target: `/api/beginners-course-participants/${participant.id}/assign-case`,
    }).catch((auditError) => {
      console.error("Failed to record beginners participant audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.case-assign");
  broadcastEquipmentUpdated("beginners.case-assign");

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
  const previousLesson = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);
  await beginnersCourseWriteGateway.replaceLessonCoaches({
    actorUsername: actor.username,
    assignedAtDate: date,
    assignedAtTime: time,
    coachUsernames,
    lessonId: lesson.id,
  });
  const updatedLesson = await findBeginnersLessonAuditSnapshot(lesson.id, courseType);

  if (auditChangeLogger && updatedLesson) {
    void auditChangeLogger.recordEntityChange({
      action: "coaches_assigned",
      actorUsername: actor.username,
      after: updatedLesson,
      before: previousLesson,
      changedAtDate: date,
      changedAtTime: time,
      entityId: String(lesson.id),
      entityLabel: buildBeginnersLessonAuditLabel(updatedLesson),
      entityType: "beginners_lesson",
      req,
      target: `/api/beginners-course-lessons/${lesson.id}/coaches`,
    }).catch((auditError) => {
      console.error("Failed to record beginners lesson audit event", auditError);
    });
  }
  broadcastBeginnersUpdated(courseType, "beginners.lesson-coaches");

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
    courseType: normalizeCourseType(lesson.course_type),
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
  auditChangeLogger,
  buildTournament,
  buildTournamentDataMaps,
  exportsDirectory: serverRuntime.exportsDirectory,
  goldenRecordsCurrentHandicapService,
  getActorUser,
  getUtcTimestampParts,
  handicapTableGateway,
  memberDirectoryGateway,
  path,
  PERMISSIONS,
  sanitizeFileNameSegment,
  serverEventBus,
  toUtcDateString,
  tournamentGateway,
  TOURNAMENT_TEMPLATE_OPTIONS,
  TOURNAMENT_TYPE_OPTIONS,
  writeFileSync,
});
registerScheduleRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
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
  serverEventBus,
});

registerMemberActivityRoutes({
  activityReportingGateway,
  addUtcDays,
  app,
  actorHasPermission,
  auditChangeLogger,
  buildGuestUserProfile,
  buildMemberUserProfile,
  buildPersonalUsageWindow,
  buildTournament,
  buildTournamentDataMaps,
  buildUsageWindow,
  getActorUser,
  getUtcTimestampParts,
  listTournaments: async () => tournamentGateway.listTournaments(),
  memberAuthGateway,
  PERMISSIONS,
  serverEventBus,
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
