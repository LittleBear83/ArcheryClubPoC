import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import pg from "pg";
import express from "express";
import { registerTournamentRoutes } from "../../presentation/http/registerTournamentRoutes.js";
import { buildTournamentBracket } from "../../domain/services/tournamentEngine.js";
import { parseTournamentRoundPlan } from "../../domain/services/tournamentRoundPlan.js";
import { assertSafeIntegrationEnvironment, assertSafeTemporaryDatabaseName, TEST_DATABASE_PREFIX } from "./phase2a1PostgresIntegrationGuards.js";
import { runPostgresMigrations } from "./runPostgresMigrations.js";
import { createTournamentGateway } from "./tournamentGateway.js";
import { createSyncGateway } from "./syncGateway.js";
import { applyAuthChanges } from "../../domain/services/localDatabaseSyncService.js";

let admin, cloud, pi, gateway, tournament;
const databases = [], pools = [];
before(async () => {
  assertSafeIntegrationEnvironment(process.env);
  admin = new pg.Pool({ database: "postgres" });
  for (const label of ["tournament_cloud", "tournament_pi"]) {
    const name = `${TEST_DATABASE_PREFIX}${label}_${randomUUID().replaceAll("-", "")}`;
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`CREATE DATABASE "${name}"`);
    databases.push(name);
    const pool = new pg.Pool({ database: name });
    pools.push(pool);
    await runPostgresMigrations({ pool, committeeRoleSeed: [], defaultEquipmentCupboardLabel: "Test", permissionDefinitions: [], seedUsers: [], systemRoleDefinitions: [{ roleKey: "member", title: "Member", permissions: [] }] });
    await pool.query("INSERT INTO users (username, first_name, surname) VALUES ('captain', 'Club', 'Captain'), ('robin', 'Robin', 'Archer'), ('marian', 'Marian', 'Archer')");
    await pool.query("INSERT INTO user_types (username, user_type) SELECT username, 'member' FROM users");
  }
  [cloud, pi] = pools;
  gateway = createTournamentGateway({ databaseEngine: "postgres", pool: cloud });
  tournament = await gateway.createTournament({ name: "Setup shoot", tournamentType: "head-to-head", registrationStartDate: "2026-10-01", registrationEndDate: "2026-10-10", scoreSubmissionStartDate: "2026-10-11", scoreSubmissionEndDate: "2026-10-20", createdByUsername: "captain", timestampParts: ["2026-10-05", "12:00:00"] });
});
after(async () => {
  await Promise.all(pools.map((pool) => pool.end()));
  for (const name of databases) {
    assertSafeTemporaryDatabaseName(name);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await admin?.end();
});

const registration = (username, extra = {}) => ({ tournamentId: tournament.id, username, bowCode: "BB", timestampParts: ["2026-10-05", "12:00:00"], ...extra });

test("PostgreSQL additions persist, deduplicate concurrent retries and replicate to Pi without an echo", async () => {
  assert.equal((await gateway.listTournamentRegistrationsByTournamentId(tournament.id)).length, 0);
  const results = await Promise.allSettled([gateway.registerForTournament(registration("robin")), gateway.registerForTournament(registration("robin"))]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "23505");
  await gateway.registerForTournament(registration("marian"));
  assert.equal((await gateway.listTournamentRegistrationsByTournamentId(tournament.id)).length, 2);
  const rows = await createSyncGateway({ pool: cloud }).listChangesAfterCheckpoint({ checkpoint: 0, limit: 200 });
  const changes = rows.filter((row) => ["tournaments", "tournament_registrations"].includes(row.domain));
  assert.ok(changes.some((change) => change.domain === "tournament_registrations"));
  const before = Number((await pi.query("SELECT COUNT(*) AS count FROM sync_change_log")).rows[0].count);
  const client = await pi.connect();
  try {
    for (let retry = 0; retry < 2; retry++) {
      await client.query("BEGIN");
      await client.query("SELECT set_config('archery.sync.apply_mode', 'pull', true)");
      await applyAuthChanges({ client, changes, deactivatedRfidSuffix: "-deactivated" });
      await client.query("COMMIT");
    }
  } finally { client.release(); }
  const local = await pi.query("SELECT member_username, bow_code FROM tournament_registrations ORDER BY member_username");
  assert.deepEqual(local.rows, [{ member_username: "marian", bow_code: "BB" }, { member_username: "robin", bow_code: "BB" }]);
  assert.equal(Number((await pi.query("SELECT COUNT(*) AS count FROM sync_change_log")).rows[0].count), before);
  assert.equal(Number((await cloud.query("SELECT COUNT(*) AS count FROM sync_local_outbox")).rows[0].count), 0);
});

test("PostgreSQL registration and draw reset roll back together on failure", async () => {
  await cloud.query("INSERT INTO users (username, first_name, surname) VALUES ('new-archer', 'New', 'Archer')");
  await cloud.query("INSERT INTO user_types (username, user_type) VALUES ('new-archer', 'member')");
  await cloud.query(`CREATE FUNCTION reject_tournament_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture reset failure'; END $$`);
  await cloud.query("CREATE TRIGGER reject_reset BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION reject_tournament_reset()");
  await assert.rejects(gateway.registerForTournament(registration("new-archer", { resetRoundPlanJson: "[]" })), /fixture reset failure/);
  assert.equal((await cloud.query("SELECT * FROM tournament_registrations WHERE member_username = 'new-archer'")).rowCount, 0);
  await cloud.query("DROP TRIGGER reject_reset ON tournaments");
  await gateway.registerForTournament(registration("new-archer", { resetRoundPlanJson: "[]" }));
  assert.equal((await gateway.listTournamentRegistrationsByTournamentId(tournament.id)).length, 3);
});

test("PostgreSQL manager HTTP additions rebuild atomically; failures preserve the draw and Pi refuses writes", async (t) => {
  await cloud.query("INSERT INTO users (username, first_name, surname) VALUES ('api-archer', 'API', 'Archer'), ('failed-archer', 'Failed', 'Archer')");
  await cloud.query("INSERT INTO user_types (username, user_type) VALUES ('api-archer', 'member'), ('failed-archer', 'member')");
  const audits = [], notifications = [];
  async function start(pool, isLocalPiNode) {
    const app = express();
    app.use(express.json());
    registerTournamentRoutes({ app, isLocalPiNode,
      tournamentGateway: createTournamentGateway({ databaseEngine: "postgres", pool }),
      getActorUser: (req) => ({ username: req.headers["x-actor"] ?? "captain" }),
      actorHasPermission: (actor) => actor.username === "captain",
      PERMISSIONS: { MANAGE_TOURNAMENTS: "manage_tournaments" }, TOURNAMENT_TEMPLATE_OPTIONS: [],
      toUtcDateString: () => "2026-11-01", getUtcTimestampParts: () => ["2026-11-01", "12:00:00"],
      memberDirectoryGateway: {
        async listAllUsers() { return (await pool.query("SELECT * FROM users")).rows; },
        async findUserByUsername(username) { return (await pool.query("SELECT * FROM users WHERE username = $1", [username])).rows[0]; },
        async findDisciplinesByUsername() { return ["Bare Bow"]; },
      },
      auditChangeLogger: { async recordEntityChange(event) { audits.push(event); } },
      serverEventBus: { broadcastToAll(...args) { notifications.push(args); } },
      buildTournament: (row, registrations) => {
        const plan = parseTournamentRoundPlan(row.round_schedule_json);
        const bracket = buildTournamentBracket(registrations.map((entry) => ({ username: entry.member_username, fullName: `${entry.first_name} ${entry.surname}` })), new Map(), new Map(), { frozenDrawOrderUsernames: plan.draw?.orderUsernames, roundPairings: plan.draw?.roundPairings });
        return { id: row.id, registrations, registrationCount: registrations.length,
          currentRoundNumber: bracket.currentRoundNumber, bracket, roundSchedule: [],
          engine: { rounds: bracket.rounds.map((round) => ({ ...round, matches: round.matches.map((match) => ({ competitorA: match.leftParticipant, competitorB: match.rightParticipant, winner: match.winner, status: match.status })) })) } };
      },
    });
    const server = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const cloudUrl = await start(cloud, false);
  const piUrl = await start(pi, true);
  const add = (base, memberUsername, actor = "captain", confirmRedraw = false) => fetch(`${base}/api/tournaments/${tournament.id}/register`, {
    method: "POST", headers: { "content-type": "application/json", "x-actor": actor }, body: JSON.stringify({ memberUsername, bowCode: "BB", confirmRedraw }),
  });
  assert.equal((await add(cloudUrl, "api-archer", "robin")).status, 400, "ordinary self-registration retains closed dates");
  assert.equal((await add(piUrl, "api-archer")).status, 503);
  const added = await add(cloudUrl, "api-archer");
  assert.equal(added.status, 200);
  assert.equal((await added.json()).tournament.registrationCount, 4);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorUsername, "captain");
  assert.equal(audits[0].after.username, "api-archer");
  assert.equal((await add(cloudUrl, "API-ARCHER")).status, 409);
  assert.equal((await add(cloudUrl, "failed-archer")).status, 409, "unplayed persisted bracket needs confirmation");
  const before = (await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows;
  const beforeTournament = await gateway.findTournamentById(tournament.id);
  const beforeLogCount = (await cloud.query("SELECT COUNT(*) FROM sync_change_log")).rows[0].count;
  await cloud.query(`CREATE FUNCTION reject_match_rebuild() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rebuild failure'; END $$`);
  await cloud.query("CREATE TRIGGER reject_rebuild BEFORE INSERT ON tournament_matches FOR EACH ROW EXECUTE FUNCTION reject_match_rebuild()");
  assert.equal((await add(cloudUrl, "failed-archer", "captain", true)).status, 500);
  assert.equal((await cloud.query("SELECT * FROM tournament_registrations WHERE member_username = 'failed-archer'")).rowCount, 0);
  assert.deepEqual((await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows, before);
  assert.deepEqual(await gateway.findTournamentById(tournament.id), beforeTournament);
  assert.equal((await cloud.query("SELECT COUNT(*) FROM sync_change_log")).rows[0].count, beforeLogCount);
  assert.equal(audits.length, 1);
  assert.equal(notifications.length, 1);
  await cloud.query("DROP TRIGGER reject_rebuild ON tournament_matches");
  assert.equal((await add(cloudUrl, "failed-archer", "captain", true)).status, 200);
  assert.equal((await gateway.listTournamentRegistrationsByTournamentId(tournament.id)).length, 5);
  const currentMatches = (await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows;
  await assert.rejects(gateway.registerForTournament(registration("api-archer", { resetRoundPlanJson: "[]" })), (error) => error.code === "23505");
  assert.deepEqual((await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows, currentMatches, "failed registration must not reset the draw");
  await cloud.query("UPDATE tournament_matches SET left_score = 0, status = 'disputed', disputed_by_username = 'robin', dispute_reason = 'Score disputed' WHERE tournament_id = $1 AND round_number = 1 AND match_number = 1", [tournament.id]);
  const disputedMatches = (await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows;
  assert.equal((await add(cloudUrl, "captain", "captain", true)).status, 409);
  assert.deepEqual((await cloud.query("SELECT * FROM tournament_matches ORDER BY round_number, match_number")).rows, disputedMatches, "confirmation cannot erase a score or dispute");
});
