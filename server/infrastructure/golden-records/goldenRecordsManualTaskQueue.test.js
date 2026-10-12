import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsManualTaskQueue } from "./goldenRecordsManualTaskQueue.js";

test("manual task uses Cloud Run identity, OIDC and a stable task name", async () => {
  const calls = [];
  const queue = createGoldenRecordsManualTaskQueue({
    queueName: "projects/club/locations/europe-west2/queues/golden-records-manual",
    workerUrl: "https://worker.run.app",
    invokerServiceAccount: "tasks@club.iam.gserviceaccount.com",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.includes("metadata.google.internal")
        ? { ok: true, json: async () => ({ access_token: "token" }) }
        : { ok: true, status: 200 };
    },
  });
  await queue.enqueue({ id: "11111111-1111-4111-8111-111111111111", actorUsername: "admin" });
  assert.equal(calls.length, 2);
  const task = JSON.parse(calls[1].options.body).task;
  assert.match(task.name, /tasks\/gr-11111111-1111-4111-8111-111111111111$/);
  assert.equal(task.dispatchDeadline, "1800s");
  assert.equal(task.httpRequest.oidcToken.audience, "https://worker.run.app");
  assert.deepEqual(JSON.parse(Buffer.from(task.httpRequest.body, "base64").toString()), {
    id: "11111111-1111-4111-8111-111111111111", actorUsername: "admin",
  });
});

test("Cloud Tasks ALREADY_EXISTS confirms an ambiguous enqueue retry", async () => {
  const queue = createGoldenRecordsManualTaskQueue({
    queueName: "projects/club/locations/europe-west2/queues/golden-records-manual",
    workerUrl: "https://worker.run.app",
    invokerServiceAccount: "tasks@club.iam.gserviceaccount.com",
    fetchImpl: async (url) => url.includes("metadata.google.internal")
      ? { ok: true, json: async () => ({ access_token: "token" }) }
      : { ok: false, status: 409 },
  });
  await assert.doesNotReject(queue.enqueue({ id: "id", actorUsername: "admin" }));
});
