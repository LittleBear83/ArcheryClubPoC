import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAuthChanges,
  applyPulledPublicationResponse,
  applyPublicationSnapshot,
  PUBLICATION_FEED_VERSION,
  REPLICATED_DOMAINS,
} from "./localDatabaseSyncService.js";
import { localSyncBrowserEventNames } from "./localSyncBrowserEvents.js";
import { createSyncGateway } from "../../infrastructure/persistence/syncGateway.js";
import {
  isBlockedLocalPiTournamentMutation,
  registerTournamentRoutes,
} from "../../presentation/http/registerTournamentRoutes.js";

const tournamentDomains = [
  "tournament_templates", "tournament_handicap_tables",
  "tournament_handicap_table_rows", "tournaments", "tournament_registrations",
  "tournament_rounds", "tournament_scores", "tournament_matches",
];

function payloads() {
  const tournament = {
    sync_id: "cloud-tournament", name: "Cloud Cup", tournament_type: "head-to-head",
    template_key: "knockout", template_definition_json: "{}", draw_date: null,
    round_schedule_json: "[]", registration_start_date: "2026-09-01",
    registration_end_date: "2026-09-10", score_submission_start_date: "2026-09-11",
    score_submission_end_date: "2026-09-20", created_by: "captain",
    created_at_date: "2026-09-01", created_at_time: "10:00:00",
    id: 1,
  };
  return {
    tournament_templates: { template_key: "knockout", label: "Knockout", description: "",
      tournament_type: "head-to-head", format: "knockout", round_type: "match",
      defaults_json: "{}", capabilities_json: "{}", eligibility_rules_json: null,
      created_by: "captain", created_at_date: "2026-09-01", created_at_time: "10:00:00" },
    tournament_handicap_tables: { table_key: "recurve", title: "Recurve", is_editable: 0 },
    tournament_handicap_table_rows: { table_key: "recurve", handicap_value: 10, reference_score: 500, display_order: 1 },
    tournaments: tournament,
    tournament_registrations: { tournament_sync_id: tournament.sync_id, tournament_id: 1,
      member_username: "robin", bow_code: "R", registered_at_date: "2026-09-02", registered_at_time: "10:00:00" },
    tournament_rounds: { tournament_sync_id: tournament.sync_id, tournament_id: 1,
      round_number: 1, title: "Final", status: "scheduled" },
    tournament_scores: { tournament_sync_id: tournament.sync_id, tournament_id: 1,
      round_number: 1, member_username: "robin", score: 500,
      submitted_at_date: "2026-09-12", submitted_at_time: "10:00:00" },
    tournament_matches: { tournament_sync_id: tournament.sync_id, tournament_id: 1,
      round_number: 1, match_number: 1, left_member_username: "robin",
      right_member_username: null, status: "scheduled" },
  };
}

function applyingClient() {
  const queries = [];
  const tournaments = new Map();
  const handicapTables = new Map();
  return {
    queries,
    client: {
      async query(sql, values = []) {
        const text = String(sql).trim().replace(/\s+/g, " ");
        queries.push({ text, values });
        if (text.startsWith("SELECT id FROM tournaments WHERE sync_id")) {
          const id = tournaments.get(values[0]);
          return { rowCount: id ? 1 : 0, rows: id ? [{ id }] : [] };
        }
        if (text.startsWith("SELECT id FROM tournament_handicap_tables")) {
          const id = handicapTables.get(values[0]);
          return { rowCount: id ? 1 : 0, rows: id ? [{ id }] : [] };
        }
        if (text.startsWith("INSERT INTO tournaments")) tournaments.set(values[0], 42);
        if (text.startsWith("INSERT INTO tournament_handicap_tables")) handicapTables.set(values[0], 77);
        return { rowCount: /^(INSERT|UPDATE|DELETE)/.test(text) ? 1 : 0, rows: [] };
      },
    },
  };
}

test("all tournament domains are replicated and coalesce to one browser invalidation", () => {
  for (const domain of tournamentDomains) assert.ok(REPLICATED_DOMAINS.includes(domain), domain);
  assert.deepEqual(localSyncBrowserEventNames(tournamentDomains), ["tournaments.updated"]);
});

