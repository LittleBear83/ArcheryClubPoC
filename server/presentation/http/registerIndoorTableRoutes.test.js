import assert from "node:assert/strict";
import test from "node:test";
import { registerIndoorTableRoutes } from "./registerIndoorTableRoutes.js";

function setup({ backfill } = {}) {
  const routes = new Map();
  const entries = [];
  const events = [];
  const audits = [];
  const app = Object.fromEntries(["get", "post", "put", "delete"].map((method) =>
    [method, (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler)]));
  const gateway = {
    listEntriesByYear: async () => entries,
    listAvailableYears: async () => [2026],
    findEntryById: async (id) => entries.find((row) => row.id === id),
    findDuplicate: async (payload) => entries.find((row) => row.seasonYear === payload.seasonYear &&
      row.archerUsername === payload.archerUsername && row.bowType === payload.bowType && row.id !== payload.excludeId),
    createEntry: async (payload) => { const row = { id: entries.length + 1, ...payload }; entries.push(row); return row; },
    updateEntry: async (payload) => { const index = entries.findIndex((row) => row.id === payload.id); entries[index] = payload; return payload; },
    deleteEntry: async (id) => { entries.splice(entries.findIndex((row) => row.id === id), 1); },
  };
  registerIndoorTableRoutes({ app, actorHasPermission: () => true,
    auditChangeLogger: { recordEntityChange: async (event) => { audits.push(event); } },
    getActorUser: (req) => req.actor, getUtcTimestampParts: () => ["2026-10-01", "12:00:00"],
    indoorTableGateway: gateway,
    goldenRecordsMemberSyncService: backfill ? { backfillIndoorTableFromStoredSnapshots: backfill } : undefined,
    memberAuthGateway: { findUserByUsername: async () => ({ username: "archer" }),
      findDisciplinesByUsername: async () => [{ discipline: "Recurve Bow" }] },
    PERMISSIONS: { MANAGE_MEMBERS: "manage_members" },
    serverEventBus: { broadcastToAll: (event) => events.push(event) } });
  async function call(method, path, { actor = { username: "manager" }, body = {}, id = "1", year = "2026" } = {}) {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; } };
    await routes.get(`${method} ${path}`)({ actor, body, params: { id }, query: { year } }, response);
    return response;
  }
  return { call, entries, events, audits };
}

const payload = { seasonYear: 2026, archerUsername: "archer", bowType: "Rec", handicap: 30,
  classifications: { archer3rd: "2026-09-01" }, scores: { 500: "2026-09-02" } };

test("indoor routes create, read, update and delete with audit and SSE", async () => {
  const h = setup();
  assert.equal((await h.call("POST", "/api/indoor-table", { body: payload })).statusCode, 201);
  assert.equal((await h.call("GET", "/api/indoor-table")).body.rows.length, 1);
  assert.equal((await h.call("PUT", "/api/indoor-table/:id", { body: { ...payload, handicap: 25 } })).body.entry.handicap, 25);
  assert.equal((await h.call("DELETE", "/api/indoor-table/:id")).statusCode, 200);
  assert.equal(h.entries.length, 0);
  assert.deepEqual(h.events, ["indoor-table.updated", "indoor-table.updated", "indoor-table.updated"]);
  assert.deepEqual(h.audits.map((event) => event.action), ["created", "updated", "deleted"]);
});

test("indoor routes reject invalid handicap, false discipline, duplicate and self sign-off", async () => {
  const h = setup();
  assert.equal((await h.call("POST", "/api/indoor-table", { body: { ...payload, handicap: 151 } })).statusCode, 400);
  assert.equal((await h.call("POST", "/api/indoor-table", { body: { ...payload, bowType: "Comp" } })).statusCode, 400);
  assert.equal((await h.call("POST", "/api/indoor-table", { body: payload, actor: { username: "archer" } })).statusCode, 403);
  assert.equal((await h.call("POST", "/api/indoor-table", { body: payload })).statusCode, 201);
  assert.equal((await h.call("POST", "/api/indoor-table", { body: payload })).statusCode, 409);
});

test("current-year GET backfills stored snapshots once before returning rows", async () => {
  let calls = 0;
  const h = setup({ backfill: async () => { calls += 1; h.entries.push({ id: 1,
    seasonYear: new Date().getUTCFullYear(), archerUsername: "archer", bowType: "Rec",
    handicap: 78, classifications: {}, scores: {} }); return 1; } });
  const year = String(new Date().getUTCFullYear());
  assert.equal((await h.call("GET", "/api/indoor-table", { year })).body.rows[0].handicap, 78);
  assert.equal((await h.call("GET", "/api/indoor-table", { year })).body.rows.length, 1);
  assert.equal(calls, 1);
});
