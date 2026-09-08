import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import process from "node:process";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { createSseParser, runLiveSyncWatcher, runLocalSyncChild, validateWatcherConfig } from "./liveSyncWatcher.mjs";

const sync = {
  nodeMode: "local-pi", apiBaseUrl: "https://sync.example.test/",
  machineId: "pi-1", machineSecret: "private-machine-secret",
};
const frame = (checkpoint, event = "sync.available") =>
  `event: ${event}\ndata: ${JSON.stringify({ checkpoint })}\n\n`;
const publicationFrame = (checkpoint, event = "sync.available", feedVersion = "sync-publication-v2") =>
  `event: ${event}\ndata: ${JSON.stringify({ checkpoint, feedVersion })}\n\n`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
async function until(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await nextTurn();
  }
  assert.fail("Expected watcher activity did not occur");
}

function harness(t, overrides = {}) {
  const abort = new AbortController();
  const state = { local: overrides.publicationSync ? "100" : 100, reads: 0, runs: 0, requests: [], streams: [], waits: [], logs: [] };
  function fetchStream(url, options) {
    state.requests.push({ url: String(url), ...options });
    let controller;
    const onAbort = () => controller.error(new Error(sync.machineSecret));
    const body = new ReadableStream({
      start(value) { controller = value; },
      cancel() { options.signal.removeEventListener("abort", onAbort); },
    });
    options.signal.addEventListener("abort", onAbort, { once: true });
    state.streams.push({
      push(text) { controller.enqueue(typeof text === "string" ? new TextEncoder().encode(text) : text); },
      end() { options.signal.removeEventListener("abort", onAbort); controller.close(); },
      fail() { controller.error(new Error(sync.machineSecret)); },
    });
    return Promise.resolve({ ok: true, headers: new Headers({ "content-type": "text/event-stream; charset=utf-8" }), body });
  }
  const task = runLiveSyncWatcher({
    sync, signal: abort.signal,
    fetchImpl: (url, options) => overrides.fetchImpl ? overrides.fetchImpl(url, options, fetchStream) : fetchStream(url, options),
    readCheckpoint: async () => {
      state.reads += 1;
      return overrides.readCheckpoint ? overrides.readCheckpoint(state) : state.local;
    },
    runSync: async (signal) => {
      state.runs += 1;
      if (overrides.runSync) return overrides.runSync(state, signal);
      state.local = 1000;
    },
    log: (message) => state.logs.push(message),
    publicationSync: overrides.publicationSync ?? false,
    wait: (ms, signal) => {
      const pending = deferred();
      state.waits.push({ ms, resolve: pending.resolve });
      signal.addEventListener("abort", pending.resolve, { once: true });
      return pending.promise.finally(() => signal.removeEventListener("abort", pending.resolve));
    },
  });
  t.after(async () => { abort.abort(); await task; });
  return { state, task, abort };
}

test("watcher requires local-pi and rejects invalid or credential-bearing base URLs safely", () => {
  for (const config of [
    { ...sync, nodeMode: "standalone" }, { ...sync, nodeMode: "cloud-server" },
    { ...sync, machineSecret: "" }, { ...sync, apiBaseUrl: sync.machineSecret },
    { ...sync, apiBaseUrl: `https://pi:${sync.machineSecret}@example.test/` },
  ]) {
    assert.throws(() => validateWatcherConfig(config), (error) => !String(error).includes(sync.machineSecret));
  }
});

test("fetch sends credentials only in headers and refuses redirects", async (t) => {
  const { state } = harness(t);
  await until(() => state.requests.length === 1);
  const request = state.requests[0];
  assert.equal(request.url, "https://sync.example.test/api/sync/v1/events");
  assert.equal(request.method, "GET");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers["x-sync-machine-id"], sync.machineId);
  assert.equal(request.headers["x-sync-machine-secret"], sync.machineSecret);
  assert.equal(request.url.includes(sync.machineSecret), false);
  assert.equal(request.url.includes(sync.machineId), false);
});

test("v2 watcher uses the publication event stream and requires an initialized string checkpoint", async (t) => {
  const { state } = harness(t, { publicationSync: true });
  await until(() => state.requests.length === 1);
  assert.equal(state.requests[0].url, "https://sync.example.test/api/sync/v2/events");
  assert.equal(state.reads, 1, "v2 validates local state before opening the stream");
});

