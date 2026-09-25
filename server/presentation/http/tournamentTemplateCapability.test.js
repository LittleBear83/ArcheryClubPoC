import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { getSeedUsers } from "../../infrastructure/persistence/seedUsers.js";
import { bootstrapPersistence } from "../../bootstrap/bootstrapPersistence.js";
import { createSqliteScheduleTournamentStatements } from "../../infrastructure/persistence/createSqliteScheduleTournamentStatements.js";
import { createTournamentGateway } from "../../infrastructure/persistence/tournamentGateway.js";
import { normalizeTournamentTemplateDefinition } from "../../domain/services/tournamentTemplateService.js";
import { parseTournamentRoundPlan } from "../../domain/services/tournamentRoundPlan.js";
import { registerTournamentRoutes } from "./registerTournamentRoutes.js";

const oldTemplate = {
  key: "standard-knockout", label: "Standard knockout", tournamentType: "head-to-head",
  format: "knockout", roundType: "portsmouth", defaults: {},
  capabilities: { supportsRandomizedDraw: false },
};

async function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  await bootstrapPersistence({
    db, defaultEquipmentCupboardLabel: "Test", committeeRoleSeed: [],
    currentPermissionKeys: [], currentPermissionSqlPlaceholders: "", permissionDefinitions: [],
    systemRoleDefinitions: [...new Set(getSeedUsers({ hashPassword: (password) => password, isLive: false }).map((user) => user.userType))].map((roleKey) => ({ roleKey, title: roleKey, permissions: [] })), runtime: { databaseEngine: "sqlite", isLive: false },
    hashPassword: (password) => password, isPasswordHash: () => true,
  });
  const gateway = createTournamentGateway({
    databaseEngine: "sqlite", ...createSqliteScheduleTournamentStatements(db),
  });
  const handlers = new Map();
  const app = { use() {} };
  for (const method of ["get", "post", "put", "delete"]) {
    app[method] = (path, handler) => handlers.set(`${method} ${path}`, handler);
  }
  registerTournamentRoutes({
    app, tournamentGateway: gateway,
    getActorUser: (req) => req.actor,
    actorHasPermission: (actor) => actor.username === "Cfleetham",
    PERMISSIONS: { MANAGE_TOURNAMENTS: "manage_tournaments" },
    TOURNAMENT_TEMPLATE_OPTIONS: [oldTemplate],
    TOURNAMENT_TYPE_OPTIONS: [{ value: "head-to-head" }],
    getUtcTimestampParts: () => ["2026-09-19", "12:00:00"],
    toUtcDateString: () => "2026-09-19",
    buildTournament: (row) => ({
      id: row.id, randomiseEveryRound: parseTournamentRoundPlan(row.round_schedule_json).draw?.randomiseEveryRound ?? false,
      currentRoundNumber: 1, bracket: { rounds: [] }, roundSchedule: [], engine: { rounds: [] },
    }),
    memberDirectoryGateway: {},
  });
  async function call(method, path, body = {}, params = {}, actor = { username: "Cfleetham" }) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handlers.get(`${method} ${path}`)({ body, params, actor }, res);
    return res;
  }
  return { db, gateway, call };
}

const tournamentPayload = (templateKey) => ({
  name: "Test tournament", templateKey, tournamentType: "head-to-head",
  registrationStartDate: "2026-10-01", registrationEndDate: "2026-10-02",
});

test("old templates default to false without coupling the two randomisation settings", () => {
  assert.equal(normalizeTournamentTemplateDefinition(oldTemplate).capabilities.randomiseEveryRound, false);
  const independent = normalizeTournamentTemplateDefinition({ ...oldTemplate, capabilities: { randomiseEveryRound: true, supportsRandomizedDraw: false } });
  assert.equal(independent.capabilities.randomiseEveryRound, true);
  assert.equal(independent.capabilities.supportsRandomizedDraw, false);
});