test("incremental tournament graph resolves local parent IDs and ignores cloud numeric IDs", async () => {
  const { client, queries } = applyingClient();
  const data = payloads();
  const changes = tournamentDomains.toReversed().map((domain) => ({
    domain, operation: "upsert", payload: data[domain], recordKey: domain,
  }));
  const applied = await applyAuthChanges({ changes, client, deactivatedRfidSuffix: "-deactivated" });
  assert.deepEqual(applied, tournamentDomains);
  const registration = queries.find(({ text }) => text.startsWith("INSERT INTO tournament_registrations"));
  const handicapRow = queries.find(({ text }) => text.startsWith("INSERT INTO tournament_handicap_table_rows"));
  assert.equal(registration.values[0], 42);
  assert.notEqual(registration.values[0], data.tournament_registrations.tournament_id);
  assert.equal(handicapRow.values[0], 77);
  for (const insert of queries.filter(({ text }) => text.startsWith("INSERT INTO"))) {
    assert.match(insert.text, /ON CONFLICT/);
  }
});

test("incremental child upsert fails closed when its stable parent is missing", async () => {
  const { client } = applyingClient();
  await assert.rejects(
    applyAuthChanges({
      changes: [{ domain: "tournament_rounds", operation: "upsert",
        recordKey: "missing:1", payload: { tournament_sync_id: "missing", round_number: 1, title: "Final" } }],
      client,
      deactivatedRfidSuffix: "-deactivated",
    }),
    /Tournament sync parent not found/,
  );
});

test("incremental tournament deletes run in reverse dependency order", async () => {
  const { client, queries } = applyingClient();
  const data = payloads();
  const expectedOrder = [
    "tournament_matches", "tournament_scores", "tournament_rounds",
    "tournament_registrations", "tournaments", "tournament_handicap_table_rows",
    "tournament_handicap_tables", "tournament_templates",
  ];
  const applied = await applyAuthChanges({
    changes: tournamentDomains.map((domain) => ({
      domain, operation: "delete", payload: data[domain], recordKey: domain,
    })),
    client,
    deactivatedRfidSuffix: "-deactivated",
  });
  assert.deepEqual(applied, expectedOrder);
  assert.deepEqual(
    queries.filter(({ text }) => text.startsWith("DELETE FROM tournament"))
      .map(({ text }) => text.match(/^DELETE FROM ([a-z_]+)/)?.[1]),
    expectedOrder,
  );
});

test("publication rebaseline refuses to destroy an unknown Pi-only tournament", async () => {
  const queries = [];
  const snapshot = Object.fromEntries([
    "announcements", "beginnersCourseLessonCoaches", "beginnersCourseLessons",
    "beginnersCourseParticipants", "beginnersCourses", "clubEvents",
    "coachingSessionBookings", "coachingSessions", "equipmentItems",
    "equipmentStorageLocations", "eventBookings", "guestLoginEvents", "loginEvents",
    "permissions", "rangePresenceExtensions", "rolePermissions", "roles",
    "userDisciplines", "userTypes", "users", "tournamentTemplates",
    "tournamentHandicapTables", "tournamentHandicapTableRows", "tournaments",
    "tournamentRegistrations", "tournamentRounds", "tournamentScores", "tournamentMatches",
  ].map((key) => [key, []]));
  const client = { async query(sql) {
    const text = String(sql).trim().replace(/\s+/g, " ");
    queries.push(text);
    if (text.startsWith("SELECT sync_id, name FROM tournaments")) {
      return { rowCount: 1, rows: [{ sync_id: "pi-only", name: "Local Cup" }] };
    }
    return { rowCount: 0, rows: [] };
  } };
  await assert.rejects(applyPublicationSnapshot({
    client,
    deactivatedRfidSuffix: "-deactivated",
    snapshotResponse: { checkpoint: "1", feedVersion: PUBLICATION_FEED_VERSION, mode: "snapshot", snapshot },
    syncGateway: { async writeLocalState() {} },
  }), /rebaseline refused/);
  assert.equal(queries.at(-1), "ROLLBACK");
  assert.ok(!queries.some((query) => query.startsWith("DELETE FROM tournaments")));
});

test("authoritative snapshot exposes all eight portable tournament arrays", async () => {
  const pool = { async query(sql) {
    if (String(sql).includes("MAX(change_id)")) return { rows: [{ checkpoint: 0 }] };
    return { rows: [] };
  } };
  const { snapshot } = await createSyncGateway({ pool }).getAuthSnapshot();
  for (const property of [
    "tournamentTemplates", "tournamentHandicapTables", "tournamentHandicapTableRows",
    "tournaments", "tournamentRegistrations", "tournamentRounds",
    "tournamentScores", "tournamentMatches",
  ]) assert.deepEqual(snapshot[property], [], property);
});

