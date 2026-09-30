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
