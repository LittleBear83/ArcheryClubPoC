import assert from "node:assert/strict";
import { test } from "node:test";
import { createSyncGateway } from "./syncGateway.js";

function createClientDouble() {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        queries.push({ sql: String(sql).replace(/\s+/g, " ").trim(), values });
        return { rowCount: 1, rows: [] };
      },
    },
    queries,
  };
}

test("only a local Pi node can add a login event to the sync outbox", async () => {
  const cloud = createClientDouble();
  const local = createClientDouble();
  const cloudGateway = createSyncGateway({ pool: cloud.client });
  const localGateway = createSyncGateway({ pool: local.client });

  await cloudGateway.enqueueLoginEvent({
    client: cloud.client,
    eventId: "cloud-event",
    loggedInDate: "2026-09-01",
    loggedInTime: "10:00:00.000Z",
    loginMethod: "password",
    machineId: "pi-1",
    sourceNodeMode: "cloud-server",
    username: "robin",
  });
  await localGateway.enqueueLoginEvent({
    client: local.client,
    eventId: "pi-event",
    loggedInDate: "2026-09-01",
    loggedInTime: "10:00:00.000Z",
    loginMethod: "password",
    machineId: "pi-1",
    sourceNodeMode: "local-pi",
    username: "robin",
  });

  assert.equal(cloud.queries.some((entry) => entry.sql.includes("INSERT INTO sync_local_outbox")), false);
  assert.equal(local.queries.some((entry) => entry.sql.includes("INSERT INTO sync_local_outbox")), true);
});
