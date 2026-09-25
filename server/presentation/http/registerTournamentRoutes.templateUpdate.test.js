import assert from "node:assert/strict";
import test from "node:test";

import { registerTournamentRoutes } from "./registerTournamentRoutes.js";

const template = {
  key: "standard-knockout",
  label: "Standard Knockout",
  tournamentType: "head-to-head",
  format: "knockout",
  roundType: "head-to-head",
  defaults: {},
  capabilities: {},
};

function makeResponse() {
  return {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("template update checks live tournaments and saves future-only choice", async () => {
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "put", "delete"].map((method) =>
    [method, (path, handler) => routes.set(`${method}:${path}`, handler)]));
  let savedArgs = null;
  const gateway = {
    async listTournamentTemplates() { return []; },
    async listTournaments() { return [{ id: 7, name: "Club Cup", template_key: template.key }]; },
    async listTournamentMatchesByTournamentId() { return []; },
    async findTournamentTemplateByKey() { return null; },
    async saveTournamentTemplateUpdate(args) {
      savedArgs = args;
      return {
        template_key: args.templateValues.templateKey,
        label: args.templateValues.label,
        description: args.templateValues.description,
        tournament_type: args.templateValues.tournamentType,
        format: args.templateValues.format,
        round_type: args.templateValues.roundType,
        defaults_json: args.templateValues.defaultsJson,
        capabilities_json: args.templateValues.capabilitiesJson,
        eligibility_rules_json: args.templateValues.eligibilityRulesJson,
      };
    },
  };
  registerTournamentRoutes({
    app,
    actorHasPermission: () => true,
    getActorUser: () => ({ username: "captain" }),
    getUtcTimestampParts: () => ["2026-09-25", "12:00:00"],
    PERMISSIONS: { MANAGE_TOURNAMENTS: "manage_tournaments" },
    tournamentGateway: gateway,
    TOURNAMENT_TEMPLATE_OPTIONS: [template],
  });

  const liveResponse = makeResponse();
  await routes.get("get:/api/tournament-templates/:key/live-tournaments")(
    { params: { key: template.key } }, liveResponse);
  assert.deepEqual(liveResponse.body.tournaments, [{ id: 7, name: "Club Cup" }]);

  const update = routes.get("put:/api/tournament-templates/:key");
  const body = { label: "Updated", description: "New settings", defaults: {}, capabilities: {} };
  const undecidedResponse = makeResponse();
  await update({ params: { key: template.key }, body }, undecidedResponse);
  assert.equal(undecidedResponse.statusCode, 409);

  const futureResponse = makeResponse();
  await update({ params: { key: template.key }, body: { ...body, applyToLiveTournaments: false } }, futureResponse);
  assert.equal(futureResponse.statusCode, 200);
  assert.deepEqual(savedArgs.tournamentIds, []);
  assert.equal(futureResponse.body.updatedLiveTournamentCount, 0);
});
