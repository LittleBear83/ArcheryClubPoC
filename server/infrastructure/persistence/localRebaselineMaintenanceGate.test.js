import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { setImmediate } from "node:timers";
import {
  acquireLocalRebaselineMaintenanceGate,
  createLocalMutationMaintenanceGate,
  releaseLocalRebaselineMaintenanceGate,
} from "./localRebaselineMaintenanceGate.js";

function createLockDouble() {
  let exclusive = false;
  let shared = 0;

  const createClient = () => ({
    async query(sql) {
      if (sql.includes("pg_try_advisory_lock_shared")) {
        if (exclusive) return { rows: [{ acquired: false }] };
        shared += 1;
        return { rows: [{ acquired: true }] };
      }
      if (sql.includes("pg_advisory_unlock_shared")) {
        shared -= 1;
        return { rows: [{ pg_advisory_unlock_shared: true }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        exclusive = false;
        return { rows: [{ pg_advisory_unlock: true }] };
      }
      if (sql.includes("pg_advisory_lock")) {
        assert.equal(shared, 0, "rebaseline must wait for mutations already in progress");
        exclusive = true;
        return { rows: [{}] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  });

  return {
    createClient,
    get exclusive() { return exclusive; },
    get shared() { return shared; },
    pool: { async connect() { return createClient(); } },
  };
}

function createResponseDouble() {
  const res = new EventEmitter();
  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    res.emit("finish");
    return res;
  };
  return res;
}

test("a Pi mutation cannot enter after outbox drain and before snapshot commit", async () => {
  const locks = createLockDouble();
  const rebaselineClient = locks.createClient();
  const middleware = createLocalMutationMaintenanceGate({
    isLocalPiNode: true,
    pool: locks.pool,
  });

  await acquireLocalRebaselineMaintenanceGate(rebaselineClient);
  const outboxDrained = true;
  const snapshotCommitted = false;
  const response = createResponseDouble();
  let enteredMutation = false;
  await middleware(
    { method: "POST", path: "/api/events/1/book" },
    response,
    () => { enteredMutation = true; },
  );

  assert.equal(outboxDrained, true);
  assert.equal(snapshotCommitted, false);
  assert.equal(enteredMutation, false);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "local_rebaseline_in_progress");
  await releaseLocalRebaselineMaintenanceGate(rebaselineClient);
});

test("the maintenance gate clears after rebaseline failure and reads remain available", async () => {
  const locks = createLockDouble();
  const rebaselineClient = locks.createClient();
  const middleware = createLocalMutationMaintenanceGate({
    isLocalPiNode: true,
    pool: locks.pool,
  });

  await assert.rejects((async () => {
    await acquireLocalRebaselineMaintenanceGate(rebaselineClient);
    try {
      throw new Error("snapshot failed");
    } finally {
      await releaseLocalRebaselineMaintenanceGate(rebaselineClient);
    }
  })(), /snapshot failed/);
  assert.equal(locks.exclusive, false);

  const mutationResponse = createResponseDouble();
  let mutationEntered = false;
  await middleware(
    { method: "POST", path: "/api/events/1/book" },
    mutationResponse,
    () => { mutationEntered = true; },
  );
  assert.equal(mutationEntered, true);
  assert.equal(locks.shared, 1);
  mutationResponse.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(locks.shared, 0);

  let readEntered = false;
  await acquireLocalRebaselineMaintenanceGate(rebaselineClient);
  await middleware(
    { method: "GET", path: "/api/events" },
    createResponseDouble(),
    () => { readEntered = true; },
  );
  assert.equal(readEntered, true);
  await releaseLocalRebaselineMaintenanceGate(rebaselineClient);
});

test("a shared-lock acquisition query failure discards the PostgreSQL client", async () => {
  const acquisitionError = new Error("connection lost during advisory lock acquisition");
  const releaseArguments = [];
  const client = {
    async query() { throw acquisitionError; },
    release(error) { releaseArguments.push(error); },
  };
  const middleware = createLocalMutationMaintenanceGate({
    isLocalPiNode: true,
    pool: { async connect() { return client; } },
  });
  let nextError;

  await middleware(
    { method: "POST", path: "/api/events/1/book" },
    createResponseDouble(),
    (error) => { nextError = error; },
  );

  assert.equal(nextError, acquisitionError);
  assert.deepEqual(releaseArguments, [acquisitionError]);
});
