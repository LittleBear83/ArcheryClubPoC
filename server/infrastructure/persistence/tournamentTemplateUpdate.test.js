import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { createTournamentGateway } from "./tournamentGateway.js";

test("template updates change only selected live tournament snapshots", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`
      CREATE TABLE tournament_templates (
        template_key TEXT PRIMARY KEY, label TEXT, description TEXT, tournament_type TEXT,
        format TEXT, round_type TEXT, defaults_json TEXT, capabilities_json TEXT,
        eligibility_rules_json TEXT, created_by TEXT, created_at_date TEXT, created_at_time TEXT
      );
      CREATE TABLE tournaments (
        id INTEGER PRIMARY KEY, template_key TEXT, template_definition_json TEXT
      );
      INSERT INTO tournaments VALUES (1, 'standard-knockout', '{"version":"old"}');
      INSERT INTO tournaments VALUES (2, 'standard-knockout', '{"version":"old"}');
    `);
    const gateway = createTournamentGateway({
      databaseEngine: "sqlite",
      db,
      insertTournamentTemplate: db.prepare(`INSERT INTO tournament_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      updateTournamentTemplate: db.prepare(`UPDATE tournament_templates SET label = ?, description = ?, defaults_json = ?, capabilities_json = ?, eligibility_rules_json = ? WHERE template_key = ?`),
      updateTournamentTemplateSnapshot: db.prepare(`UPDATE tournaments SET template_definition_json = ? WHERE id = ? AND template_key = ?`),
      findTournamentTemplateByKey: db.prepare(`SELECT * FROM tournament_templates WHERE template_key = ?`),
    });
    const templateValues = {
      templateKey: "standard-knockout",
      label: "Standard Knockout",
      description: "Revised",
      tournamentType: "head-to-head",
      format: "knockout",
      roundType: "head-to-head",
      defaultsJson: "{}",
      capabilitiesJson: "{}",
      eligibilityRulesJson: null,
    };

    await gateway.saveTournamentTemplateUpdate({
      templateValues,
      storedTemplateExists: false,
      tournamentIds: [],
      snapshotJson: '{"version":"future"}',
      createdByUsername: "captain",
      timestampParts: ["2026-09-25", "12:00:00"],
    });
    assert.deepEqual(db.prepare("SELECT template_definition_json FROM tournaments ORDER BY id").all()
      .map((row) => row.template_definition_json), ['{"version":"old"}', '{"version":"old"}']);

    await gateway.saveTournamentTemplateUpdate({
      templateValues: { ...templateValues, description: "Live update" },
      storedTemplateExists: true,
      tournamentIds: [1],
      snapshotJson: '{"version":"live"}',
      createdByUsername: "captain",
      timestampParts: ["2026-09-25", "12:00:00"],
    });
    assert.deepEqual(db.prepare("SELECT template_definition_json FROM tournaments ORDER BY id").all()
      .map((row) => row.template_definition_json), ['{"version":"live"}', '{"version":"old"}']);
    assert.equal(db.prepare("SELECT description FROM tournament_templates").get().description, "Live update");
  } finally {
    db.close();
  }
});
