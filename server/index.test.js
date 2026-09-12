import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("beginners course write gateway receives participant deletion support", async () => {
  const source = await readFile(path.join(__dirname, "index.js"), "utf8");

  assert.match(
    source,
    /createBeginnersCourseWriteGateway\(\{\s*[\s\S]*?deleteBeginnersCourseParticipant,/,
  );
});

test("local Pi blocks cloud-authoritative committee minute writes", async () => {
  const source = await readFile(path.join(__dirname, "index.js"), "utf8");

  assert.match(
    source,
    /app\.use\("\/api\/committee-minutes",/,
  );

  assert.match(
    source,
    /Committee minutes are cloud-authoritative and unavailable for editing on the Pi\./,
  );
});

test("schedule route wiring passes the local Pi flag only to schedule routes", async () => {
  const source = await readFile(path.join(__dirname, "index.js"), "utf8");
  const memberQuestionCall = source.slice(
    source.indexOf("registerMemberQuestionRoutes({"),
    source.indexOf("registerCommitteeMinutesRoutes({"),
  );
  const scheduleCall = source.slice(
    source.indexOf("registerScheduleRoutes({"),
    source.indexOf("registerMemberActivityRoutes({"),
  );

  assert.match(
    scheduleCall,
    /isLocalPiNode: serverRuntime\.sync\.isLocalPiNode,/,
  );
  assert.doesNotMatch(
    memberQuestionCall,
    /isLocalPiNode: serverRuntime\.sync\.isLocalPiNode,/,
  );
});

test("the rebaseline maintenance gate encloses outbox drain and snapshot application", async () => {
  const serverSource = await readFile(path.join(__dirname, "index.js"), "utf8");
  const syncSource = await readFile(
    path.join(__dirname, "../scripts/syncLocalDatabase.mjs"),
    "utf8",
  );
  const mainSource = syncSource.slice(syncSource.indexOf("async function main()"));
  const acquireIndex = mainSource.indexOf("await acquireLocalRebaselineMaintenanceGate(client)");
  const drainIndex = mainSource.indexOf("await drainPendingOutboxCommands(");
  const snapshotIndex = mainSource.indexOf("await applyPublicationSnapshot(");
  const releaseIndex = mainSource.indexOf("await releaseLocalRebaselineMaintenanceGate(client)");

  assert.ok(acquireIndex >= 0 && acquireIndex < drainIndex);
  assert.ok(drainIndex < snapshotIndex && snapshotIndex < releaseIndex);
  assert.match(
    serverSource,
    /app\.use\(createLocalMutationMaintenanceGate\(\{\s*isLocalPiNode: serverRuntime\.sync\.isLocalPiNode,\s*pool: db\.pool,/,
  );
});
