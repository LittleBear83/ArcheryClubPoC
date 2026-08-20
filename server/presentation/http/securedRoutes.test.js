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

function registerAuthTestRoutes(app, getSessionUsername, overrides = {}) {
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
  const memberAuthGateway = {
    ...noopGateway,
    ...(overrides.memberAuthGateway ?? {}),
  };

  registerAuthRoutes({
    app,
    auditChangeLogger: overrides.auditChangeLogger ?? null,
    buildGuestUserProfile: overrides.buildGuestUserProfile ?? (() => ({})),
    buildMemberUserProfile: overrides.buildMemberUserProfile ?? (() => ({})),
    clearCsrfCookie: () => "archeryclubpoc_csrf=; Max-Age=0",
    clearSessionCookie: () => "archeryclubpoc_session=; Max-Age=0",
    createCsrfCookie: () => "archeryclubpoc_csrf=test",
    createSessionCookie: () => "archeryclubpoc_session=test",
    getCsrfToken: () => "csrf-token",
    getDeactivatedRfidTag: (rfidTag) => `deactivated-${rfidTag}`,
    getSessionUsername,
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    hashPassword: overrides.hashPassword ?? ((password) => `hashed-${password}`),
    memberAuthGateway,
    rfidReaderStatus: overrides.rfidReaderStatus ?? {
      checked: true,
      detected: false,
    },
    syncMemberStatusWithFees: overrides.syncMemberStatusWithFees ?? ((user) => user),
    verifyPassword: overrides.verifyPassword ?? (() => false),
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
      listMemberJourneyParticipants: async () => [],
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
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    listTournaments: async () => [],
    memberAuthGateway: {
      recordLoginEvent: async () => {},
    },
    PERMISSIONS: {
      VIEW_REPORTS: "view_reports",
    },
    serverEventBus: {
      broadcastToAll: () => {},
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
    MANAGE_COMMITTEE_ROLES: "manage_committee_roles",
    MANAGE_ROLES_PERMISSIONS: "manage_roles_permissions",
  };
  let committeeRoleId = 1;

  app.use(express.json());
  app.use(csrf.middleware);
  registerAdminMemberRoutes({
    actorHasPermission: (actor, permission) => actor?.permissions?.includes(permission),
    ALLOWED_DISCIPLINES: [],
    app,
    buildCommitteeRole: (role) => ({
      id: role.id,
      title: role.title,
      summary: role.summary,
      responsibilities: role.responsibilities,
      personalBlurb: role.personal_blurb ?? "",
      photoDataUrl: role.photo_data_url ?? null,
      assignedMember: role.assigned_username
        ? {
            username: role.assigned_username,
            fullName: "Committee Member",
            userType: "member",
          }
        : null,
      roleKey: role.role_key,
    }),
    buildEditableMemberProfile: () => ({}),
    buildLoanBowRecord: () => ({}),
    buildMemberUserProfile: () => ({}),
    buildUniqueRoleKeyFromTitle: (title) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    CURRENT_PERMISSION_KEY_SET: new Set([
      PERMISSIONS.MANAGE_COMMITTEE_ROLES,
      PERMISSIONS.MANAGE_ROLES_PERMISSIONS,
    ]),
    DISTANCE_SIGN_OFF_YARDS: [],
    getActorUser: (req) => {
      const cookieHeader = String(req.headers.cookie ?? "");

      if (!cookieHeader.includes("archeryclubpoc_session=")) {
        return null;
      }

      if (cookieHeader.includes("archeryclubpoc_session=committee")) {
        return {
          permissions: [],
          username: "committee-member",
        };
      }

      return {
        permissions: [
          PERMISSIONS.MANAGE_COMMITTEE_ROLES,
          PERMISSIONS.MANAGE_ROLES_PERMISSIONS,
        ],
        username: "admin",
      };
    },
    getPermissionsForRole: () => [],
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    listAssignableRoleKeys: () => [],
    listProfilePageMembers: () => [],
    memberDirectoryGateway: {
      findDisciplinesByUsername: async () => [],
      findLoanBowByUsername: async () => null,
      findUserByUsername: async (username) =>
        username === "committee-member"
          ? {
              first_name: "Committee",
              surname: "Member",
              username: "committee-member",
            }
          : null,
      listAllUsers: async () => [
        {
          first_name: "Committee",
          surname: "Member",
          user_type: "member",
          username: "committee-member",
        },
      ],
    },
    memberDistanceSignOffRepository: {
      listByDiscipline: async () => [],
      listByUsername: async () => [],
      upsert: async () => {},
    },
    PERMISSIONS,
    refreshRoleAccessSnapshot: async () => {},
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
    verifyPassword: (provided, stored) => provided === stored,
  });

  return { app, csrf };
}

function createCsrfHeaders(csrf, { includeSession = true, sessionValue = "valid" } = {}) {
  const token = csrf.createToken();
  const cookies = [`${csrf.cookieName}=${encodeURIComponent(token)}`];

  if (includeSession) {
    cookies.push(`archeryclubpoc_session=${sessionValue}`);
  }

  return {
    cookie: cookies.join("; "),
    [csrf.headerName]: token,
  };
}

test("guest inviter members require an authenticated member session", async () => {
  const app = express();
  registerAuthTestRoutes(app, () => null);
  const { baseUrl, server } = await startTestServer(app);

  try {
    const invitersResponse = await requestJson(baseUrl, "/api/guest-inviter-members");

    assert.equal(invitersResponse.status, 401);
    assert.deepEqual(invitersResponse.body, {
      success: false,
      message: "An authenticated member is required.",
    });
  } finally {
    server.close();
  }
});

test("guest inviter members remain available to signed-in members", async () => {
  const app = express();
  registerAuthTestRoutes(app, () => "signed-in-member", {
    memberAuthGateway: {
      listAllUsers: async () => [
        {
          username: "signed-in-member",
          first_name: "Signed",
          surname: "In Member",
          user_type: "general",
        },
      ],
    },
  });
  const { baseUrl, server } = await startTestServer(app);

  try {
    const invitersResponse = await requestJson(baseUrl, "/api/guest-inviter-members");

    assert.equal(invitersResponse.status, 200);
    assert.deepEqual(invitersResponse.body, {
      success: true,
      members: [
        {
          username: "signed-in-member",
          firstName: "Signed",
          surname: "In Member",
          fullName: "Signed In Member",
          userType: "general",
        },
      ],
    });
  } finally {
    server.close();
  }
});

test("guest login records payment method and uses the signed-in member as inviter", async () => {
  const app = express();
  app.use(express.json());
  const recordedGuestLogins = [];

  registerAuthTestRoutes(app, () => "signed-in-member", {
    buildGuestUserProfile: (guest) => guest,
    memberAuthGateway: {
      findUserByUsername: async (username) =>
        username === "signed-in-member"
          ? {
              first_name: "Signed",
              surname: "In Member",
              username: "signed-in-member",
            }
          : null,
      recordGuestLoginEvent: async (payload) => {
        recordedGuestLogins.push(payload);
      },
    },
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/guest-login", {
      body: {
        firstName: "Guest",
        surname: "Archer",
        archeryGbMembershipNumber: "1234567",
        invitedByUsername: "someone-else",
        paymentMethod: "PayPal",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(recordedGuestLogins, [
      {
        archeryGbMembershipNumber: "1234567",
        firstName: "Guest",
        invitedByName: "Signed In Member",
        invitedByUsername: "signed-in-member",
        paymentMethod: "paypal",
        surname: "Archer",
        timestampParts: ["2026-04-21", "10:00:00"],
      },
    ]);
    assert.equal(response.body.success, true);
    assert.equal(response.body.userProfile.paymentMethod, "paypal");
    assert.equal(response.body.userProfile.invitedByUsername, "signed-in-member");
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

test("mobile password login is recorded without marking range presence as an RFID-style check-in", async () => {
  const app = express();
  app.use(express.json());
  const recordedMethods = [];

  registerAuthTestRoutes(app, () => null, {
    buildMemberUserProfile: (user) => ({
      auth: {
        username: user.username,
      },
    }),
    memberAuthGateway: {
      findDisciplinesByUsername: async () => [],
      findUserByCredentials: async () => ({
        active_member: 1,
        password: "hashed-secret",
        username: "mobile-member",
      }),
      recordLoginEvent: async ({ method }) => {
        recordedMethods.push(method);
      },
      updateUserPassword: async () => {},
    },
    verifyPassword: (providedPassword, storedPassword) =>
      providedPassword === "secret" && storedPassword === "hashed-secret",
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/login", {
      body: {
        username: "mobile-member",
        password: "secret",
        deviceType: "mobile",
      },
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(recordedMethods, ["password-mobile"]);
  } finally {
    server.close();
  }
});

test("failed password login audit records an incorrect password attempt", async () => {
  const app = express();
  app.use(express.json());
  const recordedAuditEvents = [];

  registerAuthTestRoutes(app, () => null, {
    auditChangeLogger: {
      recordEntityChange: async (payload) => {
        recordedAuditEvents.push(payload);
      },
    },
    memberAuthGateway: {
      findUserByCredentials: async () => ({
        active_member: 1,
        password: "hashed-secret",
        username: "member-one",
      }),
    },
    verifyPassword: () => false,
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/login", {
      body: {
        password: "wrong-password",
        username: "member-one",
      },
      method: "POST",
    });

    assert.equal(response.status, 401);
    assert.equal(recordedAuditEvents.length, 1);
    assert.deepEqual(recordedAuditEvents[0].after, {
      activityType: "login_failed",
      attemptedRfidTagSuffix: null,
      attemptedUsername: "member-one",
      failureReason: "password_incorrect",
      incorrectFields: ["password"],
      method: "password",
    });
    assert.equal(recordedAuditEvents[0].actorUsername, "member-one");
    assert.equal(recordedAuditEvents[0].entityType, "auth_activity");
    assert.equal(recordedAuditEvents[0].statusCode, 401);
    assert.equal(recordedAuditEvents[0].target, "/api/auth/login");
  } finally {
    server.close();
  }
});

test("failed password login audit records an incorrect username attempt", async () => {
  const app = express();
  app.use(express.json());
  const recordedAuditEvents = [];

  registerAuthTestRoutes(app, () => null, {
    auditChangeLogger: {
      recordEntityChange: async (payload) => {
        recordedAuditEvents.push(payload);
      },
    },
    memberAuthGateway: {
      findUserByCredentials: async () => null,
    },
    verifyPassword: () => false,
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/login", {
      body: {
        password: "secret",
        username: "unknown-member",
      },
      method: "POST",
    });

    assert.equal(response.status, 401);
    assert.equal(recordedAuditEvents.length, 1);
    assert.deepEqual(recordedAuditEvents[0].after, {
      activityType: "login_failed",
      attemptedRfidTagSuffix: null,
      attemptedUsername: "unknown-member",
      failureReason: "username_not_found",
      incorrectFields: ["username"],
      method: "password",
    });
    assert.equal(recordedAuditEvents[0].actorUsername, "unknown-member");
  } finally {
    server.close();
  }
});

test("failed RFID login audit records an unrecognised tag attempt without storing the full tag", async () => {
  const app = express();
  app.use(express.json());
  const recordedAuditEvents = [];

  registerAuthTestRoutes(app, () => null, {
    auditChangeLogger: {
      recordEntityChange: async (payload) => {
        recordedAuditEvents.push(payload);
      },
    },
    memberAuthGateway: {
      findUserByRfid: async () => null,
    },
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/auth/rfid", {
      body: {
        rfidTag: "ABC123456",
      },
      method: "POST",
    });

    assert.equal(response.status, 401);
    assert.equal(recordedAuditEvents.length, 1);
    assert.deepEqual(recordedAuditEvents[0].after, {
      activityType: "login_failed",
      attemptedRfidTagSuffix: "3456",
      attemptedUsername: null,
      failureReason: "rfid_tag_not_recognised",
      incorrectFields: ["rfid_tag"],
      method: "rfid",
    });
    assert.equal(recordedAuditEvents[0].actorUsername, "rfid:3456");
    assert.equal(recordedAuditEvents[0].entityLabel, "RFID ending 3456");
  } finally {
    server.close();
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

test("assigned committee members can update only their own personal blurb", async () => {
  const { app, csrf } = createAdminRoleTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const createResponse = await requestJson(baseUrl, "/api/committee-roles", {
      body: {
        assignedUsername: "committee-member",
        personalBlurb: "Original blurb",
        responsibilities: "Keep everyone aligned",
        summary: "Keeps the club moving",
        title: "Secretary",
      },
      headers: createCsrfHeaders(csrf),
      method: "POST",
    });

    assert.equal(createResponse.status, 201);

    const roleId = createResponse.body.role.id;
    const updateResponse = await requestJson(
      baseUrl,
      `/api/committee-roles/${roleId}/personal-blurb`,
      {
        body: {
          personalBlurb: "Updated by the assigned member",
        },
        headers: createCsrfHeaders(csrf, { sessionValue: "committee" }),
        method: "PUT",
      },
    );

    assert.equal(updateResponse.status, 200);
    assert.equal(
      updateResponse.body.role.personalBlurb,
      "Updated by the assigned member",
    );
    assert.equal(
      updateResponse.body.role.assignedMember?.username,
      "committee-member",
    );
  } finally {
    server.close();
  }
});

test("changing or removing a committee assignment clears the personal blurb and removes self-edit access", async () => {
  const { app, csrf } = createAdminRoleTestApp();
  const { baseUrl, server } = await startTestServer(app);

  try {
    const createResponse = await requestJson(baseUrl, "/api/committee-roles", {
      body: {
        assignedUsername: "committee-member",
        personalBlurb: "Original blurb",
        responsibilities: "Keep everyone aligned",
        summary: "Keeps the club moving",
        title: "Secretary",
      },
      headers: createCsrfHeaders(csrf),
      method: "POST",
    });
    assert.equal(createResponse.status, 201);

    const roleId = createResponse.body.role.id;
    const unassignResponse = await requestJson(
      baseUrl,
      `/api/committee-roles/${roleId}`,
      {
        body: {
          assignedUsername: "",
          personalBlurb: "Should be cleared",
          responsibilities: "Keep everyone aligned",
          summary: "Keeps the club moving",
          title: "Secretary",
        },
        headers: createCsrfHeaders(csrf),
        method: "PUT",
      },
    );

    assert.equal(unassignResponse.status, 200);
    assert.equal(unassignResponse.body.role.personalBlurb, "");
    assert.equal(unassignResponse.body.role.assignedMember, null);

    const deniedResponse = await requestJson(
      baseUrl,
      `/api/committee-roles/${roleId}/personal-blurb`,
      {
        body: {
          personalBlurb: "Trying again after removal",
        },
        headers: createCsrfHeaders(csrf, { sessionValue: "committee" }),
        method: "PUT",
      },
    );

    assert.equal(deniedResponse.status, 403);
    assert.equal(deniedResponse.body.success, false);
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

test("range members omit private contact and membership fields", async () => {
  const app = express();
  app.use(express.json());

  registerMemberActivityRoutes({
    activityReportingGateway: {
      countGuestLoginsInRange: async () => ({ count: 0 }),
      countMemberLoginsForUserInRange: async () => ({ count: 0 }),
      countMemberLoginsInRange: async () => ({ count: 0 }),
      findLatestRangeMembers: async () => [
        {
          active_member: 1,
          email_address: "member@example.com",
          first_name: "Robin",
          id: 7,
          last_logged_in_at: "2026-04-21T09:30:00.000Z",
          surname: "Archer",
          username: "robin",
        },
      ],
      findMemberCoachingBookingsByUserId: async () => [],
      findMemberEventBookingsByUserId: async () => [],
      findRecentGuestLogins: async () => [
        {
          archery_gb_membership_number: "1234567",
          first_name: "Guest",
          last_logged_in_at: "2026-04-21T09:45:00.000Z",
          surname: "Visitor",
        },
      ],
      findRecentRangeMembers: async () => [],
      guestLoginsByDateInRange: async () => [],
      guestLoginsByHourInRange: async () => [],
      guestLoginsByWeekdayInRange: async () => [],
      listAllUserDisciplines: async () => [
        { username: "robin", discipline: "Recurve Bow" },
      ],
      listMemberJourneyParticipants: async () => [],
      listReportingGuestLogins: async () => [],
      listReportingMemberLogins: async () => [],
      memberLoginsByDateForUserInRange: async () => [],
      memberLoginsByDateInRange: async () => [],
      memberLoginsByHourForUserInRange: async () => [],
      memberLoginsByHourInRange: async () => [],
      memberLoginsByWeekdayForUserInRange: async () => [],
      memberLoginsByWeekdayInRange: async () => [],
    },
    addUtcDays: (date, days) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    },
    app,
    actorHasPermission: () => true,
    auditChangeLogger: null,
    buildGuestUserProfile: (guest, meta = {}) => ({
      id: "guest:1234567",
      personal: {
        firstName: guest.first_name,
        surname: guest.surname,
        fullName: `${guest.first_name} ${guest.surname}`,
        archeryGbMembershipNumber: guest.archery_gb_membership_number,
      },
      meta,
    }),
    buildMemberUserProfile: (user, disciplines, meta = {}) => ({
      id: user.username,
      personal: {
        firstName: user.first_name,
        surname: user.surname,
        fullName: `${user.first_name} ${user.surname}`,
        emailAddress: user.email_address,
        archeryGbMembershipNumber: "7654321",
      },
      membership: {
        disciplines,
      },
      meta,
    }),
    buildPersonalUsageWindow: () => ({}),
    buildTournament: () => ({}),
    buildTournamentDataMaps: () => ({
      registrationsByTournamentId: new Map(),
      scoresByTournamentId: new Map(),
    }),
    buildUsageWindow: () => ({}),
    getActorUser: () => ({
      id: 1,
      username: "viewer",
    }),
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    listTournaments: async () => [],
    memberAuthGateway: {
      findRangePresenceExtensionByUsername: async () => null,
      recordLoginEvent: async () => {},
    },
    PERMISSIONS: {
      VIEW_REPORTS: "view_reports",
    },
    serverEventBus: {
      broadcastToAll: () => {},
    },
    startOfUtcDay: (date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    toUtcDateString: (date) => date.toISOString().slice(0, 10),
  });

  const realNow = Date.now;
  Date.now = () => new Date("2026-04-21T10:00:00.000Z").getTime();

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/range-members");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.members, [
      {
        id: "robin",
        personal: {
          firstName: "Robin",
          surname: "Archer",
          fullName: "Robin Archer",
        },
        membership: {
          disciplines: ["Recurve Bow"],
        },
        meta: {
          activeRangePresenceEndsAt: "2026-04-21T11:30:00.000Z",
          lastLoggedInAt: "2026-04-21T09:30:00.000Z",
        },
      },
      {
        id: "guest:1234567",
        personal: {
          firstName: "Guest",
          surname: "Visitor",
          fullName: "Guest Visitor",
        },
        meta: {
          lastLoggedInAt: "2026-04-21T09:45:00.000Z",
        },
      },
    ]);
  } finally {
    Date.now = realNow;
    server.close();
  }
});

test("mobile on-site check-in records a member login event as mobile app usage", async () => {
  const app = express();
  app.use(express.json());
  const recordedLogins = [];

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
    addUtcDays: (date, days) => {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    },
    app,
    actorHasPermission: () => true,
    buildGuestUserProfile: () => ({}),
    buildMemberUserProfile: () => ({}),
    buildPersonalUsageWindow: () => ({}),
    buildTournament: () => ({}),
    buildTournamentDataMaps: () => ({
      registrationsByTournamentId: new Map(),
      scoresByTournamentId: new Map(),
    }),
    buildUsageWindow: () => ({}),
    getActorUser: () => ({
      id: 7,
      username: "mobile-member",
    }),
    getUtcTimestampParts: () => ["2026-04-21", "10:00:00"],
    listTournaments: async () => [],
    memberAuthGateway: {
      recordLoginEvent: async (payload) => {
        recordedLogins.push(payload);
      },
    },
    PERMISSIONS: {
      VIEW_REPORTS: "view_reports",
    },
    serverEventBus: {
      broadcastToAll: () => {},
    },
    startOfUtcDay: (date) =>
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    toUtcDateString: (date) => date.toISOString().slice(0, 10),
  });

  const { baseUrl, server } = await startTestServer(app);

  try {
    const response = await requestJson(baseUrl, "/api/range-members/mobile-check-in", {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(recordedLogins, [
      {
        method: "mobile-app",
        timestampParts: ["2026-04-21", "10:00:00"],
        username: "mobile-member",
      },
    ]);
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