test("v2 watcher refuses operation before publication state initialization", async () => {
  const controller = new AbortController();
  let fetches = 0;
  await assert.rejects(runLiveSyncWatcher({
    sync,
    signal: controller.signal,
    readCheckpoint: async () => { throw new Error("v2 baseline missing"); },
    runSync: async () => assert.fail("must not sync"),
    fetchImpl: async () => { fetches += 1; assert.fail("must not connect"); },
    publicationSync: true,
  }), /v2 baseline missing/);
  assert.equal(fetches, 0);
});

test("v2 watcher ignores missing or mismatched feeds and non-string cursors", async (t) => {
  const { state } = harness(t, { publicationSync: true });
  await until(() => state.streams.length === 1);
  state.streams[0].push(publicationFrame("101", "sync.ready", "sync-publication-v3"));
  state.streams[0].push(frame("101"));
  state.streams[0].push(publicationFrame(101));
  state.streams[0].push(publicationFrame("01"));
  state.streams[0].push(publicationFrame("+101"));
  state.streams[0].push(publicationFrame("9223372036854775808"));
  await nextTurn();
  assert.equal(state.runs, 0);
  assert.equal(state.reads, 1);
  state.streams[0].push(publicationFrame("101"));
  await until(() => state.runs === 1);
});

test("v2 watcher compares BIGINT cursors exactly and ignores stale repeated hints", async (t) => {
  const { state } = harness(t, { publicationSync: true });
  state.local = "9007199254740993";
  await until(() => state.streams.length === 1);
  state.streams[0].push(publicationFrame("9007199254740992", "sync.ready"));
  state.streams[0].push(publicationFrame("9007199254740993"));
  state.streams[0].push(publicationFrame("9007199254740993"));
  await until(() => state.reads > 1);
  assert.equal(state.runs, 0);
  state.streams[0].push(publicationFrame("9007199254740994"));
  await until(() => state.runs === 1);
});

test("v2 hints coalesce while a child is running and use the committed publication checkpoint", async (t) => {
  const firstPass = deferred();
  t.after(() => firstPass.resolve());
  let active = 0;
  let maxActive = 0;
  const { state } = harness(t, {
    publicationSync: true,
    runSync: async (current) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (current.runs === 1) {
        await firstPass.promise;
        current.local = "101";
      } else current.local = "104";
      active -= 1;
    },
  });
  await until(() => state.streams.length === 1);
  state.streams[0].push(publicationFrame("101"));
  await until(() => state.runs === 1);
  state.streams[0].push(publicationFrame("102") + publicationFrame("104") + publicationFrame("103"));
  firstPass.resolve();
  await until(() => state.runs === 2 && state.local === "104" && active === 0);
  assert.equal(maxActive, 1);
  assert.ok(state.reads >= 5, "initial, before, and committed-after checkpoints are read");
});

test("v2 reconnect retains exact cursor handling and catches a missed change", async (t) => {
  const { state } = harness(t, { publicationSync: true });
  await until(() => state.streams.length === 1);
  state.streams[0].fail();
  await until(() => state.waits.length === 1);
  state.waits[0].resolve();
  await until(() => state.streams.length === 2);
  state.streams[1].push(publicationFrame("101", "sync.ready"));
  await until(() => state.runs === 1);
});

test("v2 child failure backs off without losing the publication target", async (t) => {
  const { state } = harness(t, {
    publicationSync: true,
    runSync: async (current) => {
      if (current.runs === 1) throw new Error(sync.machineSecret);
      current.local = "104";
    },
  });
  await until(() => state.streams.length === 1);
  state.streams[0].push(publicationFrame("104"));
  await until(() => state.waits.length === 1);
  state.waits[0].resolve();
  await until(() => state.runs === 2 && state.local === "104");
  assert.equal(state.logs.join(" ").includes(sync.machineSecret), false);
});

for (const event of ["sync.ready", "sync.available"]) {
  test(`${event} ahead triggers sync and re-reads the local checkpoint`, async (t) => {
    const { state } = harness(t);
    state.streams[0].push(frame(101, event));
    await until(() => state.reads === 2);
    assert.equal(state.runs, 1);
    assert.equal(state.local, 1000);
  });
}

test("equal and older checkpoints do not launch sync", async (t) => {
  const { state } = harness(t);
  state.streams[0].push(frame(100, "sync.ready") + frame(99));
  await until(() => state.reads > 0);
  assert.equal(state.runs, 0);
});

