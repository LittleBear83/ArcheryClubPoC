#!/usr/bin/env node
// One-off, additive Golden Records bow-discipline import.
// Default: preview only. Applying requires a saved plan.
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { serverRuntime } from "../server/config/runtime.js";
import { createPostgresPool } from "../server/infrastructure/persistence/createDatabase.js";
import { createGoldenRecordsBowDisciplineImportService } from "../server/infrastructure/golden-records/goldenRecordsBowDisciplineImportService.js";
import { hashGoldenRecordsBowDisciplinePlan } from "../server/domain/services/goldenRecordsBowDisciplineImport.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getOptions(args) {
  const options = { allowNonLive: false, applyFrom: "", output: "" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--allow-non-live") options.allowNonLive = true;
    else if (arg === "--apply-from") options.applyFrom = args[++index] ?? "";
    else if (arg === "--output") options.output = args[++index] ?? "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.applyFrom && options.output) throw new Error("Use --output for a preview, or --apply-from to apply a reviewed plan.");
  if (args.includes("--apply-from") && (!options.applyFrom || options.applyFrom.startsWith("--"))) throw new Error("--apply-from requires a plan file path.");
  if (args.includes("--output") && (!options.output || options.output.startsWith("--"))) throw new Error("--output requires a file path.");
  return options;
}

function showHelp() {
  console.log(`Golden Records bow-discipline import

Preview (default; makes no database changes):
  node scripts/importGoldenRecordsBowDisciplines.mjs [--output <plan.json>]

Apply an unchanged, reviewed preview plan:
  node scripts/importGoldenRecordsBowDisciplines.mjs --apply-from <plan.json>

Applying outside production/live requires --allow-non-live.
Requires PostgreSQL and the existing Golden Records / database runtime settings.
The import only adds a mapped bow discipline; it never removes or replaces one.
`);
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
  console.log(`Plan SHA-256: ${plan.planHash}`);
  console.log(`Members: ${plan.portalMemberCount} active in the portal; ${plan.goldenRecordsMemberCount} returned by Golden Records.`);
  console.log(`Proposed additions: ${plan.counts.add}; unchanged: ${plan.counts.unchanged}; skipped for review: ${plan.counts.skip}.`);
  console.table(plan.records.map(({ username, grName, grMembershipId, bowClass, discipline, currentDisciplines, matchSource, status, reason }) => ({
    username, goldenRecordsName: grName, membershipNumber: grMembershipId, bowClass,
    addDiscipline: discipline, currentDisciplines: currentDisciplines.join("; "), match: matchSource ?? "", status, reason,
  })));
  console.log(`Saved plan: ${outputPath}`);
}

async function main() {
  const options = getOptions(process.argv.slice(2));
  if (options.help) return showHelp();
  if (serverRuntime.databaseEngine !== "postgres") throw new Error("This importer requires the portal PostgreSQL database; SQLite targets are refused.");
  if (!serverRuntime.isLive && options.applyFrom && !options.allowNonLive) {
    throw new Error("Apply refused outside production/live. Add --allow-non-live only when intentionally applying to a non-live database.");
  }
  const pool = createPostgresPool(serverRuntime);
  const importer = createGoldenRecordsBowDisciplineImportService({ pool, runtime: serverRuntime });
  try {
    if (!options.applyFrom) {
      const plan = await importer.preview();
      printPlan(plan, await writePlan(plan, options.output));
      return;
    }
    const reviewed = JSON.parse(await readFile(path.resolve(options.applyFrom), "utf8"));
    if (reviewed?.version !== 1 || !Array.isArray(reviewed.records) ||
        hashGoldenRecordsBowDisciplinePlan(reviewed.records) !== reviewed.planHash) {
      throw new Error("Plan file integrity check failed; no changes were made.");
    }
    const current = await importer.preview();
    if (JSON.stringify(reviewed.target) !== JSON.stringify(current.target)) {
      throw new Error("Plan was created for a different runtime/database target; no changes were made.");
    }
    const result = await importer.apply({ planHash: reviewed.planHash, actorUsername: null });
    console.log(`Import complete: ${result.inserted} bow discipline(s) added. Other disciplines were preserved.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
