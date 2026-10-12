import assert from "node:assert/strict";
import test from "node:test";
import { registerGoldenRecordsNightlySyncRoute } from "./registerGoldenRecordsNightlySyncRoute.js";

const JOB_NAME = "projects/example/locations/europe-west2/jobs/golden-records-nightly";

function makeRoute({ enabled = true, now = () => Date.parse("2026-07-12T00:01:00Z"), start = async () => ({ started: true, completion: Promise.resolve({ state: "completed" }) }) } = {}) {
  let handler;
  registerGoldenRecordsNightlySyncRoute({
    app: { post: (_path, callback) => { handler = callback; } },
    enabled,
    expectedJobName: JOB_NAME,
    goldenRecordsSyncJob: { start },
    logger: { error() {} },
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
  assert.equal(starts, 0);
});

test("nightly endpoint awaits completion and returns retryable failures", async () => {
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const calls = [];
  const call = makeRoute({ start: async (args) => { calls.push(args); return { started: true, completion: gate }; } });
  const headers = { "X-CloudScheduler-JobName": JOB_NAME, "X-CloudScheduler-ScheduleTime": "2026-07-12T00:00:00Z" };
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