for (const catchesUp of [true, false]) {
  test(`burst during a running sync coalesces into ${catchesUp ? "one pass" : "one follow-up pass"}`, async (t) => {
    const firstPass = deferred();
    t.after(() => firstPass.resolve());
    let active = 0;
    let maxActive = 0;
    const { state } = harness(t, { runSync: async (current) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (current.runs === 1) {
        await firstPass.promise;
        current.local = catchesUp ? 104 : 101;
      } else current.local = 104;
      active -= 1;
    } });
    state.streams[0].push(frame(101));
    await until(() => state.runs === 1);
    state.streams[0].push(frame(102) + frame(103) + frame(104) + frame(102));
    await nextTurn();
    assert.equal(state.runs, 1);
    firstPass.resolve();
    await until(() => state.local === 104 && active === 0);
    await nextTurn();
    assert.equal(state.runs, catchesUp ? 1 : 2);
    assert.ok(state.reads >= 2);
    assert.equal(maxActive, 1);
  });
}

test("malformed/unknown events and heartbeat comments do not trigger sync", async (t) => {
  const { state } = harness(t);
  state.streams[0].push(': ping\n\nevent: sync.available\ndata: invalid\n\n');
  for (const value of [null, [], {}, { checkpoint: "101" }, { checkpoint: -1 }, { checkpoint: 1.5 }]) {
    state.streams[0].push(`event: sync.available\ndata: ${JSON.stringify(value)}\n\n`);
  }
  state.streams[0].push(frame(101, "unknown"));
  await nextTurn();
  assert.equal(state.reads, 0);
  assert.equal(state.runs, 0);
  state.streams[0].push(frame(101));
  await until(() => state.runs === 1);
});

test("SSE survives byte/chunk boundaries and multiline data with CRLF", async (t) => {
  const { state } = harness(t);
  const bytes = new TextEncoder().encode('event: sync.ready\r\ndata: {"checkpoint":101,\r\ndata: "domain":"é"}\r\n\r\n');
  for (const byte of bytes) state.streams[0].push(new Uint8Array([byte]));
  await until(() => state.runs === 1);
});

test("parser bounds oversized events and recovers at the next frame", () => {
  const events = [];
  const parse = createSseParser((event) => events.push(event));
  parse(`event: sync.ready\ndata: ${"x".repeat(70000)}\n\n`);
  parse(frame(102));
  assert.deepEqual(events, [{ event: "sync.available", data: '{"checkpoint":102}' }]);
});

test("HTTP failures and invalid SSE responses use bounded backoff without exposing errors", async (t) => {
  let calls = 0;
  const { state } = harness(t, { fetchImpl: async () => {
    calls += 1;
    if (calls % 3 === 1) throw new Error(sync.machineSecret);
    return { ok: calls % 3 === 0, headers: new Headers({ "content-type": "application/json" }), body: {} };
  } });
  for (let i = 0; i < 8; i += 1) {
    await until(() => state.waits.length === i + 1);
    if (i < 7) state.waits[i].resolve();
  }
  assert.deepEqual(state.waits.map(({ ms }) => ms), [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000]);
  assert.equal(state.runs, 0);
  assert.equal(state.logs.join(" ").includes(sync.machineSecret), false);
});

test("stream loss reconnects, resets backoff and later ready catches missed changes", async (t) => {
  let attempts = 0;
  const { state } = harness(t, { fetchImpl: (url, options, connect) => {
    attempts += 1;
    if (attempts < 3) throw new Error(sync.machineSecret);
    return connect(url, options);
  } });
  await until(() => state.waits.length === 1);
  state.waits[0].resolve();
  await until(() => state.waits.length === 2);
  state.waits[1].resolve();
  await until(() => state.streams.length === 1);
  state.streams[0].push(frame(100, "sync.ready"));
  state.streams[0].fail();
  await until(() => state.waits.length === 3);
  assert.equal(state.waits[2].ms, 1000);
  state.waits[2].resolve();
  await until(() => state.streams.length === 2);
  state.streams[1].push(frame(105, "sync.ready"));
  await until(() => state.runs === 1);
  state.streams[1].end();
  await until(() => state.waits.length === 4);
  assert.equal(state.waits[3].ms, 1000);
  assert.equal(state.logs.join(" ").includes(sync.machineSecret), false);
});

