import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { bootstrapPersistence } from "../../bootstrap/bootstrapPersistence.js";
import { getSeedUsers } from "../../infrastructure/persistence/seedUsers.js";
import { createSqliteScheduleTournamentStatements } from "../../infrastructure/persistence/createSqliteScheduleTournamentStatements.js";
import { createTournamentGateway } from "../../infrastructure/persistence/tournamentGateway.js";
import { registerTournamentRoutes } from "./registerTournamentRoutes.js";
import { tournamentRegistrationPolicy } from "../../domain/services/tournamentRegistrationPolicy.js";
import { buildTournamentBracket } from "../../domain/services/tournamentEngine.js";
import { parseTournamentRoundPlan } from "../../domain/services/tournamentRoundPlan.js";

async function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  await bootstrapPersistence({ db, defaultEquipmentCupboardLabel: "Test", committeeRoleSeed: [],
    currentPermissionKeys: [], currentPermissionSqlPlaceholders: "", permissionDefinitions: [],
    systemRoleDefinitions: [...new Set(getSeedUsers({ hashPassword: (value) => value, isLive: false }).map((user) => user.userType))].map((roleKey) => ({ roleKey, title: roleKey, permissions: [] })),
    runtime: { databaseEngine: "sqlite", isLive: false }, hashPassword: (value) => value, isPasswordHash: () => true });
  const gateway = createTournamentGateway({ databaseEngine: "sqlite", db, ...createSqliteScheduleTournamentStatements(db) });
  const users = db.prepare("SELECT * FROM users ORDER BY username").all();
  const manager = users.find((user) => user.username === "Cfleetham");
  const members = users.filter((user) => user.username !== manager.username).slice(0, 3);
  const handlers = new Map();
  const audits = [], notifications = [];
  const app = { use() {} };
  for (const method of ["get", "post", "put", "delete"]) app[method] = (path, handler) => handlers.set(`${method} ${path}`, handler);
  const template = { key: "test-knockout", label: "Test", tournamentType: "head-to-head", format: "knockout", roundType: "portsmouth", defaults: {}, capabilities: {} };
  registerTournamentRoutes({ app, tournamentGateway: gateway, getActorUser: (req) => req.actor,
    actorHasPermission: (actor) => actor.username === manager.username,
    PERMISSIONS: { MANAGE_TOURNAMENTS: "manage_tournaments" },
    TOURNAMENT_TEMPLATE_OPTIONS: [template], TOURNAMENT_TYPE_OPTIONS: [{ value: "head-to-head" }],
    getUtcTimestampParts: () => ["2026-10-05", "12:00:00"], toUtcDateString: () => "2026-10-05",
    memberDirectoryGateway: { async listAllUsers() { return users; }, async findUserByUsername(username) { return users.find((user) => user.username === username); }, async findDisciplinesByUsername() { return ["Recurve Bow", "Bare Bow"]; } },
    auditChangeLogger: { async recordEntityChange(event) { audits.push(event); } },
    serverEventBus: { broadcastToAll(...args) { notifications.push(args); } },
    buildTournament: (row, registrations) => {
      const plan = parseTournamentRoundPlan(row.round_schedule_json);
      const bracket = buildTournamentBracket(registrations.map((entry) => ({ username: entry.member_username, fullName: `${entry.first_name} ${entry.surname}`, bowCode: entry.bow_code })), new Map(), new Map(), {
        frozenDrawOrderUsernames: plan.draw?.orderUsernames, roundPairings: plan.draw?.roundPairings,
      });
      return { id: row.id, name: row.name, registrations, registrationCount: registrations.length,
        currentRoundNumber: bracket.currentRoundNumber, bracket, roundSchedule: [],
        engine: { rounds: bracket.rounds.map((round) => ({ ...round, matches: round.matches.map((match) => ({
          competitorA: match.leftParticipant, competitorB: match.rightParticipant,
          score: { competitorA: match.leftScore, competitorB: match.rightScore }, winner: match.winner, status: match.status,
        })) })) } };
    },
  });
  async function call(method, path, body = {}, params = {}, actor = manager) {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await handlers.get(`${method} ${path}`)({ body, params, actor }, res);
    return res;
  }
  const created = await call("post", "/api/tournaments", { name: "Setup shoot", templateKey: template.key,
    tournamentType: "head-to-head", registrationStartDate: "2026-11-01", registrationEndDate: "2026-11-02" });
  assert.equal(created.code, 201);
  const id = created.body.tournament.id;
  const add = (user, extra = {}, actor = manager) => call("post", "/api/tournaments/:id/register", { memberUsername: user.username, bowCode: "BB", ...extra }, { id }, actor);
  return { db, gateway, call, created, id, manager, members, add, audits, notifications };
}

test("empty setup accepts incremental manager additions, reloads, audits and rejects case/retry duplicates", async (t) => {
  const f = await fixture(t);
  assert.equal(f.created.body.tournament.registrationCount, 0);
  for (const member of f.members.slice(0, 2)) assert.equal((await f.add(member)).code, 200);
  const rows = await f.gateway.listTournamentRegistrationsByTournamentId(f.id);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.bow_code === "BB"));
  assert.equal((await f.add({ username: f.members[0].username.toUpperCase() })).code, 409);
  assert.equal((await f.add(f.members[0])).code, 409);
  const audit = f.audits.filter((event) => event.entityType === "tournament_registration");
  assert.equal(audit.length, 2);
  assert.equal(audit[0].actorUsername, f.manager.username);
  assert.equal(audit[0].after.username, f.members[0].username);
  assert.equal(audit[0].after.tournamentId, f.id);
  assert.equal(audit[0].changedAtDate, "2026-10-05");
  assert.ok(f.notifications.some(([name, event]) => name === "tournaments.updated" && event.scope === "tournaments.register"));
});