test("local Pi write protection covers Phase 1 mutations but leaves GET available", () => {
  const blocked = [
    ["POST", "/api/tournament-templates"], ["POST", "/api/tournaments"],
    ["PUT", "/api/tournaments/1"], ["DELETE", "/api/tournaments/1"],
    ["POST", "/api/tournaments/1/redraw"], ["POST", "/api/tournaments/1/register"],
    ["DELETE", "/api/tournaments/1/register"], ["POST", "/api/tournaments/1/score"],
    ["PUT", "/api/tournaments/1/rounds/1/pairings"],
    ["POST", "/api/tournament-matches/1-1-1/result"],
    ["POST", "/api/tournament-matches/1-1-1/confirm"],
    ["POST", "/api/tournament-matches/1-1-1/dispute"],
    ["POST", "/api/tournament-matches/1-1-1/override"],
  ];
  for (const [method, path] of blocked) assert.equal(isBlockedLocalPiTournamentMutation(method, path), true, `${method} ${path}`);
  assert.equal(isBlockedLocalPiTournamentMutation("GET", "/api/tournaments"), false);
  assert.equal(isBlockedLocalPiTournamentMutation("POST", "/api/tournaments/1/competitors-export"), false);
});

test("local Pi GET tournaments renders replicated rows without persistence", async () => {
  const getHandlers = new Map();
  const app = {
    use() {},
    get(path, handler) { getHandlers.set(path, handler); },
    post() {}, put() {}, delete() {},
  };
  const writes = [];
  const tournament = {
    id: 42, sync_id: "cloud-tournament", name: "Cloud Cup",
    tournament_type: "head-to-head", template_key: null,
    template_definition_json: null, registration_start_date: "2026-01-01",
    registration_end_date: "2026-01-02", score_submission_start_date: "2026-01-03",
    score_submission_end_date: "2026-01-04",
    round_schedule_json: JSON.stringify({ draw: { randomiseEveryRound: true } }),
  };
  const tournamentGateway = {
    async listTournaments() { return [tournament]; },
    async listTournamentTemplates() { return []; },
    async updateTournament() { writes.push("update"); throw new Error("Pi GET attempted a write"); },
    async replaceTournamentRounds() { writes.push("rounds"); throw new Error("Pi GET attempted a write"); },
    async replaceTournamentMatches() { writes.push("matches"); throw new Error("Pi GET attempted a write"); },
    async acquireWorkflowLock() { return async () => {}; },
  };
  registerTournamentRoutes({
    app, actorHasPermission: () => false, getActorUser: () => ({ username: "robin" }),
    PERMISSIONS: { MANAGE_TOURNAMENTS: "manage" }, tournamentGateway,
    buildTournamentDataMaps: async () => ({
      matchesByTournamentId: new Map([[42, []]]), registrationsByTournamentId: new Map([[42, []]]),
      roundsByTournamentId: new Map([[42, []]]), scoresByTournamentId: new Map([[42, []]]),
    }),
    buildTournament: (row) => ({ id: row.id, name: row.name }),
    memberDirectoryGateway: {}, TOURNAMENT_TEMPLATE_OPTIONS: [], TOURNAMENT_TYPE_OPTIONS: [],
    toUtcDateString: () => "2026-01-10", isLocalPiNode: true,
  });
  let body;
  await getHandlers.get("/api/tournaments")({}, { json(value) { body = value; } });
  assert.deepEqual(writes, []);
  assert.deepEqual(body.tournaments, [{ id: 42, name: "Cloud Cup" }]);
});

