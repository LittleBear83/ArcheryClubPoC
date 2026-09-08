import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers";
import { test } from "node:test";
import ts from "typescript";
import { applyPulledSyncResponse } from "./localDatabaseSyncService.js";
import { createServerEventBus } from "./serverEventBus.js";
import { LOCAL_SYNC_EVENT_GROUPS, localSyncBrowserEventNames, publishLocalSyncBrowserEvents } from "./localSyncBrowserEvents.js";
import { notifyLocalSyncApplied, startLocalSyncBrowserBridge } from "../../infrastructure/persistence/localSyncBrowserBridge.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const change = (domain, key = domain) => ({
  domain, recordKey: key, operation: "delete",
  payload: { sync_id: key, role_key: key, username: key, machineSecret: "private-machine-secret" },
});

test("range presence invalidation includes member identity, role and discipline changes", () => {
  for (const domain of ["users", "user_types", "user_disciplines", "login_events", "guest_login_events", "range_presence_extensions"]) {
    assert.ok(localSyncBrowserEventNames([domain]).includes("range-members.updated"), domain);
  }
});

function application({ changes = [], rowCount = 1, failAt, notify, mode = "incremental" } = {}) {
  const queries = [];
  const domains = [];
  const client = {
    async query(sql) {
      const text = String(sql).trim().replace(/\s+/g, " ");
      queries.push(text);
      if (failAt && text.startsWith(failAt)) throw new Error("application failure");
      return { rows: [], rowCount: /^(INSERT|UPDATE|DELETE)/.test(text) ? rowCount : 0 };
    },
  };
  return {
    queries, domains,
    run: () => applyPulledSyncResponse({
      client, currentCheckpoint: 10, deactivatedRfidSuffix: "-deactivated",
      pullResponse: { mode, checkpoint: 12, changes, snapshot: { users: [] }, machineSecret: "private-machine-secret" },
      syncGateway: {
        async readLocalState() { return { state: { currentCheckpoint: 10 } }; },
        async writeLocalState() { queries.push("WRITE CHECKPOINT"); },
        async listPendingBookingOverlayCommands() { return []; },
      },
      onIncrementalApplied: async (applied) => {
        assert.equal(queries.at(-1), "COMMIT");
        domains.push(...applied);
        await notify?.(applied);
      },
    }),
  };
}

test("committed incremental writes coalesce domains and emit only existing lightweight browser events", async () => {
  const events = [];
  const app = application({
    changes: [change("club_events", "a"), change("club_events", "b"), change("coaching_sessions"), change("equipment_items")],
    notify: (domains) => publishLocalSyncBrowserEvents({ broadcastToAll: (...args) => events.push(args) }, domains),
  });
  await app.run();
  assert.deepEqual(app.domains, ["equipment_items", "club_events", "coaching_sessions"]);
  assert.deepEqual(events, [
    ["equipment.updated", {}], ["members.updated", {}], ["calendar.updated", {}], ["approvals.updated", {}],
  ]);
  assert.doesNotMatch(JSON.stringify(events), /private|sync_id|recordKey|machineSecret/);
});

test("empty, ignored, zero-row, and snapshot application emit no incremental hint", async () => {
  for (const options of [
    {}, { changes: [change("unknown")] }, { changes: [change("announcements")] },
    { changes: [change("club_events")], rowCount: 0 }, { mode: "snapshot" },
  ]) {
    const app = application(options);
    await app.run();
    assert.deepEqual(app.domains, []);
    assert.equal(app.queries.at(-1), "COMMIT");
  }
});

