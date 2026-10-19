import assert from "node:assert/strict";
import test from "node:test";
import { registerGoldenRecordsManualSyncRoute } from "./registerGoldenRecordsManualSyncRoute.js";

const id = "11111111-1111-4111-8111-111111111111";
test("manual worker validates task headers and awaits durable completion", async () => {
  let handler;
  let finish;
  const completion = new Promise((resolve) => { finish = resolve; });
  registerGoldenRecordsManualSyncRoute({
    app: { post: (_path, fn) => { handler = fn; } }, enabled: true,
    expectedQueueName: "projects/club/locations/europe-west2/queues/manual",
    goldenRecordsSyncJob: { start: async ({ jobId, waitForCompletion }) => {
      assert.equal(jobId, id);
      assert.equal(waitForCompletion, true);
      return { started: true, completion };
    } },
  });
  const call = async (headers) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { id, actorUsername: "admin" }, get: (name) => headers[name] }, res);
    return res;
  };
  assert.equal((await call({})).code, 403);
  const headers = { "X-CloudTasks-QueueName": "manual", "X-CloudTasks-TaskName": `gr-${id}` };
  const pending = call(headers);
  await new Promise((resolve) => setTimeout(resolve, 0));
  finish({ state: "completed" });
  assert.equal((await pending).code, 200);
});
