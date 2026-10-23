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
    listEntriesByYear: async (year) => entries.filter((row) => row.seasonYear === year),
    listAvailableYears: async () => [...new Set(entries.map((row) => row.seasonYear))].sort((a, b) => b - a),
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
  assert.equal(h.entries[0].scores[300], "2026-09-02");
  assert.equal(h.entries[0].scores[475], "2026-09-02");
  assert.equal(h.entries[0].scores[525], undefined);
  assert.equal((await h.call("GET", "/api/indoor-table")).body.rows.length, 1);
  const updated = (await h.call("PUT", "/api/indoor-table/:id", {
    body: { ...payload, handicap: 25, scores: { 400: "2026-08-20", 500: "2026-09-02" } },
  })).body.entry;
  assert.equal(updated.handicap, 25);
  assert.equal(updated.scores[400], "2026-08-20");
  assert.equal(updated.scores[375], "2026-09-02");
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

test("all-season GET returns current and historical rows without combining their awards", async () => {
  const h = setup();
  h.entries.push({ id: 1, seasonYear: 2024, archerUsername: "Cfleetham", bowType: "Rec",
    handicap: null, classifications: {}, scores: { 400: "2025-03-20" } });
  h.entries.push({ id: 2, seasonYear: 2026, archerUsername: "Cfleetham", bowType: "Rec",
    handicap: 31, classifications: {}, scores: {} });
  const response = await h.call("GET", "/api/indoor-table", { year: "all" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.seasonYear, null);
  assert.deepEqual(response.body.availableYears, [2026, 2024]);
  assert.deepEqual(response.body.rows.map((row) => row.seasonYear), [2026, 2024]);
  assert.equal(response.body.rows[0].scores[400], undefined);
  assert.equal(response.body.rows[1].scores[400], "2025-03-20");
});

test("stale profile save retains newly synced scores and fills lower awards", async () => {
  const h = setup();
  h.entries.push({ id: 1, seasonYear: 2026, archerUsername: "archer", bowType: "Rec", handicap: 30,
    classifications: {}, scores: { 500: "2026-10-02", 550: "2026-10-03" } });
  const response = await h.call("PUT", "/api/indoor-table/:id", { body: {
    ...payload, scores: { 500: "2026-10-02", 475: "2026-10-01" },
    originalScores: { 500: "2026-10-02" }, originalClassifications: {},
  } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.entry.scores[550], "2026-10-03");
  assert.equal(response.body.entry.scores[475], "2026-10-01");
  assert.equal(response.body.entry.scores[300], "2026-10-01");
});
