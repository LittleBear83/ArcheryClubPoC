import { registerTournamentRoutes } from "./registerTournamentRoutes.js";
import { buildTournamentBracket } from "../../domain/services/tournamentEngine.js";
import { parseTournamentRoundPlan } from "../../domain/services/tournamentRoundPlan.js";
import http from "node:http";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import express from "express";
import Database from "better-sqlite3";
import { registerCourseDateCancellationRoutes } from "./registerCourseDateCancellationRoutes.js";
import { registerTournamentPairingRoutes } from "./registerTournamentPairingRoutes.js";
import { createBeginnersCourseWriteGateway } from "../../infrastructure/persistence/beginnersCourseWriteGateway.js";
import { hasCourseFinished, isCourseClosed, selectCourseDetails } from "../../../src/presentation/pages/beginnersCourseWorkflow.js";
import { createTournamentWorkflowLock } from "./tournamentWorkflowLock.js";

async function serve(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(async (path, body, username = "coordinator", method = "POST") => {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const request = http.request({ hostname: "127.0.0.1", port: server.address().port, path, method, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), "x-test-user": username } }, (response) => {
          let data = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => { data += chunk; });
          response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
        });
        request.on("error", reject);
        request.end(payload);
      });
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("closed courses retain full attendee details and existing conversion controls", () => {
  const closed = { id: 1, lessons: [{ date: "2026-07-28", endTime: "16:00", isCancelled: false }], beginners: [{ id: 10, attendanceDates: ["2026-07-28"] }] };
  assert.equal(hasCourseFinished(closed, new Date(2026, 6, 28, 16, 1).getTime()), true);
  assert.deepEqual(selectCourseDetails([], [closed], 1), [closed]);
  assert.equal(selectCourseDetails([], [closed], 1)[0].beginners, closed.beginners);
  assert.deepEqual(selectCourseDetails([], [closed], null), []);
  const source = readFileSync(new URL("../../../src/presentation/pages/BeginnersCoursesPage.tsx", import.meta.url), "utf8");
  assert.match(source, /setClosedDetailId\(course.id\)/);
  assert.match(source, /selectCourseDetails\(activeCourses, courses, closedDetailId\)/);
  assert.match(source, /convertBeginnerToMember\(beginner\)/);
  assert.match(source, /submitTransferToBeginnersCourse\(course.id\)/);
  assert.match(source, /Closed/);
});

test("cancel one or multiple dates atomically; history and whole-course cancellation survive", async () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE beginners_course_lessons (id INTEGER PRIMARY KEY, course_id INTEGER, is_cancelled INTEGER NOT NULL DEFAULT 0); INSERT INTO beginners_course_lessons VALUES (1,10,0),(2,10,0),(3,10,0),(4,11,0); CREATE TABLE history (lesson_id INTEGER); INSERT INTO history VALUES (1),(2);");
  const course = { id: 10, course_type: "taster-session", coordinator_username: "coordinator", is_cancelled: 0 };
  const gateway = createBeginnersCourseWriteGateway({ databaseEngine: "sqlite", db, cancelBeginnersCourse: { run: () => { course.is_cancelled = 1; } } });
  const app = express(); app.use(express.json());
  const audit = [];
  registerCourseDateCancellationRoutes({ app, getActorUser: (req) => req.headers["x-test-user"] === "anonymous" ? null : { username: req.headers["x-test-user"] }, actorHasPermission: (actor) => actor.username === "admin", getCourseTypePermissions: () => ({ approve: "approve", manage: "manage" }), beginnersCourseReadGateway: { findCourseById: async () => course, listLessonsByCourseId: async () => db.prepare("SELECT * FROM beginners_course_lessons WHERE course_id = ?").all(10) }, beginnersCourseWriteGateway: gateway, auditChangeLogger: { recordEntityChange: async (event) => { audit.push(event); } }, getUtcTimestampParts: () => ["2026-09-01", "10:00:00"], broadcastBeginnersUpdated: () => {}, broadcastCalendarUpdated: () => {} });
  try {
    await serve(app, async (request) => {
      const path = "/api/beginners-courses/10/cancel-dates";
      assert.equal((await request(path, { lessonIds: [1] }, "member")).status, 403);
      assert.equal((await request(path, { lessonIds: [1] }, "anonymous")).status, 401);
      for (const ids of [[], [1,1], [4], [99]]) assert.equal((await request(path, { lessonIds: ids })).status, 400);
      assert.equal((await request(path, { lessonIds: [1], courseType: "beginners" })).status, 404);
      assert.equal((await request(path, { lessonIds: [1] })).status, 200);
      assert.equal(db.prepare("SELECT is_cancelled FROM beginners_course_lessons WHERE id = 1").get().is_cancelled, 1);
      assert.equal((await request(path, { lessonIds: [1,2] })).status, 400);
      assert.equal(db.prepare("SELECT is_cancelled FROM beginners_course_lessons WHERE id = 2").get().is_cancelled, 0);
      assert.equal((await request(path, { lessonIds: [2,3] })).status, 200);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM beginners_course_lessons WHERE course_id = 10 AND is_cancelled = 1").get().n, 3);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM history").get().n, 2);
      assert.equal(course.is_cancelled, 0);
      assert.equal(audit.length, 2);
      await gateway.cancelCourse({ courseId: 10 });
      assert.equal(course.is_cancelled, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM beginners_course_lessons").get().n, 4);
    });
  } finally { db.close(); }
});

