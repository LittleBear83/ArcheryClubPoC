import assert from "node:assert/strict";
import test from "node:test";
import { registerAuthRoutes } from "./registerAuthRoutes.js";

const scan = (sequence) => ({
  sequence, instanceId: "bridge-start-1", reader: "ACS ACR122U 00 00",
  scannedAt: `2026-10-04T12:00:${String(sequence).padStart(2, "0")}Z`,
});

function harness() {
  const routes = new Map();
  const events = new Map();
  const audits = [];
  const broadcasts = [];
  const member = { username: "archer", first_name: "A", surname: "Archer", active_member: 1 };
  const memberAuthGateway = {
    async findUserByRfid(tag) { return tag === "9E23215E" ? member : null; },
    async recordLoginEvent({ eventId, method, username }) {
      if (events.has(eventId)) return false;
      events.set(eventId, { method, username });
      return true;
    },
    async findDisciplinesByUsername() { return []; },
  };
  const app = {
    post(path, handler) { routes.set(`POST ${path}`, handler); },
    get(path, handler) { routes.set(`GET ${path}`, handler); },
  };
  const { processRfidCheckIn } = registerAuthRoutes({
    app, memberAuthGateway, rfidMachineId: "pi-1", getDeactivatedRfidTag: (tag) => `${tag}-deactivated`,
    syncMemberStatusWithFees: async (user) => user,
    getUtcTimestampParts: () => ["2026-10-04", "12:00:00"],
    getSessionUsername: () => "kiosk", getCsrfToken: () => "csrf",
    createSessionCookie: () => "session=archer", createCsrfCookie: () => "csrf=csrf",
    buildMemberUserProfile: (user) => ({ auth: { username: user.username } }),
    auditChangeLogger: { async recordEntityChange(entry) { audits.push(entry); } },
    serverEventBus: { broadcastToAll(type, payload) { broadcasts.push({ type, payload }); } },
  });
  async function post(path, body) {
    const res = {
      statusCode: 200, headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; },
      json(value) { this.body = value; },
    };
    await routes.get(`POST ${path}`)({ body }, res);
    return res;
  }
  return { processRfidCheckIn, post, events, audits, broadcasts };
}

test("headless check-in, duplicate delivery and kiosk login share one attendance event", async () => {
  const h = harness();
  const first = await h.processRfidCheckIn({ rfidTag: "9E23215E", scan: scan(1) });
  assert.equal(first.created, true);
  assert.equal(h.events.size, 1);
  assert.deepEqual([...h.events.values()][0], { method: "rfid", username: "archer" });
  assert.equal((await h.processRfidCheckIn({ rfidTag: "9E23215E", scan: scan(1) })).created, false);
  const login = await h.post("/api/auth/rfid", { rfidTag: "9E23215E", scan: scan(1) });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.userProfile.auth.username, "archer");
  assert.equal(login.headers["Set-Cookie"].length, 2);
  assert.equal(h.events.size, 1);
  const kioskCheckIn = await h.post("/api/auth/rfid/check-in", { rfidTag: "9E23215E", scan: scan(1) });
  assert.equal(kioskCheckIn.body.username, "archer");
  assert.equal(h.events.size, 1);
  assert.equal(h.broadcasts.length, 1);
  assert.equal(h.audits.filter((entry) => entry.entityType === "member_activity").length, 1);
  await h.processRfidCheckIn({ rfidTag: "9E23215E", scan: scan(2) });
  assert.equal(h.events.size, 2);
});

test("unknown fob creates no attendance and preserves safe failed-auth audit", async () => {
  const h = harness();
  const result = await h.processRfidCheckIn({ rfidTag: "DEADBEEF", scan: scan(1) });
  assert.equal(result.status, 401);
  assert.equal(h.events.size, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(h.audits[0].after.failureReason, "rfid_tag_not_recognised");
  assert.doesNotMatch(JSON.stringify(h.audits), /DEADBEEF/);
});