test("incremental inserts generate hints and duplicate login history generates none", async () => {
  const app = application({ changes: [{ ...change("roles"), operation: "upsert", payload: { role_key: "member", title: "Member" } }] });
  await app.run();
  assert.deepEqual(app.domains, ["roles"]);
  let notified = false;
  await applyPulledSyncResponse({
    client: { async query(sql) {
      if (String(sql).includes("SELECT id") && String(sql).includes("FROM login_events")) return { rows: [{ id: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    } },
    currentCheckpoint: 10,
    pullResponse: { mode: "incremental", checkpoint: 11, changes: [{ ...change("login_events"), operation: "upsert", payload: { sync_event_id: "already-present" } }] },
    syncGateway: { async readLocalState() { return {}; }, async writeLocalState() {} },
    onIncrementalApplied: () => { notified = true; },
  });
  assert.equal(notified, false);
});

test("failed application or COMMIT rolls back without notifying", async () => {
  for (const failAt of ["DELETE FROM club_events", "COMMIT"]) {
    const app = application({ changes: [change("equipment_items"), change("club_events")], failAt });
    await assert.rejects(app.run(), /application failure/);
    assert.deepEqual(app.domains, []);
    assert.equal(app.queries.at(-1), "ROLLBACK");
  }
});

test("notification failure leaves committed sync successful and other browser groups independent", async () => {
  const app = application({ changes: [change("club_events")], notify: () => { throw new Error("notification failure"); } });
  await app.run();
  assert.equal(app.queries.at(-1), "COMMIT");
  assert.ok(!app.queries.includes("ROLLBACK"));
  const delivered = [];
  publishLocalSyncBrowserEvents({ broadcastToAll(event) {
    if (event === "calendar.updated") throw new Error("broken browser");
    delivered.push(event);
  } }, ["club_events"]);
  assert.deepEqual(delivered, ["approvals.updated"]);
});

test("local database bridge sends committed hints through the actual browser event bus without data or credentials", async (t) => {
  const listener = new EventEmitter();
  const queries = [];
  const releases = [];
  listener.query = async (query) => { queries.push(query.text); };
  listener.release = (destroy) => releases.push(destroy);
  const bus = createServerEventBus();
  let wire = "";
  const connection = bus.addClient({ username: "kiosk", res: { write: (text) => { wire += text; } } });
  t.after(connection.disconnect);
  let refreshes = 0;
  const stop = startLocalSyncBrowserBridge({ pool: { connect: async () => listener }, serverEventBus: bus, isLocalPiNode: true,
    refreshRoleAccess: async () => { refreshes += 1; assert.equal(wire, ""); },
  });
  t.after(stop);
  await tick();
  assert.deepEqual(queries, ["LISTEN archery_local_sync_applied"]);
  const app = application({ changes: [change("roles"), change("roles", "another")], notify: (domains) => notifyLocalSyncApplied({
    async query(query) {
      assert.equal(app.queries.at(-1), "COMMIT");
      assert.equal(query.text, "SELECT pg_notify($1, $2)");
      assert.equal(query.query_timeout, 5000);
      assert.deepEqual(JSON.parse(query.values[1]), { domains: ["roles"] });
      listener.emit("notification", { channel: query.values[0], payload: query.values[1] });
    },
  }, domains) });
  await app.run();
  await tick();
  assert.equal(refreshes, 1);
  assert.equal(wire, "event: roles.updated\ndata: {}\n\n");
  for (const message of [
    { channel: "archery_sync_change", payload: JSON.stringify({ domains: ["users"] }) },
    { channel: "archery_local_sync_applied", payload: "invalid json" },
    { channel: "archery_local_sync_applied", payload: JSON.stringify({ domains: ["unknown", "__proto__", {}], machineSecret: "private" }) },
  ]) listener.emit("notification", message);
  await tick();
  assert.equal(wire, "event: roles.updated\ndata: {}\n\n");
  listener.emit("notification", { channel: "archery_local_sync_applied", payload: JSON.stringify({
    domains: ["announcements", "announcements"], machineSecret: "private", payload: { username: "secret" },
  }) });
  await tick();
  assert.equal(wire, "event: roles.updated\ndata: {}\n\nevent: announcements.updated\ndata: {}\n\n");
  stop();
  assert.deepEqual(releases, [true]);
  assert.equal(listener.listenerCount("notification"), 0);
});

test("local listener retries failures and cancels retries when stopped", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let attempts = 0;
  const listener = new EventEmitter();
  const releases = [];
  listener.query = async () => {};
  listener.release = (destroy) => releases.push(destroy);
  const stop = startLocalSyncBrowserBridge({ isLocalPiNode: true, pool: { async connect() {
    attempts += 1;
    if (attempts === 1) throw new Error("database unavailable");
    return listener;
  } } });
  t.after(stop);
  await tick();
  assert.equal(attempts, 1);
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(attempts, 2);
  listener.emit("error", new Error("connection lost"));
  assert.deepEqual(releases, [true]);
  stop();
  t.mock.timers.tick(5000);
  await tick();
  assert.equal(attempts, 2);
});

test("first successful LISTEN stays quiet and each restored listener catches up all groups once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const listeners = [];
  const events = [];
  const order = [];
  let refreshes = 0;
  let completeListen;
  const stop = startLocalSyncBrowserBridge({
    isLocalPiNode: true,
    pool: { async connect() {
      const listener = new EventEmitter();
      listener.release = () => {};
      listener.query = async ({ text }) => {
        assert.equal(text, "LISTEN archery_local_sync_applied");
        if (listeners.length === 1) throw new Error("initial LISTEN failed");
        await new Promise((resolve) => { completeListen = resolve; });
      };
      listeners.push(listener);
      return listener;
    } },
    refreshRoleAccess: async () => { refreshes += 1; order.push("refresh"); },
    serverEventBus: { broadcastToAll: (name, payload) => { events.push([name, payload]); order.push(name); } },
  });
  t.after(stop);
  await tick();
  t.mock.timers.tick(5000);
  await tick();
  completeListen();
  await tick();
  assert.equal(listeners.length, 2);
  assert.equal(refreshes, 0, "failed startup attempts do not make the first LISTEN a catch-up");
  assert.deepEqual(events, []);
  const expectedNames = [...new Set(Object.values(LOCAL_SYNC_EVENT_GROUPS).flat())];

  for (const loss of ["error", "end"]) {
    events.length = 0;
    order.length = 0;
    listeners.at(-1).emit(loss, new Error("connection lost"));
    t.mock.timers.tick(5000);
    await tick();
    assert.deepEqual(events, [], "catch-up waits for successful LISTEN");
    completeListen();
    await tick();
    assert.equal(order[0], "refresh");
    assert.deepEqual(events, expectedNames.map((name) => [name, {}]));
    assert.equal(new Set(events.map(([name]) => name)).size, events.length);
  }
  assert.equal(refreshes, 2);
});

test("catch-up failures leave the new listener connected and able to deliver later hints", async (t) => {
  for (const failure of ["role-refresh", "browser-publish"]) {
    await t.test(failure, async (t) => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const listeners = [];
      const releases = [];
      const events = [];
      let failCatchUp = true;
      let refreshes = 0;
      const stop = startLocalSyncBrowserBridge({
        isLocalPiNode: true,
        pool: { async connect() {
          const listener = new EventEmitter();
          listener.query = async () => {};
          listener.release = () => releases.push(listener);
          listeners.push(listener);
          return listener;
        } },
        refreshRoleAccess: async () => {
          refreshes += 1;
          if (failCatchUp && failure === "role-refresh") throw new Error("refresh unavailable");
        },
        serverEventBus: { broadcastToAll(name, payload) {
          if (failCatchUp && failure === "browser-publish") throw new Error("browser unavailable");
          events.push([name, payload]);
        } },
      });
      t.after(stop);
      await tick();
      listeners[0].emit("error", new Error("connection lost"));
      t.mock.timers.tick(5000);
      await tick();
      assert.equal(refreshes, 1);
      assert.deepEqual(releases, [listeners[0]]);
      assert.equal(listeners[1].listenerCount("notification"), 1);
      if (failure === "role-refresh") {
        assert.deepEqual(events, [...new Set(Object.values(LOCAL_SYNC_EVENT_GROUPS).flat())].map((name) => [name, {}]));
      }
      events.length = 0;
      failCatchUp = false;
      listeners[1].emit("notification", { channel: "archery_local_sync_applied", payload: JSON.stringify({ domains: ["announcements"] }) });
      await tick();
      assert.deepEqual(events, [["announcements.updated", {}]]);
      t.mock.timers.tick(5000);
      await tick();
      assert.equal(listeners.length, 2, "catch-up failure does not schedule another connection");
    });
  }
});