test("local Pi rejects lesson-date cancellation before database access and retains reads", async () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE beginners_course_lessons (id INTEGER PRIMARY KEY, course_id INTEGER, is_cancelled INTEGER NOT NULL DEFAULT 0); INSERT INTO beginners_course_lessons VALUES (1,10,0);");
  const app = express(); app.use(express.json());
  const unexpected = () => { throw new Error("Pi cancellation accessed a gateway or emitted a side effect"); };
  registerCourseDateCancellationRoutes({ app, isLocalPiNode: true, getActorUser: unexpected, beginnersCourseReadGateway: { findCourseById: unexpected, listLessonsByCourseId: unexpected }, beginnersCourseWriteGateway: { cancelLessonDates: unexpected }, auditChangeLogger: { recordEntityChange: unexpected }, broadcastBeginnersUpdated: unexpected, broadcastCalendarUpdated: unexpected });
  app.get("/api/beginners-courses/:id", (_req, res) => res.json(db.prepare("SELECT * FROM beginners_course_lessons WHERE course_id = 10").all()));
  try {
    await serve(app, async (request) => {
      const response = await request("/api/beginners-courses/10/cancel-dates", { lessonIds: [1] });
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, { success: false, message: "Course session date cancellation is cloud-authoritative and unavailable on the Pi." });
      const read = await request("/api/beginners-courses/10", {}, "coordinator", "GET");
      assert.equal(read.status, 200);
      assert.deepEqual(read.body, [{ id: 1, course_id: 10, is_cancelled: 0 }]);
    });
  } finally { db.close(); }
});

test("captain pairing endpoint rejects invalid, unauthorised, future and result-bearing edits", async () => {
  const app = express(); app.use(express.json());
  let round = { roundNumber: 1, matches: [{ leftParticipant: { username: "a" }, rightParticipant: { username: "b" }, status: "scheduled" }, { leftParticipant: { username: "c" }, rightParticipant: null, status: "bye" }] };
  let saved = null;
  let writes = 0;
  registerTournamentPairingRoutes({ app, getActorUser: (req) => ({ username: req.headers["x-test-user"] }), actorHasPermission: (actor) => actor.username === "captain", PERMISSIONS: { MANAGE_TOURNAMENTS: "manage" }, tournamentGateway: { findTournamentById: async () => ({ id: 1, name: "Test", registration_end_date: "2020-01-01" }) }, loadTournamentSnapshot: async () => ({ builtTournament: { currentRoundNumber: 1, bracket: { rounds: [round] } } }), persistRoundPairings: async (_tournament, _number, pairings) => { writes += 1; saved = structuredClone(pairings); return { id: 1 }; }, syncTournamentMatches: async () => ({ builtTournament: { id: 1, pairings: saved } }), getUtcTimestampParts: () => ["2026-09-01", "10:00:00"], broadcastTournamentsUpdated: () => {}, toUtcDateString: () => "2026-09-01" });
  await serve(app, async (request) => {
    const path = "/api/tournaments/1/rounds/1/pairings";
    const valid = [["a", "c"], ["b", null]];
    assert.equal((await request(path, { pairings: valid }, "member", "PUT")).status, 403);
    for (const pairings of [[["a","a"],["c",null]], [["a","b"]], [["a","b"],["x",null]]]) assert.equal((await request(path, { pairings }, "captain", "PUT")).status, 400);
    assert.equal(writes, 0);
    assert.equal((await request(path, { pairings: valid }, "captain", "PUT")).status, 200);
    assert.deepEqual(saved, valid);
    assert.equal((await request("/api/tournaments/1/rounds/2/pairings", { pairings: valid }, "captain", "PUT")).status, 409);
    for (const result of [{ leftScore: 1 }, { status: "finalised" }, { status: "disputed" }, { submittedByUsername: "a" }]) {
      round = { ...round, matches: [{ ...round.matches[0], ...result }, round.matches[1]] };
      assert.equal((await request(path, { pairings: valid }, "captain", "PUT")).status, 409);
    }
    assert.equal(writes, 1);
  });
});

test("tournament workflow serialises concurrent result and pairing operations", async () => {
  const app = express(); app.use(express.json());
  const events = [];
  let unlock;
  const lock = createTournamentWorkflowLock({ acquireWorkflowLock: async () => { events.push("acquire"); return async () => { events.push("release"); }; } });
  app.use(lock);
  app.post("/first", async (_req, res) => { await new Promise((resolve) => { unlock = resolve; }); events.push("first"); res.json({}); });
  app.post("/second", (_req, res) => { events.push("second"); res.json({}); });
  await serve(app, async (request) => {
    const first = request("/first", {});
    while (!unlock) await new Promise((resolve) => setTimeout(resolve, 1));
    const second = request("/second", {});
    unlock();
    await Promise.all([first, second]);
    assert.deepEqual(events, ["acquire", "first", "release", "acquire", "second", "release"]);
  });
});


