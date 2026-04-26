import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { test } from "node:test";
import express from "express";
import { createCsrfProtection } from "../../security/csrf.js";
import { registerAdminMemberRoutes } from "./registerAdminMemberRoutes.js";
import { registerAuthRoutes } from "./registerAuthRoutes.js";
import { registerMemberActivityRoutes } from "./registerMemberActivityRoutes.js";

async function startTestServer(app) {
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { baseUrl, server };
}

function requestJson(baseUrl, path, { body = null, headers = {}, method = "GET" } = {}) {
  const url = new URL(path, baseUrl);
  const payload = body == null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        headers: {
          ...headers,
          ...(payload
            ? {
                "content-length": Buffer.byteLength(payload),
                "content-type": "application/json",
              }
            : {}),
        },
        method,
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            body: responseBody ? JSON.parse(responseBody) : null,
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
    request.end(payload);
  });
}

function noopStatement(value = null) {
  return {
    all: () => [],
    get: () => value,
    run: () => {},
  };
}

function registerAuthTestRoutes(app, getSessionUsername) {
  registerAuthRoutes({
    app,
    buildGuestUserProfile: () => ({}),
    buildMemberUserProfile: () => ({}),
    clearCsrfCookie: () => "archeryclubpoc_csrf=; Max-Age=0",
    clearSessionCookie: () => "archeryclubpoc_session=; Max-Age=0",
    createCsrfCookie: () => "archeryclubpoc_csrf=test",
    createSessionCookie: () => "archeryclubpoc_session=test",
    findDisciplinesByUsername: noopStatement(),
    findUserByCredentials: noopStatement(),
    findUserByRfid: noopStatement(),
    findUserByUsername: noopStatement(),
    getCsrfToken: () => "csrf-token",
    getDeactivatedRfidTag: (rfidTag) => `deactivated-${rfidTag}`,
    getSessionUsername,
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    hashPassword: (password) => `hashed-${password}`,
    insertGuestLoginEvent: noopStatement(),
    insertLoginEvent: noopStatement(),
    latestRfidScan: {
      cardBrand: null,
      deliveredSequence: 0,
      rfidTag: null,
      scanType: null,
      scannedAt: null,
      sequence: 0,
      source: null,
    },
    rfidReaderStatus: {
      checked: true,
      detected: false,
    },
    listAllUsers: noopStatement(),
    syncMemberStatusWithFees: (user) => user,
    updateUserPassword: noopStatement(),
    verifyPassword: () => false,
  });
}

function registerMemberActivityTestRoutes(app, getActorUser, actorHasPermission) {
  const addUtcDays = (date, days) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  };
  const toUtcDateString = (date) => date.toISOString().slice(0, 10);

  registerMemberActivityRoutes({
    addUtcDays,
    app,
    actorHasPermission,
    buildDisciplinesByUsernameMap: () => new Map(),
    buildGuestUserProfile: () => ({}),
    buildMemberUserProfile: () => ({}),
    buildPersonalUsageWindow: () => ({}),
    buildTournament: () => ({}),
    buildTournamentDataMaps: () => ({
      registrationsByTournamentId: new Map(),
      scoresByTournamentId: new Map(),
    }),
    buildUsageWindow: () => ({}),
    findMemberCoachingBookingsByUserId: noopStatement(),
    findMemberEventBookingsByUserId: noopStatement(),
    findRecentGuestLogins: noopStatement(),
    findRecentRangeMembers: noopStatement(),
    getActorUser,
    listReportingGuestLogins: noopStatement(),
    listReportingMemberLogins: noopStatement(),
    listTournaments: noopStatement(),
    PERMISSIONS: {
      VIEW_REPORTS: "view_reports",
    },
    startOfUtcDay: (date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    toUtcDateString,
  });
}