test("shutdown aborts the active stream and prevents reconnect or another sync", async (t) => {
  const { state, abort, task } = harness(t);
  await until(() => state.streams.length === 1);
  abort.abort();
  await task;
  assert.equal(state.requests[0].signal.aborted, true);
  assert.equal(state.requests.length, 1);
  assert.equal(state.waits.length, 0);
  assert.equal(state.runs, 0);
});

test("shutdown cancels reconnect backoff", async (t) => {
  let calls = 0;
  const { state, abort, task } = harness(t, { fetchImpl: () => {
    calls += 1;
    throw new Error(sync.machineSecret);
  } });
  await until(() => state.waits.length === 1);
  abort.abort();
  await task;
  assert.equal(calls, 1);
});

test("shutdown waits for the active child and does not run a pending follow-up", async (t) => {
  const child = deferred();
  t.after(() => child.resolve());
  const { state, abort, task } = harness(t, { runSync: () => child.promise });
  state.streams[0].push(frame(101));
  await until(() => state.runs === 1);
  state.streams[0].push(frame(104));
  abort.abort();
  let finished = false;
  task.then(() => { finished = true; });
  await nextTurn();
  assert.equal(finished, false);
  child.resolve();
  await task;
  assert.equal(state.runs, 1);
});

for (const fails of [true, false]) {
  test(`${fails ? "failed" : "no-progress"} sync backs off and retains the highest target`, async (t) => {
    const { state } = harness(t, { runSync: async (current) => {
      if (current.runs === 1) {
        if (fails) throw new Error(sync.machineSecret);
      } else current.local = 104;
    } });
    state.streams[0].push(frame(104));
    await until(() => state.waits.length === 1);
    assert.equal(state.runs, 1);
    assert.equal(state.waits[0].ms, 1000);
    state.waits[0].resolve();
    await until(() => state.local === 104);
    assert.equal(state.runs, 2);
    assert.equal(state.logs.join(" ").includes(sync.machineSecret), false);
  });
}

test("75 second watchdog tolerates heartbeats and aborts an idle stream", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { state } = harness(t);
  await nextTurn();
  for (let i = 0; i < 4; i += 1) {
    t.mock.timers.tick(25000);
    state.streams[0].push(": ping\n\n");
    await nextTurn();
    assert.equal(state.requests[0].signal.aborted, false);
  }
  t.mock.timers.tick(75000);
  await until(() => state.waits.length === 1);
  assert.equal(state.requests[0].signal.aborted, true);
  assert.equal(state.runs, 0);
});

test("child uses existing normal sync script without credentials or inherited output", async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  const promise = runLocalSyncChild(controller.signal, { spawnProcess(command, args, options) {
    assert.equal(command, process.execPath);
    assert.equal(args.length, 1);
    assert.match(args[0], /syncLocalDatabase\.mjs$/);
    assert.equal(options.stdio, "ignore");
    assert.equal(options.shell, false);
    assert.equal(JSON.stringify({ args, options }).includes(sync.machineSecret), false);
    return child;
  } });
  child.emit("exit", 0);
  await promise;
});

test("v2 child explicitly launches the local sync script in publication mode", async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  const promise = runLocalSyncChild(controller.signal, {
    publicationSync: true,
    spawnProcess(_command, args) {
      assert.equal(args.length, 2);
      assert.match(args[0], /syncLocalDatabase\.mjs$/);
      assert.equal(args[1], "--v2");
      return child;
    },
  });
  child.emit("exit", 0);
  await promise;
});

test("child shutdown allows a grace period then uses TERM and KILL", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  const child = new EventEmitter();
  const signals = [];
  child.kill = (signal) => signals.push(signal);
  const promise = runLocalSyncChild(controller.signal, { spawnProcess: () => child });
  controller.abort();
  t.mock.timers.tick(29999);
  assert.deepEqual(signals, []);
  t.mock.timers.tick(1);
  assert.deepEqual(signals, ["SIGTERM"]);
  t.mock.timers.tick(5000);
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  child.emit("exit", null);
  await promise;
});

test("child failures are sanitized and an aborted watcher cannot spawn", async () => {
  await assert.rejects(runLocalSyncChild(new AbortController().signal, {
    spawnProcess() { throw new Error(sync.machineSecret); },
  }), { message: "Local sync process failed." });
  const controller = new AbortController();
  controller.abort();
  await runLocalSyncChild(controller.signal, { spawnProcess() { assert.fail("must not spawn"); } });
});