test("real tournament routes persist random-every-round setup and retain manual pairings on list reload", async () => {
  const handlers = new Map();
  const app = { get: (path, handler) => handlers.set(`GET ${path}`, handler), post: (path, handler) => handlers.set(`POST ${path}`, handler), put: (path, handler) => handlers.set(`PUT ${path}`, handler), delete() {} };
  const registrations = ["a", "b", "c", "d"].map((member_username) => ({ member_username, bow_code: "RC", first_name: member_username, surname: "Archer" }));
  let row;
  let matchRows = [];
  let draws = 0;
  const fromArgs = (args) => ({ id: 1, name: args.name, tournament_type: args.tournamentType, template_key: args.templateKey, template_definition_json: args.templateDefinitionJson, draw_date: args.drawDate, round_schedule_json: args.roundScheduleJson, registration_start_date: args.registrationStartDate, registration_end_date: args.registrationEndDate, score_submission_start_date: args.scoreSubmissionStartDate, score_submission_end_date: args.scoreSubmissionEndDate });
  const gateway = {
    createTournament: async (args) => { row = fromArgs(args); return row; },
    findTournamentById: async () => row,
    updateTournament: async (args) => { row = fromArgs(args); draws += 1; return row; },
    listTournaments: async () => [row],
    listTournamentRegistrationsByTournamentId: async () => registrations,
    listTournamentRoundsByTournamentId: async () => [],
    listTournamentScoresByTournamentId: async () => [],
    listTournamentMatchesByTournamentId: async () => matchRows,
    replaceTournamentRounds: async () => {},
    replaceTournamentMatches: async ({ matches }) => { matchRows = matches; },
  };
  const buildTournament = (tournament) => {
    const plan = parseTournamentRoundPlan(tournament.round_schedule_json);
    const bracket = buildTournamentBracket(registrations.map((registration) => ({ username: registration.member_username, fullName: registration.first_name })), new Map(), new Map(), { roundPairings: plan.draw?.roundPairings });
    return { id: 1, currentRoundNumber: bracket.currentRoundNumber, bracket, roundSchedule: [], engine: { rounds: bracket.rounds.map((round) => ({ ...round, matches: round.matches.map((match) => ({ competitorA: match.leftParticipant, competitorB: match.rightParticipant, score: { competitorA: match.leftScore, competitorB: match.rightScore }, status: match.status, winner: match.winner })) })) } };
  };
  registerTournamentRoutes({ app, getActorUser: () => ({ username: "captain" }), actorHasPermission: () => true, PERMISSIONS: { MANAGE_TOURNAMENTS: "manage" }, tournamentGateway: gateway, buildTournament, buildTournamentDataMaps: async () => ({ matchesByTournamentId: new Map([[1, matchRows]]), registrationsByTournamentId: new Map([[1, registrations]]), roundsByTournamentId: new Map(), scoresByTournamentId: new Map() }), memberDirectoryGateway: {}, TOURNAMENT_TEMPLATE_OPTIONS: [], TOURNAMENT_TYPE_OPTIONS: [{ value: "head-to-head" }], toUtcDateString: () => "2030-01-01", chooseRandomIndex: () => 0, getUtcTimestampParts: () => ["2030-01-01", "10:00:00"] });
  const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const created = response();
  await handlers.get("POST /api/tournaments")({ body: { name: "Test", tournamentType: "head-to-head", registrationStartDate: "2026-01-01", registrationEndDate: "2026-01-02", randomiseEveryRound: true } }, created);
  assert.equal(created.body.success, true);
  assert.equal(parseTournamentRoundPlan(row.round_schedule_json).draw.randomiseEveryRound, true);
  assert.equal(draws, 1);
  const manual = [["a", "d"], ["b", "c"]];
  const override = response();
  await handlers.get("PUT /api/tournaments/:id/rounds/:roundNumber/pairings")({ params: { id: "1", roundNumber: "1" }, body: { pairings: manual } }, override);
  assert.equal(override.body.success, true);
  const reloaded = response();
  await handlers.get("GET /api/tournaments")({}, reloaded);
  assert.deepEqual(parseTournamentRoundPlan(row.round_schedule_json).draw.roundPairings[1], manual);
  assert.deepEqual(reloaded.body.tournaments[0].bracket.rounds[0].matches.map((match) => [match.leftParticipant.username, match.rightParticipant.username]), manual);
  assert.equal(draws, 2);
});


test("all cancelled dates close management listings without bypassing member conversion completion", () => {
  const course = { lessons: [{ date: "2999-01-01", endTime: "16:00", isCancelled: true }] };
  assert.equal(isCourseClosed(course), true);
  assert.equal(hasCourseFinished(course), false);
});
