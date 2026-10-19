import assert from "node:assert/strict";
import test from "node:test";
import { registerGoldenRecordsNightlySyncRoute } from "./registerGoldenRecordsNightlySyncRoute.js";

const JOB_NAME = "projects/project-80fa0060-de93-4eb6-ab4/locations/europe-west2/jobs/selby-golden-records-nightly";
const SCHEDULE_TIME = "2026-07-12T00:00:00+00:00";
const VALID_HEADERS = { "X-CloudScheduler-JobName": JOB_NAME, "X-CloudScheduler-ScheduleTime": SCHEDULE_TIME };

function makeRoute({ enabled = true, expectedJobName = JOB_NAME, logger = { warn() {}, error() {} }, now = () => Date.parse("2026-07-12T00:01:00Z"), start = async () => ({ started: true, completion: Promise.resolve({ state: "completed" }) }) } = {}) {
  let handler;
  registerGoldenRecordsNightlySyncRoute({
    app: { post: (_path, callback) => { handler = callback; } },
    enabled,
    expectedJobName,
    goldenRecordsSyncJob: { start },
    logger,
    now,
  });
  return async (headers = {}) => {
    const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ get: (name) => headers[name] }, response);
    return response;
  };
}

test("nightly endpoint is absent on the public service and rejects wrong scheduler identity", async () => {
  let starts = 0;
  const start = async () => { starts++; return { started: true }; };
  assert.equal((await makeRoute({ enabled: false, start })()).code, 404);
  assert.equal((await makeRoute({ start })()).code, 403);
  assert.equal((await makeRoute({ start })({ "X-CloudScheduler-JobName": "wrong" })).code, 403);
  assert.equal((await makeRoute({ start })({ ...VALID_HEADERS, "X-CloudScheduler-JobName": "projects/other/locations/europe-west2/jobs/selby-golden-records-nightly" })).code, 403);
  assert.equal(starts, 0);
});

test("nightly endpoint requires the exact production Scheduler resource name", async () => {
  const call = makeRoute({ expectedJobName: JOB_NAME });
  assert.equal((await call(VALID_HEADERS)).code, 200);
  assert.equal((await call({ ...VALID_HEADERS, "X-CloudScheduler-JobName": "selby-golden-records-nightly" })).code, 403);
});

test("nightly endpoint parses RFC 3339 schedule times with a nonzero offset", async () => {
  const scheduledDates = [];
  const call = makeRoute({ start: async ({ scheduledDate }) => {
    scheduledDates.push(scheduledDate);
    return { started: true, completion: Promise.resolve({ state: "completed" }) };
  } });
  assert.equal((await call({ ...VALID_HEADERS, "X-CloudScheduler-ScheduleTime": "2026-07-12T01:00:00+01:00" })).code, 200);
  assert.deepEqual(scheduledDates, ["2026-07-12"]);
});

test("nightly endpoint logs safe rejection reasons and header presence", async () => {
  const warnings = [];
  let starts = 0;
  const call = makeRoute({ logger: { warn: (...args) => warnings.push(args) }, start: async () => { starts++; } });
  const cases = [
    [{}, "job_name_missing", false, false],
    [{ "X-CloudScheduler-JobName": "wrong", "X-CloudScheduler-ScheduleTime": SCHEDULE_TIME }, "job_name_mismatch", true, true],
    [{ "X-CloudScheduler-JobName": JOB_NAME }, "schedule_time_missing", true, false],
    [{ ...VALID_HEADERS, "X-CloudScheduler-ScheduleTime": "not-a-time" }, "schedule_time_invalid", true, true],
    [{ ...VALID_HEADERS, "X-CloudScheduler-ScheduleTime": "2026-07-11T00:00:00Z" }, "schedule_time_out_of_window", true, true],
  ];
  for (const [headers, reason, jobNameHeaderPresent, scheduleTimeHeaderPresent] of cases) {
    assert.equal((await call(headers)).code, 403);
    assert.deepEqual(JSON.parse(warnings.at(-1)[0]), {
      severity: "WARNING",
      event: "golden_records.nightly_sync.rejected",
      reason,
      jobNameHeaderPresent,
      scheduleTimeHeaderPresent,
    });
    assert.equal(warnings.at(-1).length, 1);
  }
  assert.equal(starts, 0);
});

test("nightly endpoint awaits completion and returns retryable failures", async () => {
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const calls = [];
  const call = makeRoute({ start: async (args) => { calls.push(args); return { started: true, completion: gate }; } });
  const headers = VALID_HEADERS;
  const pending = call(headers);
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { actorUsername: "scheduler", scheduledDate: "2026-07-12", waitForCompletion: true });
  resolve({ state: "completed", attemptedCount: 10, matchedCount: 8 });
  assert.equal((await pending).code, 200);
  assert.equal((await makeRoute({ start: async () => ({ started: false, status: { state: "running" } }) })(headers)).code, 503);
  assert.equal((await makeRoute({ start: async () => ({ started: true, completion: Promise.resolve({ state: "failed" }) }) })(headers)).code, 500);
  assert.equal((await makeRoute({ start: async () => ({ started: true, completion: Promise.resolve({ state: "completed-with-errors" }) }) })(headers)).code, 500);
  assert.equal((await makeRoute({ start: async () => ({ started: false, alreadyCompleted: true, status: { state: "completed" } }) })(headers)).code, 200);
});

test("nightly retry keeps the original schedule time and completed runs are deduplicated", async () => {
  const calls = [];
  const call = makeRoute({
    now: () => Date.parse("2026-07-12T02:30:00Z"),
    start: async (args) => {
      calls.push(args);
      return calls.length === 1
        ? { started: true, completion: Promise.resolve({ state: "failed" }) }
        : { started: false, alreadyCompleted: true, status: { state: "completed" } };
    },
  });
  assert.equal((await call(VALID_HEADERS)).code, 500);
  const retry = await call(VALID_HEADERS);
  assert.equal(retry.code, 200);
  assert.equal(retry.body.skipped, true);
  assert.deepEqual(calls.map(({ scheduledDate }) => scheduledDate), ["2026-07-12", "2026-07-12"]);
});

test("nightly endpoint skips UTC trigger outside London's scheduled hour", async () => {
  let starts = 0;
  const call = makeRoute({ start: async () => { starts++; } });
  const response = await call({ "X-CloudScheduler-JobName": JOB_NAME, "X-CloudScheduler-ScheduleTime": "2026-07-12T01:00:00Z" });
  assert.equal(response.code, 200);
  assert.equal(response.body.skipped, true);
  assert.equal(starts, 0);
});

test("nightly endpoint rejects stale scheduler timestamps", async () => {
  const response = await makeRoute()({
    "X-CloudScheduler-JobName": JOB_NAME,
    "X-CloudScheduler-ScheduleTime": "2026-07-11T00:00:00Z",
  });
  assert.equal(response.code, 403);
});
