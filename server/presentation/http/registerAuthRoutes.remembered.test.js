import assert from "node:assert/strict";
import test from "node:test";
import { registerAuthRoutes } from "./registerAuthRoutes.js";

function harness() {
  const routes = new Map();
  const calls = { issued: 0, revoked: [], restored: 0 };
  const member = { id: 1, username: "archer", first_name: "A", surname: "Archer",
    password: "stored-hash", active_member: 1 };
  const app = {
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    get(path, handler) { routes.set(`GET ${path}`, handler); },
  };
  registerAuthRoutes({
    app,
    memberAuthGateway: {
      async findUserByCredentials() { return member; },
      async findUserByUsername() { return member; },
      async findDisciplinesByUsername() { return []; },
      async recordLoginEvent() {},
    },
    rememberedDeviceService: {
      async issue() { calls.issued++; return { token: "new-token" }; },
      async revoke(token) { calls.revoked.push(token); },
      async authenticate(token, loadUser) {
        calls.restored++;
        return token === "valid-token"
          ? { user: await loadUser("archer"), remainingSeconds: 60 }
          : null;
      },
    },
    syncMemberStatusWithFees: async (user) => user,
    verifyPassword: (password) => password === "secret",
    getRememberedDeviceToken: (req) => req.rememberedToken ?? null,
    createRememberedDeviceCookie: (token) => `remember=${token}; HttpOnly`,
    clearRememberedDeviceCookie: () => "remember=; Max-Age=0",
    getSessionUsername: (req) => req.sessionUsername ?? null,
    getCsrfToken: () => "csrf-token",
    createSessionCookie: (username, age) => `session=${username}; age=${age ?? "normal"}`,
    clearSessionCookie: () => "session=; Max-Age=0",
    createCsrfCookie: () => "csrf=csrf-token",
    clearCsrfCookie: () => "csrf=; Max-Age=0",
    getUtcTimestampParts: () => ["2026-10-22", "12:00:00"],
    buildMemberUserProfile: (user) => ({ auth: { username: user.username } }),
  });

  async function post(path, body = {}, rememberedToken = null) {
    const response = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; },
      json(bodyValue) { this.body = bodyValue; },
    };
    await routes.get(`POST ${path}`)({ body, rememberedToken }, response);
    return response;
  }

  return { calls, post };
}

test("remembered access is opt-in for mobile password login only", async () => {
  const h = harness();
  const credentials = { username: "archer", password: "secret" };
  const desktop = await h.post("/api/auth/login", { ...credentials, deviceType: "desktop", rememberDevice: true });
  assert.equal(desktop.statusCode, 200);
  assert.equal(desktop.headers["Set-Cookie"].length, 2);
  const mobile = await h.post("/api/auth/login", { ...credentials, deviceType: "mobile", rememberDevice: true });
  assert.equal(mobile.statusCode, 200);
  assert.match(mobile.headers["Set-Cookie"][2], /remember=new-token/);
  assert.equal(h.calls.issued, 1);
  const optOut = await h.post("/api/auth/login", { ...credentials, deviceType: "mobile" }, "valid-token");
  assert.equal(optOut.statusCode, 200);
  assert.deepEqual(h.calls.revoked, ["valid-token"]);
  assert.match(optOut.headers["Set-Cookie"][2], /Max-Age=0/);
});

test("remembered authentication creates only a capped normal session", async () => {
  const h = harness();
  const result = await h.post("/api/auth/remembered-session", {}, "valid-token");
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.userProfile.auth.username, "archer");
  assert.deepEqual(result.headers["Set-Cookie"], [
    "session=archer; age=60", "csrf=csrf-token",
  ]);
  const invalid = await h.post("/api/auth/remembered-session", {}, "bad-token");
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.headers["Set-Cookie"], "remember=; Max-Age=0");
});

test("inactivity end preserves remembered access while explicit logout revokes this device", async () => {
  const h = harness();
  const idle = await h.post("/api/auth/session/end", {}, "valid-token");
  assert.equal(idle.statusCode, 200);
  assert.equal(idle.headers["Set-Cookie"].length, 2);
  assert.deepEqual(h.calls.revoked, []);
  const logout = await h.post("/api/auth/logout", {}, "valid-token");
  assert.equal(logout.statusCode, 200);
  assert.equal(logout.headers["Set-Cookie"].length, 3);
  assert.deepEqual(h.calls.revoked, ["valid-token"]);
});
