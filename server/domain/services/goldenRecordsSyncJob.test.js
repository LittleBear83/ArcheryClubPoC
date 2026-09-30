import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsSyncJob } from "./goldenRecordsSyncJob.js";

test("full-club sync keeps running after its initiating request is gone and blocks duplicates", async () => {
  let completeSync;
  const gate = new Promise((resolve) => { completeSync = resolve; });
  const statuses = [];
  const events = [];
  let released = 0;
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      findStatus: async () => statuses.at(-1) ?? null,
      upsertStatus: async (_key, value) => statuses.push(structuredClone(value)),
      tryAcquireMemberSyncLock: async () => async () => { released += 1; },
    },
    goldenRecordsMemberSyncService: {
      syncAllMembers: async ({ onProgress }) => {
        await onProgress({ attemptedCount: 1, matchedCount: 1, unmatchedCount: 0, achievementCount: 2, errorCount: 0 });
        await gate;
        return { attemptedCount: 1, matchedCount: 1, unmatchedCount: 0, achievementCount: 2, errorCount: 0, errors: [] };
      },
    },
    onFinished: (status) => events.push(status.state),
  });
  const started = await job.start({ actorUsername: "admin" });
  assert.equal(started.started, true);
  assert.equal(started.status.state, "running");
  assert.equal((await job.start({ actorUsername: "admin" })).started, false);
  // The request/session are no longer retained by the job. Completion comes from the server-owned promise.
  completeSync();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await job.getStatus()).state, "completed");
  assert.equal(statuses.at(-1).achievementCount, 2);
  assert.deepEqual(events, ["completed"]);
  assert.equal(released, 1);
});

test("job failures remain visible and release the concurrency lock", async () => {
  const statuses = [];
  let released = false;
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      findStatus: async () => statuses.at(-1) ?? null,
      upsertStatus: async (_key, value) => statuses.push(value),
      tryAcquireMemberSyncLock: async () => async () => { released = true; },
    },
    goldenRecordsMemberSyncService: { syncAllMembers: async () => { throw new Error("upstream unavailable"); } },
    logger: { error() {} },
  });
  await job.start({ actorUsername: "admin" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await job.getStatus()).state, "failed");
  assert.match((await job.getStatus()).failureMessage, /upstream unavailable/);
  assert.equal(released, true);
});

test("database lock rejects a second server instance without starting another sync", async () => {
  let calls = 0;
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      tryAcquireMemberSyncLock: async () => null,
      findStatus: async () => ({ id: "other-instance", state: "running" }),
    },
    goldenRecordsMemberSyncService: { syncAllMembers: async () => { calls += 1; } },
  });
  const result = await job.start({ actorUsername: "admin" });
  assert.equal(result.started, false);
  assert.equal(result.status.id, "other-instance");
  assert.equal(calls, 0);
});

test("a persisted running job without its advisory lock is marked interrupted", async () => {
  let status = { id: "orphan", state: "running", startedAt: "2026-01-01T00:00:00.000Z" };
  let releases = 0;
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      findStatus: async () => status,
      upsertStatus: async (_key, value) => { status = value; },
      tryAcquireMemberSyncLock: async () => async () => { releases += 1; },
    },
    goldenRecordsMemberSyncService: { syncAllMembers: async () => { throw new Error("unexpected"); } },
  });
  const recovered = await job.getStatus();
  assert.equal(recovered.id, "orphan");
  assert.equal(recovered.state, "interrupted");
  assert.match(recovered.failureMessage, /server stopped|execution ended/i);
  assert.ok(recovered.completedAt);
  assert.equal(releases, 1);
});

test("a new job can start after orphan recovery", async () => {
  let status = { id: "orphan", state: "running", startedAt: "2026-01-01T00:00:00.000Z" };
  let releases = 0;
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      findStatus: async () => status,
      upsertStatus: async (_key, value) => { status = value; },
      tryAcquireMemberSyncLock: async () => async () => { releases += 1; },
    },
    goldenRecordsMemberSyncService: {
      syncAllMembers: async () => ({ attemptedCount: 0, matchedCount: 0, unmatchedCount: 0, achievementCount: 0, errorCount: 0 }),
    },
  });
  const started = await job.start({ actorUsername: "admin" });
  assert.equal(started.started, true);
  assert.notEqual(started.status.id, "orphan");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await job.getStatus()).state, "completed");
  assert.equal(releases, 1);
});

test("an advisory-locked running job is not recovered by another instance", async () => {
  let writes = 0;
  const status = { id: "active", state: "running" };
  const job = createGoldenRecordsSyncJob({
    goldenRecordsIntegrationGateway: {
      findStatus: async () => status,
      upsertStatus: async () => { writes += 1; },
      tryAcquireMemberSyncLock: async () => null,
    },
    goldenRecordsMemberSyncService: { syncAllMembers: async () => { throw new Error("unexpected"); } },
  });
  assert.equal((await job.getStatus()).state, "running");
  assert.equal((await job.start({ actorUsername: "admin" })).started, false);
  assert.equal(writes, 0);
});

test("Cloud Run without confirmed background CPU refuses to start a detached job", async () => {
  let calls = 0;
  const job = createGoldenRecordsSyncJob({
    backgroundExecutionAvailable: false,
    goldenRecordsIntegrationGateway: {
      findStatus: async () => null,
      tryAcquireMemberSyncLock: async () => { calls += 1; return async () => {}; },
    },
    goldenRecordsMemberSyncService: { syncAllMembers: async () => { calls += 1; } },
  });
  assert.deepEqual(await job.start({ actorUsername: "admin" }), { started: false, unavailable: true, status: null });
  assert.equal(calls, 0);
});
