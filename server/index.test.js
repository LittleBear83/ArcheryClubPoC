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