test("template create, reload and edit round-trip through SQLite capabilities JSON", async (t) => {
  const { db, call } = await fixture(t);
  const created = await call("post", "/api/tournament-templates", {
    label: "Random rounds", baseTemplateKey: oldTemplate.key, capabilities: { randomiseEveryRound: true },
  });
  assert.equal(created.code, 201);
  const key = created.body.tournamentTemplate.key;
  assert.equal(JSON.parse(db.prepare("SELECT capabilities_json FROM tournament_templates WHERE template_key = ?").get(key).capabilities_json).randomiseEveryRound, true);
  const loaded = await call("get", "/api/tournament-templates");
  assert.equal(loaded.body.tournamentTemplates.find((entry) => entry.key === key).capabilities.randomiseEveryRound, true);
  const edited = await call("put", "/api/tournament-templates/:key", {
    label: "Updated rounds", capabilities: { randomiseEveryRound: false },
  }, { key });
  assert.equal(edited.code, 200);
  assert.equal(edited.body.tournamentTemplate.key, key);
  assert.equal(edited.body.tournamentTemplate.capabilities.randomiseEveryRound, false);
  assert.equal(JSON.parse(db.prepare("SELECT capabilities_json FROM tournament_templates WHERE template_key = ?").get(key).capabilities_json).randomiseEveryRound, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM tournament_templates").get().count, 1);
});

test("new tournaments inherit true/false from templates, ignoring a conflicting request flag", async (t) => {
  const { call, gateway } = await fixture(t);
  for (const value of [false, true]) {
    await call("put", "/api/tournament-templates/:key", {
      label: oldTemplate.label, capabilities: { randomiseEveryRound: value },
    }, { key: oldTemplate.key });
    const result = await call("post", "/api/tournaments", {
      ...tournamentPayload(oldTemplate.key), randomiseEveryRound: !value,
    });
    assert.equal(result.code, 201);
    const row = await gateway.findTournamentById(result.body.tournament.id);
    assert.equal(parseTournamentRoundPlan(row.round_schedule_json).draw.randomiseEveryRound, value);
    assert.equal(JSON.parse(row.template_definition_json).capabilities.randomiseEveryRound, value);
  }
});

test("template edits and ordinary tournament edits retain existing tournament values and snapshots", async (t) => {
  const { call, gateway } = await fixture(t);
  for (const value of [true, false]) {
    await call("put", "/api/tournament-templates/:key", {
      label: oldTemplate.label, capabilities: { randomiseEveryRound: value },
    }, { key: oldTemplate.key });
    const created = await call("post", "/api/tournaments", tournamentPayload(oldTemplate.key));
    const id = created.body.tournament.id;
    const original = await gateway.findTournamentById(id);
    await call("put", "/api/tournament-templates/:key", {
      label: oldTemplate.label, capabilities: { randomiseEveryRound: !value },
    }, { key: oldTemplate.key });
    assert.deepEqual(await gateway.findTournamentById(id), original, "template update must not write tournament rows");
    const next = await call("post", "/api/tournaments", {
      ...tournamentPayload(oldTemplate.key), name: `New tournament after ${value}`,
    });
    assert.equal(next.code, 201);
    assert.equal(
      parseTournamentRoundPlan((await gateway.findTournamentById(next.body.tournament.id)).round_schedule_json).draw.randomiseEveryRound,
      !value,
      "new tournament must inherit the changed template value",
    );
    const edited = await call("put", "/api/tournaments/:id", {
      ...tournamentPayload(oldTemplate.key), name: "Renamed tournament", randomiseEveryRound: !value,
    }, { id });
    assert.equal(edited.code, 200);
    assert.equal(parseTournamentRoundPlan((await gateway.findTournamentById(id)).round_schedule_json).draw.randomiseEveryRound, value);
  }
});

test("legacy templates and tournaments without the new field retain false", async (t) => {
  const { call, db, gateway } = await fixture(t);
  const created = await call("post", "/api/tournaments", tournamentPayload(oldTemplate.key));
  const id = created.body.tournament.id;
  assert.equal(created.body.tournament.randomiseEveryRound, false);
  db.prepare("UPDATE tournaments SET round_schedule_json = '[]' WHERE id = ?").run(id);
  await call("put", "/api/tournament-templates/:key", { label: oldTemplate.label, capabilities: { randomiseEveryRound: true } }, { key: oldTemplate.key });
  const edited = await call("put", "/api/tournaments/:id", tournamentPayload(oldTemplate.key), { id });
  assert.equal(edited.code, 200);
  assert.equal(parseTournamentRoundPlan((await gateway.findTournamentById(id)).round_schedule_json).draw?.randomiseEveryRound ?? false, false);
});

test("template updates require permission and an existing template", async (t) => {
  const { call } = await fixture(t);
  for (const actor of [null, { username: "member" }]) {
    assert.equal((await call("put", "/api/tournament-templates/:key", { label: "Changed" }, { key: oldTemplate.key }, actor)).code, 403);
  }
  assert.equal((await call("put", "/api/tournament-templates/:key", { label: "Changed" }, { key: "missing" })).code, 404);
});

test("PostgreSQL template update uses parameterised JSON and keeps the template identity", async () => {
  const queries = [];
  const gateway = createTournamentGateway({ databaseEngine: "postgres", pool: { query: async (sql, values) => {
    queries.push({ sql, values });
    return { rows: [{ template_key: "custom", capabilities_json: '{"randomiseEveryRound":true}' }] };
  } } });
  const row = await gateway.updateTournamentTemplate({ templateKey: "custom", label: "Edited", capabilitiesJson: '{"randomiseEveryRound":true}' });
  assert.match(queries[0].sql, /UPDATE tournament_templates/);
  assert.deepEqual(queries[0].values, ["Edited", "", "{}", '{"randomiseEveryRound":true}', null, "custom"]);
  assert.equal(row.template_key, "custom");
});
