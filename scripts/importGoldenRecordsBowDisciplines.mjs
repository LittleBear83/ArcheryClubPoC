#!/usr/bin/env node
// One-off, additive Golden Records bow-discipline import.
// Default: preview only. Applying requires a saved plan and --allow-non-live
// when the runtime is not explicitly configured as production/live.
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { serverRuntime } from "../server/config/runtime.js";
import { createGoldenRecordsHttpClient } from "../server/infrastructure/golden-records/goldenRecordsHttpClient.js";
import { createPostgresPool } from "../server/infrastructure/persistence/createDatabase.js";
import {
  createGoldenRecordsBowDisciplineImportPlan,
  hashGoldenRecordsBowDisciplinePlan,
} from "../server/domain/services/goldenRecordsBowDisciplineImport.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSize = 1000;
const minRequestGapMs = 1100;

function getOptions(args) {
  const options = { allowNonLive: false, applyFrom: "", output: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--allow-non-live") options.allowNonLive = true;
    else if (arg === "--apply-from") {
      options.applyFrom = args[++index] ?? "";
      if (!options.applyFrom || options.applyFrom.startsWith("--")) throw new Error("--apply-from requires a plan file path.");
    }
    else if (arg === "--output") {
      options.output = args[++index] ?? "";
      if (!options.output || options.output.startsWith("--")) throw new Error("--output requires a file path.");
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.applyFrom && options.output) throw new Error("Use --output for a preview, or --apply-from to apply a reviewed plan, not both.");
  if (options.applyFrom && !options.applyFrom.trim()) throw new Error("--apply-from requires a plan file path.");
  if (options.output && !options.output.trim()) throw new Error("--output requires a file path.");
  return options;
}

function showHelp() {
  console.log(`Golden Records bow-discipline import

Preview (default; makes no database changes):
  node scripts/importGoldenRecordsBowDisciplines.mjs [--output <plan.json>]

Apply an unchanged, reviewed preview plan:
  node scripts/importGoldenRecordsBowDisciplines.mjs --apply-from <plan.json>

Applying outside production/live requires the explicit --allow-non-live flag.
Requires PostgreSQL and the existing Golden Records / database runtime settings.
The import only adds a mapped bow discipline; it never removes or replaces one.
`);
}

function databaseUrlHost() {
  try { return new URL(serverRuntime.databaseUrl).host; }
  catch { return ""; }
}

const targetScope = () => ({
  appMode: serverRuntime.appMode,
  databaseEngine: serverRuntime.databaseEngine,
  databaseName: serverRuntime.postgres.databaseName || (() => {
    try { return new URL(serverRuntime.databaseUrl).pathname.replace(/^\//u, ""); }
    catch { return ""; }
  })(),
  databaseHost: serverRuntime.postgres.host || databaseUrlHost(),
  cloudSqlInstance: String(serverRuntime.postgres.socketDirectory ?? "").replace(/^\/cloudsql\//u, ""),
});

async function fetchGoldenRecordsMembers() {
  const client = createGoldenRecordsHttpClient(serverRuntime.goldenRecords);
  const members = [];
  let lastRequestAt = 0;
  for (let pageNumber = 1; ; pageNumber += 1) {
    const waitMs = minRequestGapMs - (Date.now() - lastRequestAt);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
    const response = await client.getJson("/api/members", { pageNumber, pageSize });
    if (!response.ok) throw new Error(`Golden Records members request failed (${response.status} ${response.statusText}).`);
    if (!Array.isArray(response.body)) throw new Error("Golden Records members response was not an array; no changes were made.");
    members.push(...response.body);
    if (response.body.length < pageSize) break;
  }
  return members;
}

async function readActivePortalMembers(pool) {
  const result = await pool.query(`
    SELECT
      u.username,
      u.first_name,
      u.surname,
      u.gr_id,
      u.archery_gb_membership_number,
      u.active_member,
      COALESCE(
        ARRAY_AGG(DISTINCT d.discipline ORDER BY d.discipline)
          FILTER (WHERE d.discipline IS NOT NULL),
        ARRAY[]::text[]
      ) AS disciplines
    FROM users u
    LEFT JOIN user_disciplines d ON d.username = u.username
    WHERE u.active_member = 1
    GROUP BY u.username, u.first_name, u.surname, u.gr_id,
      u.archery_gb_membership_number, u.active_member
    ORDER BY u.username
  `);
  return result.rows;
}

async function makePlan(pool) {
  const [goldenRecordsMembers, portalMembers] = await Promise.all([
    fetchGoldenRecordsMembers(),
    readActivePortalMembers(pool),
  ]);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    target: targetScope(),
    goldenRecordsMemberCount: goldenRecordsMembers.length,
    portalMemberCount: portalMembers.length,
    ...createGoldenRecordsBowDisciplineImportPlan({ goldenRecordsMembers, portalMembers }),
  };
}

function summarize(records) {
  const counts = { add: 0, unchanged: 0, skip: 0 };
  for (const record of records) counts[record.status] = (counts[record.status] ?? 0) + 1;
  return counts;
}

async function writePlan(plan, requestedPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const outputPath = requestedPath
    ? path.resolve(requestedPath)
    : path.join(root, "server", "data", "exports", `golden-records-bow-disciplines-${timestamp}.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600).catch(() => {});
  return outputPath;
}

function printPlan(plan, outputPath) {
  const counts = summarize(plan.records);
  console.log(`Plan SHA-256: ${plan.planHash}`);
  console.log(`Members: ${plan.portalMemberCount} active in the portal; ${plan.goldenRecordsMemberCount} returned by Golden Records.`);
  console.log(`Proposed additions: ${counts.add}; unchanged: ${counts.unchanged}; skipped for review: ${counts.skip}.`);
  console.table(plan.records.map(({ username, grName, grMembershipId, bowClass, discipline, currentDisciplines, matchSource, status, reason }) => ({
    username, goldenRecordsName: grName, membershipNumber: grMembershipId, bowClass,
    addDiscipline: discipline, currentDisciplines: currentDisciplines.join("; "), match: matchSource ?? "", status, reason,
  })));
  console.log(`Saved plan: ${outputPath}`);
  console.log("Review the plan before applying. Applying requires this exact plan to still match live Golden Records and portal data.");
}

function assertPlanIsValid(plan) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.records) || !plan.planHash) {
    throw new Error("Plan file is invalid or uses an unsupported version.");
  }
  if (hashGoldenRecordsBowDisciplinePlan(plan.records) !== plan.planHash) {
    throw new Error("Plan file integrity check failed; no changes were made.");
  }
  if (JSON.stringify(plan.target) !== JSON.stringify(targetScope())) {
    throw new Error("Plan was created for a different runtime/database target; no changes were made.");
  }
}

function sameList(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function applyPlan(pool, reviewedPlan, currentPlan) {
  if (reviewedPlan.planHash !== currentPlan.planHash) {
    throw new Error("Live Golden Records or portal data changed since the preview. Generate and review a new plan; no changes were made.");
  }
  const changes = currentPlan.records.filter((record) => record.status === "add");
  if (!changes.length) {
    console.log("No discipline additions are needed.");
    return 0;
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query("BEGIN");
    const usernames = changes.map((record) => record.username);
    const locked = await client.query(`
      SELECT username, COALESCE(gr_id, '') AS gr_id,
        COALESCE(archery_gb_membership_number, '') AS archery_gb_membership_number,
        active_member
      FROM users WHERE username = ANY($1::text[]) FOR UPDATE
    `, [usernames]);
    const lockedByUsername = new Map(locked.rows.map((row) => [row.username, row]));

    for (const record of changes) {
      const user = lockedByUsername.get(record.username);
      if (!user || Number(user.active_member) !== 1 ||
          String(user.gr_id ?? "").trim() !== record.portalGoldenRecordsId ||
          String(user.archery_gb_membership_number ?? "").trim() !== record.portalMembershipId) {
        throw new Error(`Portal identity changed for ${record.username}; transaction rolled back.`);
      }
      const disciplinesResult = await client.query(
        "SELECT discipline FROM user_disciplines WHERE username = $1 ORDER BY discipline",
        [record.username],
      );
      const currentDisciplines = disciplinesResult.rows.map((row) => row.discipline);
      if (!sameList(currentDisciplines, record.currentDisciplines)) {
        throw new Error(`Portal disciplines changed for ${record.username}; transaction rolled back.`);
      }
      const result = await client.query(`
        INSERT INTO user_disciplines (username, discipline)
        VALUES ($1, $2)
        ON CONFLICT (username, discipline) DO NOTHING
      `, [record.username, record.discipline]);
      if (result.rowCount > 0) {
        inserted += 1;
        const now = new Date();
        await client.query(`
          INSERT INTO audit_events (actor_username, action, target, status_code, metadata_json, created_at_date, created_at_time)
          VALUES (NULL, $1, $2, 200, $3, $4, $5)
        `, [
          "golden_records_bow_discipline_import",
          record.username,
          JSON.stringify({ bowClass: record.bowClass, discipline: record.discipline, goldenRecordsMemberId: record.grMemberId, matchSource: record.matchSource }),
          now.toISOString().slice(0, 10),
          now.toISOString().slice(11, 19),
        ]);
      }
    }
    await client.query("COMMIT");
    return inserted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const options = getOptions(process.argv.slice(2));
  if (options.help) return showHelp();
  if (serverRuntime.databaseEngine !== "postgres") throw new Error("This importer requires the portal PostgreSQL database; SQLite targets are refused.");
  if (!serverRuntime.isLive && options.applyFrom && !options.allowNonLive) {
    throw new Error("Apply refused outside production/live. Add --allow-non-live only when intentionally applying to a non-live database.");
  }

  const pool = createPostgresPool(serverRuntime);
  try {
    const currentPlan = await makePlan(pool);
    if (!options.applyFrom) {
      const outputPath = await writePlan(currentPlan, options.output);
      printPlan(currentPlan, outputPath);
      return;
    }

    const reviewedPlan = JSON.parse(await readFile(path.resolve(options.applyFrom), "utf8"));
    assertPlanIsValid(reviewedPlan);
    const inserted = await applyPlan(pool, reviewedPlan, currentPlan);
    console.log(`Import complete: ${inserted} bow discipline(s) added. Other disciplines were preserved.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