test("bridge is local-Pi only and closes connections acquired after shutdown", async () => {
  let connects = 0;
  startLocalSyncBrowserBridge({ pool: { connect() { connects += 1; } }, isLocalPiNode: false })();
  assert.equal(connects, 0);
  let finish;
  const stop = startLocalSyncBrowserBridge({ pool: { connect: () => new Promise((resolve) => { finish = resolve; }) }, isLocalPiNode: true });
  stop();
  const releases = [];
  finish({ release: (destroy) => releases.push(destroy) });
  await tick();
  assert.deepEqual(releases, [true]);
});

test("every mapped event reaches the existing React hook's query invalidations", async () => {
  // Execute the actual hook with tiny React/query/SSE adapters so the test checks
  // its real subscriptions and invalidation keys without mounting a browser.
  const source = await readFile(new URL("../../../src/presentation/state/useServerEvents.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const subscriptions = new Map();
  const invalidated = [];
  const cleanup = [];
  const adapters = {
    react: { useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect: (fn) => cleanup.push(fn()) },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: ({ queryKey }) => invalidated.push(queryKey) }) },
    "../../lib/serverEvents": {
      connectServerEvents() {}, disconnectServerEvents() {},
      subscribeToServerEvent: (event, handler) => { subscriptions.set(event, handler); return () => subscriptions.delete(event); },
    },
    "./useSseFallbackPolling": { useSseFallbackPolling() {} },
  };
  const exports = {};
  new Function("require", "exports", compiled.outputText)((name) => {
    assert.ok(Object.hasOwn(adapters, name), name);
    return adapters[name];
  }, exports);
  exports.useServerEvents({ actorUsername: "kiosk", enabled: true });
  for (const event of localSyncBrowserEventNames(Object.keys(LOCAL_SYNC_EVENT_GROUPS))) {
    invalidated.length = 0;
    assert.ok(subscriptions.has(event), event);
    subscriptions.get(event)({});
    const group = exports.AUTHENTICATED_EVENT_QUERY_GROUPS.find((entry) => entry.event === event);
    assert.ok(group, event);
    assert.deepEqual(invalidated, group.queryKeys.map((key) => key("kiosk")), event);
  }
  for (const dispose of cleanup) dispose?.();
});