// Stateful apply harness: model FK parent checks, cascades, and transactional state.
function publicationHarness({ present = false, managed = 1, handicap = false } = {}) {
  const parents = new Map(present ? [[handicap ? "recurve" : "cloud-tournament", managed]] : []);
  const children = new Set(present ? ["existing"] : []);
  const queries = [];
  let checkpoint = "0";
  let saved;
  const client = { async query(sql, values = []) {
    const text = String(sql).trim().replace(/\s+/g, " ");
    queries.push(text);
    if (text === "BEGIN") saved = { parents: new Map(parents), children: new Set(children), checkpoint };
    if (text === "ROLLBACK") {
      parents.clear(); saved.parents.forEach((v, k) => parents.set(k, v));
      children.clear(); saved.children.forEach((v) => children.add(v));
      checkpoint = saved.checkpoint;
    }
    if (text.startsWith("SELECT sync_is_cloud_managed")) {
      return { rows: parents.has(values[0]) ? [{ sync_is_cloud_managed: parents.get(values[0]) }] : [] };
    }
    if (/^SELECT id FROM (tournaments|tournament_handicap_tables) /.test(text)) {
      return { rows: parents.has(values[0]) ? [{ id: 42 }] : [] };
    }
    if (/^INSERT INTO (tournaments|tournament_handicap_tables) \(/.test(text)) parents.set(values[0], 1);
    if (/^INSERT INTO (tournament_registrations|tournament_handicap_table_rows) \(/.test(text)) {
      assert.ok(parents.size, "child requires parent"); children.add("incoming");
    }
    if (/^DELETE FROM (tournaments|tournament_handicap_tables) WHERE/.test(text)) {
      parents.delete(values[0]); children.clear();
    }
    return { rows: [], rowCount: /^(INSERT|UPDATE|DELETE)/.test(text) ? 1 : 0 };
  } };
  const syncGateway = {
    async readLocalState() { return { state: { feedVersion: PUBLICATION_FEED_VERSION, publicationCheckpoint: checkpoint } }; },
    async writeLocalState({ client: actual, state }) { assert.equal(actual, client); checkpoint = state.publicationCheckpoint; },
  };
  async function apply(changes) {
    await applyPulledPublicationResponse({ client, syncGateway, pullResponse: {
      feedVersion: PUBLICATION_FEED_VERSION, mode: "incremental", checkpoint: String(changes.length),
      changes: changes.map((c, i) => ({ ...c, publicationCursor: String(i + 1) })),
    } });
  }
  return { apply, parents, children, queries, checkpoint: () => checkpoint };
}

function graphChange(domain, operation) {
  const payload = payloads()[domain];
  const recordKey = domain === "tournaments" ? payload.sync_id
    : domain === "tournament_handicap_tables" ? payload.table_key : `${domain}:child`;
  return { domain, operation, recordKey, payload };
}

for (const handicap of [false, true]) {
  const parent = handicap ? "tournament_handicap_tables" : "tournaments";
  const child = handicap ? "tournament_handicap_table_rows" : "tournament_registrations";
  for (const present of [false, true]) {
    test(`${parent}: final delete drops obsolete child upserts (${present ? "existing" : "absent"} Pi parent), commits and replays`, async () => {
      const h = publicationHarness({ present, handicap });
      const changes = [graphChange(parent, "upsert"), graphChange(child, "upsert"),
        ...(!handicap ? [graphChange("tournament_rounds", "delete"), graphChange("tournament_matches", "delete")] : []),
        graphChange(parent, "delete")];
      await h.apply(changes);
      assert.equal(h.parents.size, 0); assert.equal(h.children.size, 0);
      assert.equal(h.checkpoint(), String(changes.length));
      assert.ok(!h.queries.some((q) => q.startsWith(`INSERT INTO ${child} `)));
      if (!handicap) {
        assert.ok(h.queries.findIndex((q) => q.startsWith("DELETE FROM tournament_matches "))
          < h.queries.findIndex((q) => q.startsWith("DELETE FROM tournament_rounds ")));
        assert.ok(h.queries.findIndex((q) => q.startsWith("DELETE FROM tournament_rounds "))
          < h.queries.findIndex((q) => q.startsWith("DELETE FROM tournaments ")));
      }
      await h.apply(changes);
      assert.equal(h.parents.size, 0); assert.equal(h.checkpoint(), String(changes.length));
    });
  }
  test(`${parent}: delete then final upsert retains parent before child`, async () => {
    const h = publicationHarness({ handicap });
    await h.apply([graphChange(parent, "delete"), graphChange(child, "upsert"), graphChange(parent, "upsert")]);
    assert.equal(h.parents.size, 1); assert.equal(h.children.size, 1);
    assert.equal(h.checkpoint(), "3");
    assert.ok(h.queries.findIndex((q) => q.startsWith(`INSERT INTO ${parent} `))
      < h.queries.findIndex((q) => q.startsWith(`INSERT INTO ${child} `)));
  });
  test(`${parent}: missing parent upsert remains an invalid batch`, async () => {
    const h = publicationHarness({ handicap });
    await assert.rejects(h.apply([graphChange(child, "upsert")]), /parent not found/);
    assert.equal(h.checkpoint(), "0"); assert.equal(h.queries.at(-1), "ROLLBACK");
  });
}

test("incremental Cloud tombstone refuses unmanaged Pi tournament and rolls back checkpoint", async () => {
  const h = publicationHarness({ present: true, managed: 0 });
  await assert.rejects(h.apply([graphChange("tournaments", "delete")]), /not Cloud-managed/);
  assert.equal(h.parents.size, 1); assert.equal(h.children.size, 1);
  assert.equal(h.checkpoint(), "0"); assert.equal(h.queries.at(-1), "ROLLBACK");
  assert.ok(!h.queries.some((q) => q.startsWith("DELETE FROM tournaments ")));
});