function createAdminRoleTestApp() {
  const csrf = createCsrfProtection({
    secret: "admin-route-csrf-secret",
  });
  const app = express();
  const roleStore = new Map();
  const permissionStore = new Map();
  const PERMISSIONS = {
    MANAGE_ROLES_PERMISSIONS: "manage_roles_permissions",
  };

  app.use(express.json());
  app.use(csrf.middleware);
  registerAdminMemberRoutes({
    actorHasPermission: (actor, permission) => actor?.permissions?.includes(permission),
    ALLOWED_DISCIPLINES: [],
    app,
    buildCommitteeRole: () => ({}),
    buildEditableMemberProfile: () => ({}),
    buildLoanBowRecord: () => ({}),
    buildMemberUserProfile: () => ({}),
    buildRoleDefinitionResponse: (role) => ({
      key: role.role_key,
      title: role.title,
      permissions: permissionStore.get(role.role_key) ?? [],
    }),
    buildUniqueRoleKeyFromTitle: (title) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    countUsersByRoleKey: noopStatement({ count: 0 }),
    CURRENT_PERMISSION_KEY_SET: new Set([PERMISSIONS.MANAGE_ROLES_PERMISSIONS]),
    db: {
      transaction: (callback) => callback,
    },
    deleteCommitteeRoleById: noopStatement(),
    deleteRoleDefinition: noopStatement(),
    deleteRolePermissionsByRoleKey: {
      run: (roleKey) => permissionStore.set(roleKey, []),
    },
    DISTANCE_SIGN_OFF_YARDS: [],
    findCommitteeRoleById: noopStatement(),
    findCommitteeRoleByKey: noopStatement(),
    findDisciplinesByUsername: noopStatement(),
    findLoanBowByUsername: noopStatement(),
    findMaxCommitteeRoleDisplayOrder: noopStatement({ display_order: 0 }),
    findRoleDefinitionByKey: {
      get: (roleKey) => roleStore.get(roleKey) ?? null,
    },
    findUserByUsername: noopStatement(),
    getActorUser: (req) => {
      if (!String(req.headers.cookie ?? "").includes("archeryclubpoc_session=valid")) {
        return null;
      }

      return {
        permissions: [PERMISSIONS.MANAGE_ROLES_PERMISSIONS],
        username: "admin",
      };
    },
    getPermissionsForRole: () => [],
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    insertCommitteeRole: noopStatement(),
    insertRolePermission: {
      run: (roleKey, permissionKey) => {
        permissionStore.set(roleKey, [
          ...(permissionStore.get(roleKey) ?? []),
          permissionKey,
        ]);
      },
    },
    listAllUsers: noopStatement(),
    listAssignableRoleKeys: () => [],
    listCommitteeRoles: noopStatement(),
    listPermissionDefinitions: noopStatement(),
    listProfilePageMembers: () => [],
    listRoleDefinitions: noopStatement(),
    memberDistanceSignOffRepository: {
      listByDiscipline: () => [],
    },
    PERMISSIONS,
    sanitizeLoanBow: (value) => value,
    sanitizeLoanBowReturn: (value) => value,
    saveLoanBowRecord: noopStatement(),
    saveMemberProfile: noopStatement(),
    TOURNAMENT_TYPE_OPTIONS: [],
    updateCommitteeRoleDetails: noopStatement(),
    updateRoleDefinition: noopStatement(),
    upsertRole: {
      run: ({ isSystem, roleKey, title }) => {
        roleStore.set(roleKey, {
          is_system: isSystem,
          role_key: roleKey,
          title,
        });
      },
    },
  });

  return { app, csrf };
}

function createCsrfHeaders(csrf, { includeSession = true } = {}) {
  const token = csrf.createToken();
  const cookies = [`${csrf.cookieName}=${encodeURIComponent(token)}`];

  if (includeSession) {
    cookies.push("archeryclubpoc_session=valid");
  }

  return {
    cookie: cookies.join("; "),
    [csrf.headerName]: token,
  };
}

test("auth routes reject unauthenticated access to secured RFID scan and guest inviter APIs", async () => {
  const app = express();
  registerAuthTestRoutes(app, () => null);
  const { baseUrl, server } = await startTestServer(app);

  try {
    const latestScanResponse = await requestJson(
      baseUrl,
      "/api/auth/rfid/latest-scan",
    );
    const invitersResponse = await requestJson(baseUrl, "/api/guest-inviter-members");

    assert.equal(latestScanResponse.status, 401);
    assert.equal(latestScanResponse.body.success, false);
    assert.equal(invitersResponse.status, 401);
    assert.equal(invitersResponse.body.success, false);
  } finally {
    server.close();
  }
});

test("auth routes expose RFID reader detection status for the login page", async () => {
  const csrf = createCsrfProtection({
    secret: "auth-route-csrf-secret",
  });
  const app = express();

  app.use(express.json());
  app.use(csrf.middleware);
  registerAuthTestRoutes(app, () => null);

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/rfid/status");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      checked: true,
      detected: false,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }
});

test("mutating admin routes require both a session cookie and a valid CSRF token", async () => {
  const { app, csrf } = createAdminRoleTestApp();
  const { baseUrl, server } = await startTestServer(app);
  const roleBody = {
    permissions: ["manage_roles_permissions"],
    title: "Range Admin",
  };

  try {
    const missingCsrfResponse = await requestJson(baseUrl, "/api/roles", {
      body: roleBody,
      headers: {
        cookie: "archeryclubpoc_session=valid",
      },
      method: "POST",
    });
    const missingSessionResponse = await requestJson(baseUrl, "/api/roles", {
      body: roleBody,
      headers: createCsrfHeaders(csrf, { includeSession: false }),
      method: "POST",
    });
    const successResponse = await requestJson(baseUrl, "/api/roles", {
      body: roleBody,
      headers: createCsrfHeaders(csrf),
      method: "POST",
    });

    assert.equal(missingCsrfResponse.status, 403);
    assert.equal(missingCsrfResponse.body.success, false);
    assert.equal(missingSessionResponse.status, 401);
    assert.equal(missingSessionResponse.body.success, false);
    assert.equal(successResponse.status, 201);
    assert.deepEqual(successResponse.body.role, {
      key: "range_admin",
      permissions: ["manage_roles_permissions"],
      title: "Range Admin",
    });
  } finally {
    server.close();
  }
});

test("member activity routes reject unauthenticated range visibility APIs", async () => {
  const app = express();
  registerMemberActivityTestRoutes(app, () => null, () => false);
  const { baseUrl, server } = await startTestServer(app);

  try {
    const membersResponse = await requestJson(baseUrl, "/api/range-members");
    const dashboardResponse = await requestJson(
      baseUrl,
      "/api/range-usage-dashboard",
    );

    assert.equal(membersResponse.status, 401);
    assert.equal(membersResponse.body.success, false);
    assert.equal(dashboardResponse.status, 401);
    assert.equal(dashboardResponse.body.success, false);
  } finally {
    server.close();
  }
});

test("reporting attendance route rejects authenticated members without report permission", async () => {
  const app = express();
  registerMemberActivityTestRoutes(
    app,
    () => ({
      id: 1,
      username: "member",
    }),
    () => false,
  );
  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/reporting/attendance");

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  } finally {
    server.close();
  }
});
