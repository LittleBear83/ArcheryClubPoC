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
  const noopGateway = {
    findDisciplinesByUsername: async () => [],
    findUserByCredentials: async () => null,
    findUserByRfid: async () => null,
    findUserByUsername: async () => null,
    listAllUsers: async () => [],
    recordGuestLoginEvent: async () => {},
    recordLoginEvent: async () => {},
    updateUserPassword: async () => {},
  };

  registerAuthRoutes({
    app,
    buildGuestUserProfile: () => ({}),
    buildMemberUserProfile: () => ({}),
    clearCsrfCookie: () => "archeryclubpoc_csrf=; Max-Age=0",
    clearSessionCookie: () => "archeryclubpoc_session=; Max-Age=0",
    createCsrfCookie: () => "archeryclubpoc_csrf=test",
    createSessionCookie: () => "archeryclubpoc_session=test",
    getCsrfToken: () => "csrf-token",
    getDeactivatedRfidTag: (rfidTag) => `deactivated-${rfidTag}`,
    getSessionUsername,
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    hashPassword: (password) => `hashed-${password}`,
    latestRfidScan: {
      cardBrand: null,
      deliveredSequence: 0,
      rfidTag: null,
      scanType: null,
      scannedAt: null,
      sequence: 0,
      source: null,
    },
    memberAuthGateway: noopGateway,
    rfidReaderStatus: {
      checked: true,
      detected: false,
    },
    syncMemberStatusWithFees: (user) => user,
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
    activityReportingGateway: {
      countGuestLoginsInRange: async () => ({ count: 0 }),
      countMemberLoginsForUserInRange: async () => ({ count: 0 }),
      countMemberLoginsInRange: async () => ({ count: 0 }),
      findMemberCoachingBookingsByUserId: async () => [],
      findMemberEventBookingsByUserId: async () => [],
      findRecentGuestLogins: async () => [],
      findRecentRangeMembers: async () => [],
      guestLoginsByDateInRange: async () => [],
      guestLoginsByHourInRange: async () => [],
      guestLoginsByWeekdayInRange: async () => [],
      listAllUserDisciplines: async () => [],
      listReportingGuestLogins: async () => [],
      listReportingMemberLogins: async () => [],
      memberLoginsByDateForUserInRange: async () => [],
      memberLoginsByDateInRange: async () => [],
      memberLoginsByHourForUserInRange: async () => [],
      memberLoginsByHourInRange: async () => [],
      memberLoginsByWeekdayForUserInRange: async () => [],
      memberLoginsByWeekdayInRange: async () => [],
    },
    addUtcDays,
    app,
    actorHasPermission,
    buildGuestUserProfile: () => ({}),
    buildMemberUserProfile: () => ({}),
    buildPersonalUsageWindow: () => ({}),
    buildTournament: () => ({}),
    buildTournamentDataMaps: () => ({
      registrationsByTournamentId: new Map(),
      scoresByTournamentId: new Map(),
    }),
    buildUsageWindow: () => ({}),
    getActorUser,
    listTournaments: async () => [],
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
  const committeeRoleStore = new Map();
  const PERMISSIONS = {
    MANAGE_ROLES_PERMISSIONS: "manage_roles_permissions",
  };
  let committeeRoleId = 1;

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
    buildUniqueRoleKeyFromTitle: (title) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    CURRENT_PERMISSION_KEY_SET: new Set([PERMISSIONS.MANAGE_ROLES_PERMISSIONS]),
    DISTANCE_SIGN_OFF_YARDS: [],
    findDisciplinesByUsername: noopStatement(),
    findLoanBowByUsername: noopStatement(),
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
    listAllUsers: noopStatement(),
    listAssignableRoleKeys: () => [],
    listProfilePageMembers: () => [],
    memberDistanceSignOffRepository: {
      listByDiscipline: () => [],
    },
    PERMISSIONS,
    roleCommitteeGateway: {
      countUsersByRoleKey: async () => ({ count: 0 }),
      createRole: async ({ permissions, roleKey, title }) => {
        roleStore.set(roleKey, {
          is_system: 0,
          role_key: roleKey,
          title,
        });
        permissionStore.set(roleKey, [...permissions]);
        return roleStore.get(roleKey);
      },
      deleteCommitteeRoleById: async (id) => {
        committeeRoleStore.delete(Number(id));
      },
      deleteRole: async (roleKey) => {
        roleStore.delete(roleKey);
        permissionStore.delete(roleKey);
      },
      findCommitteeRoleById: async (id) => committeeRoleStore.get(Number(id)) ?? null,
      findCommitteeRoleByKey: async (roleKey) =>
        [...committeeRoleStore.values()].find((role) => role.role_key === roleKey) ?? null,
      findMaxCommitteeRoleDisplayOrder: async () => ({ maxDisplayOrder: 0 }),
      findRoleDefinitionByKey: async (roleKey) => roleStore.get(roleKey) ?? null,
      insertCommitteeRole: async (payload) => {
        committeeRoleStore.set(committeeRoleId, {
          id: committeeRoleId,
          role_key: payload.roleKey,
          title: payload.title,
          summary: payload.summary,
          responsibilities: payload.responsibilities,
          personal_blurb: payload.personalBlurb,
          photo_data_url: payload.photoDataUrl,
          display_order: payload.displayOrder,
          assigned_username: payload.assignedUsername,
        });
        committeeRoleId += 1;
      },
      listCommitteeRoles: async () => [...committeeRoleStore.values()],
      listPermissionDefinitions: async () => [],
      listRoleDefinitions: async () => [...roleStore.values()],
      listRolePermissionKeysByRoleKey: async (roleKey) =>
        permissionStore.get(roleKey) ?? [],
      updateCommitteeRoleDetails: async (payload) => {
        const existing = committeeRoleStore.get(Number(payload.id));
        if (!existing) {
          return;
        }

        committeeRoleStore.set(Number(payload.id), {
          ...existing,
          assigned_username: payload.assignedUsername,
          personal_blurb: payload.personalBlurb,
          photo_data_url: payload.photoDataUrl,
          responsibilities: payload.responsibilities,
          summary: payload.summary,
          title: payload.title,
        });
      },
      updateRole: async ({ permissions, roleKey, title }) => {
        const existing = roleStore.get(roleKey);

        if (!existing) {
          return null;
        }

        const updated = {
          ...existing,
          title,
        };
        roleStore.set(roleKey, updated);
        permissionStore.set(roleKey, [...permissions]);
        return updated;
      },
    },
    sanitizeLoanBow: (value) => value,
    sanitizeLoanBowReturn: (value) => value,
    saveLoanBowRecord: noopStatement(),
    saveMemberProfile: noopStatement(),
    TOURNAMENT_TYPE_OPTIONS: [],
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

test("auth routes reject unauthenticated access to secured RFID scan APIs", async () => {
  const app = express();
  registerAuthTestRoutes(app, () => null);
  const { baseUrl, server } = await startTestServer(app);

  try {
    const latestScanResponse = await requestJson(
      baseUrl,
      "/api/auth/rfid/latest-scan",
    );

    assert.equal(latestScanResponse.status, 401);
    assert.equal(latestScanResponse.body.success, false);
  } finally {
    server.close();
  }
});

test("guest inviter members are available before login", async () => {
  const app = express();
  registerAuthTestRoutes(app, () => null);
  const { baseUrl, server } = await startTestServer(app);

  try {
    const invitersResponse = await requestJson(baseUrl, "/api/guest-inviter-members");

    assert.equal(invitersResponse.status, 200);
    assert.deepEqual(invitersResponse.body, {
      success: true,
      members: [],
    });
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
      assignedUserCount: 0,
      isSystem: false,
      permissions: ["manage_roles_permissions"],
      roleKey: "range_admin",
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
