import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("calendar retains simultaneous course identities and labels taster sessions correctly", async () => {
  const source = await readFile(path.join(__dirname, "index.js"), "utf8");
  const functionSource = source.slice(
    source.indexOf("async function buildBeginnersCourseCalendarLessons("),
    source.indexOf("async function buildEventBookingsMap("),
  );
  const courses = ["beginners", "have-a-go", "taster-session"].map((course_type, index) => ({
    id: index + 1, course_type, approval_status: "approved", beginner_capacity: 8,
  }));
  const gateway = {
    listCourses: async () => courses,
    listLessons: async () => courses.map((course) => ({
      id: course.id, course_id: course.id, lesson_number: 1,
      lesson_date: "2026-09-07", start_time: "19:00", end_time: "21:00",
    })),
    listParticipants: async () => [],
    listLessonCoaches: async () => [],
  };
  const groupRowsBy = (rows, key) => {
    const groups = new Map();
    for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
    return groups;
  };
  // Exercise the actual builder without booting the server or accessing a database.
  const build = new Function("beginnersCourseReadGateway", "normalizeCourseType", "groupRowsBy", "getUserDisplayName",
    `${functionSource}; return buildBeginnersCourseCalendarLessons;`)(gateway, (type) => type, groupRowsBy, () => "Coordinator");
  const lessons = await build();
  assert.equal(lessons.length, 3);
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, 3);
  assert.deepEqual(lessons.map((lesson) => lesson.title), ["Beginners course", "Have a Go session", "Taster session"]);
  assert.equal((await build("taster-session")).length, 1);
});

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