test("ordinary member permissions and registration dates remain enforced; removal still works", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.add(f.members[0], {}, f.members[0])).code, 400);
  f.db.prepare("UPDATE tournaments SET registration_start_date = '2026-10-01', registration_end_date = '2026-10-10' WHERE id = ?").run(f.id);
  assert.equal((await f.add(f.members[1], {}, f.members[0])).code, 403);
  assert.equal((await f.add(f.members[0], {}, f.members[0])).code, 200);
  const removed = await f.call("delete", "/api/tournaments/:id/register", { memberUsername: f.members[0].username }, { id: f.id });
  assert.equal(removed.code, 200);
  assert.equal((await f.gateway.listTournamentRegistrationsByTournamentId(f.id)).length, 0);
  assert.equal((await f.call("get", "/api/tournaments/:id/registration-candidates", {}, { id: f.id }, f.members[0])).code, 403);
});

test("closed registration permits manager additions but an existing draw requires explicit confirmation", async (t) => {
  const f = await fixture(t);
  f.db.prepare("UPDATE tournaments SET registration_start_date = '2026-09-01', registration_end_date = '2026-09-02' WHERE id = ?").run(f.id);
  assert.equal((await f.add(f.members[0])).code, 200);
  const plan = JSON.stringify({ mode: "manual", rounds: [], draw: { generatedAt: "2026-09-03", orderUsernames: [f.members[0].username], randomiseEveryRound: true, roundPairings: { 1: [[f.members[0].username, null]] } } });
  f.db.prepare("UPDATE tournaments SET round_schedule_json = ? WHERE id = ?").run(plan, f.id);
  const blocked = await f.add(f.members[1]);
  assert.equal(blocked.code, 409);
  assert.equal(blocked.body.requiresRedraw, true);
  assert.equal((await f.gateway.listTournamentRegistrationsByTournamentId(f.id)).length, 1);
  assert.equal((await f.add(f.members[1], { confirmRedraw: true })).code, 200);
  const saved = JSON.parse((await f.gateway.findTournamentById(f.id)).round_schedule_json);
  assert.equal(saved.draw.randomiseEveryRound, true);
  assert.deepEqual(new Set(saved.draw.roundPairings[1].flat().filter(Boolean)), new Set(f.members.slice(0, 2).map((member) => member.username)));
  const matches = await f.gateway.listTournamentMatchesByTournamentId(f.id);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].left_score, null);
  assert.equal(matches[0].right_score, null);
});

test("scores block additions even with redraw consent and remain unchanged", async (t) => {
  const f = await fixture(t);
  await f.add(f.members[0]);
  await f.gateway.submitTournamentScore({ tournamentId: f.id, roundNumber: 1, username: f.members[0].username, score: 0, timestampParts: ["2026-10-05", "12:00:00"] });
  const before = await f.gateway.listTournamentScoresByTournamentId(f.id);
  assert.equal((await f.add(f.members[1], { confirmRedraw: true })).code, 409);
  assert.deepEqual(await f.gateway.listTournamentScoresByTournamentId(f.id), before);
  assert.equal((await f.gateway.listTournamentRegistrationsByTournamentId(f.id)).length, 1);
});

test("registration policy fails closed for results, completed tournaments and local Pi writes", () => {
  for (const match of [{ left_score: 0, status: "pending" }, { submitted_by_username: "a" }, { status: "disputed" }, { status: "finalised" }, { status: "walkover" }, { winner_username: "a", status: "completed" }]) {
    assert.equal(tournamentRegistrationPolicy({ tournament: {}, matches: [match] }).allowed, false);
  }
  assert.equal(tournamentRegistrationPolicy({ tournament: { status: "completed" } }).allowed, false);
  assert.equal(tournamentRegistrationPolicy({ tournament: {}, isLocalPiNode: true }).allowed, false);
  assert.equal(tournamentRegistrationPolicy({ tournament: { registration_end_date: "2026-01-01" }, matches: [{ status: "bye", winner_username: "a", left_member_username: "a" }] }).requiresRedraw, true);
  assert.equal(tournamentRegistrationPolicy({ tournament: { registration_end_date: "2099-01-01" }, matches: [{ status: "pending", left_member_username: "a" }] }).requiresRedraw, false, "registration previews must not block ordinary self-registration");
});

test("a draw rebuild failure rolls back the participant and emits no success audit or notification", async (t) => {
  const f = await fixture(t);
  const beforeAudits = f.audits.length;
  const beforeNotifications = f.notifications.length;
  f.gateway.replaceTournamentMatches = async () => { throw new Error("fixture rebuild failure"); };
  assert.equal((await f.add(f.members[0])).code, 500);
  assert.equal((await f.gateway.listTournamentRegistrationsByTournamentId(f.id)).length, 0);
  assert.equal(f.audits.length, beforeAudits);
  assert.equal(f.notifications.length, beforeNotifications);
});
