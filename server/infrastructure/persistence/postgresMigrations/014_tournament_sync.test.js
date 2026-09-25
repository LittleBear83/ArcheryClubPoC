import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runPostgresMigrations } from "../runPostgresMigrations.js";
import { migration } from "./014_tournament_sync.js";
import { postgresMigrations } from "./index.js";

const sql = migration.statements.join("\n");

test("migration 014 creates immutable UUID-backed tournament sync identity", () => {
  assert.equal(migration.version, "014_tournament_sync");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sync_id TEXT/i);
  assert.match(sql, /SET sync_id = gen_random_uuid\(\)::text WHERE sync_id IS NULL/i);
  assert.match(sql, /ALTER COLUMN sync_id SET DEFAULT gen_random_uuid\(\)::text/i);
  assert.match(sql, /ALTER COLUMN sync_id SET NOT NULL/i);
  assert.match(sql, /tournaments_sync_id_uidx/i);
  assert.match(sql, /tournaments\.sync_id is immutable/i);
});

test("migration 014 is registered after the local outbox notification migration", () => {
  const versions = postgresMigrations.map((entry) => entry.version);
  assert.equal(versions.at(-2), "013_local_outbox_notifications");
  assert.equal(versions.at(-1), migration.version);
});

test("migration 014 installs portable tournament change-log triggers with apply suppression", () => {
  for (const domain of [
    "tournament_templates", "tournaments", "tournament_registrations",
    "tournament_rounds", "tournament_matches", "tournament_scores",
    "tournament_handicap_tables", "tournament_handicap_table_rows",
  ]) {
    assert.match(sql, new RegExp(`sync_${domain}_change_log_trigger`, "i"), domain);
  }
  assert.match(sql, /current_setting\('archery\.sync\.apply_mode', true\).*IN \('pull', 'maintenance'\)/is);
  assert.match(sql, /'tournament_sync_id'/i);
  assert.match(sql, /'table_key'/i);
  assert.match(sql, /LOWER\(COALESCE\(source_row\.member_username/i);
  assert.doesNotMatch(sql, /jsonb_build_object\([^;]*'created_by_user_id'/is);
  assert.doesNotMatch(sql, /jsonb_build_object\([^;]*'member_user_id'/is);
});

const schema = readFileSync(new URL("../runPostgresMigrations.js", import.meta.url), "utf8");
const domains = ["tournament_templates", "tournaments", "tournament_registrations",
  "tournament_rounds", "tournament_scores", "tournament_matches",
  "tournament_handicap_tables", "tournament_handicap_table_rows"];

function domainFunction(domain) {
  const name = domain === "tournament_handicap_table_rows"
    ? "append_sync_tournament_handicap_rows_change_log" : `append_sync_${domain}_change_log`;
  return migration.statements.find((statement) => statement.includes(`FUNCTION ${name}()`));
}

test("all eight publishers are AFTER row triggers; immutability alone remains BEFORE", () => {
  for (const domain of domains) {
    const statement = migration.statements.find((s) => s.includes(`CREATE TRIGGER sync_${domain}_change_log_trigger`));
    assert.match(statement, new RegExp(`AFTER INSERT OR UPDATE OR DELETE ON ${domain}\\s+FOR EACH ROW`));
    const body = domainFunction(domain);
    assert.ok(body.indexOf("current_setting(") < body.indexOf("INSERT INTO sync_change_log"));
  }
  assert.equal((sql.match(/BEFORE /g) ?? []).length, 1);
  assert.match(sql, /BEFORE UPDATE OF sync_id/);
});

test("child DELETE may omit a cascade tombstone, but missing-parent writes still fail", () => {
  for (const domain of ["tournament_registrations", "tournament_rounds", "tournament_scores",
    "tournament_matches", "tournament_handicap_table_rows"]) {
    const body = domainFunction(domain);
    assert.match(body, /IF parent_(?:sync_id|key) IS NULL THEN[\s\S]*?IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;[\s\S]*?RAISE EXCEPTION/);
    assert.ok(body.indexOf("IF parent_") < body.indexOf("INSERT INTO sync_change_log"));
    assert.match(body, /CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END/);
  }
});

test("publisher row references exist in their actual domain schema and payloads exclude local IDs", () => {
  for (const domain of domains) {
    const table = schema.split(`CREATE TABLE IF NOT EXISTS ${domain} (`)[1]?.split("\n    )")[0];
    assert.ok(table, domain);
    const columns = new Set([...table.matchAll(/^\s+([a-z_]+) (?:TEXT|INTEGER|BIGINT|BIGSERIAL|REAL|DOUBLE|NUMERIC|JSONB|BOOLEAN)/gm)].map((m) => m[1]));
    const body = domainFunction(domain);
    assert.doesNotMatch(body, /to_jsonb\s*\(/i);
    for (const [, field] of body.matchAll(/(?:OLD|NEW|source_row)\.([a-z_]+)/g)) {
      assert.ok(columns.has(field) || (domain === "tournaments" && field === "sync_id"), `${domain}.${field}`);
    }
    // Every quoted key/value pair is explicit; future row columns cannot leak.
    const keys = [...body.matchAll(/'([a-z_]+)',\s*(?:source_row\.|OLD\.|parent_|old_parent_)/g)].map((m) => m[1]);
    assert.ok(keys.length > 0, domain);
    for (const key of keys) assert.ok(!/^(id|tournament_id|table_id)$|_user_id$/.test(key), `${domain}.${key}`);
  }
});

test("UUID prerequisite is checked before any migration 014 DDL", () => {
  assert.match(migration.statements[0], /to_regprocedure\('gen_random_uuid\(\)'\) IS NULL/);
  assert.match(migration.statements[0], /RAISE EXCEPTION/);
  assert.match(migration.statements[0], /PostgreSQL 13\+/);
});

test("tournament apply conflict targets have actual schema constraints", () => {
  const targets = {
    tournament_templates: "PRIMARY KEY",
    tournament_registrations: "PRIMARY KEY (tournament_id, member_username)",
    tournament_rounds: "PRIMARY KEY (tournament_id, round_number)",
    tournament_scores: "PRIMARY KEY (tournament_id, round_number, member_username)",
    tournament_matches: "PRIMARY KEY (tournament_id, round_number, match_number)",
    tournament_handicap_tables: "table_key TEXT NOT NULL UNIQUE",
    tournament_handicap_table_rows: "PRIMARY KEY (table_id, handicap_value)",
  };
  for (const [domain, target] of Object.entries(targets)) {
    const table = schema.split(`CREATE TABLE IF NOT EXISTS ${domain} (`)[1].split("\n    )")[0];
    assert.ok(table.includes(target), `${domain}: ${target}`);
  }
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS tournaments_sync_id_uidx ON tournaments \(sync_id\)/);
});

for (const fail of [false, true]) {
  test(`migration 014 and version recording share runner transaction (${fail ? "rollback" : "commit"})`, async () => {
    const queries = [];
    let released = false;
    const client = { async query(statement, values = []) {
      const text = statement.trim(); queries.push({ text, values });
      if (text.includes("FROM schema_migrations")) return { rows: [], rowCount: values[0] === migration.version ? 0 : 1 };
      if (fail && text === migration.statements.at(-1).trim()) throw new Error("migration 014 failure");
      return { rows: [], rowCount: 0 };
    }, release() { released = true; } };
    const execute = () => runPostgresMigrations({ pool: { async connect() { return client; } },
      committeeRoleSeed: [], permissionDefinitions: [], systemRoleDefinitions: [], defaultEquipmentCupboardLabel: "Main" });
    if (fail) await assert.rejects(execute(), /migration 014 failure/);
    else await execute();
    assert.equal(queries[0].text, "BEGIN");
    assert.equal(queries.at(-1).text, fail ? "ROLLBACK" : "COMMIT");
    const versionWritten = queries.some((q) => q.text.includes("INSERT INTO schema_migrations") && q.values[0] === migration.version);
    assert.equal(versionWritten, !fail);
    for (const statement of migration.statements) assert.ok(queries.some((q) => q.text === statement.trim()));
    assert.equal(released, true);
  });
}
