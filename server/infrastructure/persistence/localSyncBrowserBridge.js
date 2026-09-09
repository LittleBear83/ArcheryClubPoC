import { LOCAL_SYNC_EVENT_GROUPS, publishLocalSyncBrowserEvents } from "../../domain/services/localSyncBrowserEvents.js";

const CHANNEL = "archery_local_sync_applied";

export async function notifyLocalSyncApplied(client, domains) {
  const allowedDomains = [...new Set(domains.filter((domain) => Object.hasOwn(LOCAL_SYNC_EVENT_GROUPS, domain)))];
  if (allowedDomains.length === 0) return;
  await client.query({
    text: "SELECT pg_notify($1, $2)",
    values: [CHANNEL, JSON.stringify({ domains: allowedDomains })],
    query_timeout: 5000,
  });
}

// The sync CLI and HTTP server are different processes. This local database
// channel bridges them into the existing browser bus; it is not machine SSE.
export function startLocalSyncBrowserBridge({ pool, serverEventBus, isLocalPiNode, refreshRoleAccess = async () => {}, retryMs = 5000 }) {
  if (!isLocalPiNode || !pool) return () => {};
  let stopped = false;
  let client;
  let retryTimer;
  let pending = Promise.resolve();
  let hasListened = false;

  function onNotification(message) {
    if (stopped || message.channel !== CHANNEL) return;
    let payload;
    try { payload = JSON.parse(message.payload); } catch { return; }
    if (!Array.isArray(payload?.domains)) return;
    const domains = [...new Set(payload.domains.filter((domain) => typeof domain === "string" && Object.hasOwn(LOCAL_SYNC_EVENT_GROUPS, domain)))];
    if (!domains.length) return;
    enqueueInvalidations(domains);
  }

  function enqueueInvalidations(domains, refreshRoles = false) {
    pending = pending.then(async () => {
      if (stopped) return;
      if (refreshRoles || domains.some((domain) => ["roles", "permissions", "role_permissions"].includes(domain))) {
        try { await refreshRoleAccess(); } catch { /* Do not suppress other invalidations. */ }
      }
      if (stopped) return;
      publishLocalSyncBrowserEvents(serverEventBus, domains);
    }).catch(() => {});
  }

  function releaseClient() {
    if (!client) return;
    const previous = client;
    client = undefined;
    previous.off("notification", onNotification);
    previous.off("error", reconnect);
    previous.off("end", reconnect);
    previous.release(true);
  }

  function reconnect() {
    releaseClient();
    if (!stopped && !retryTimer) {
      retryTimer = setTimeout(() => { retryTimer = undefined; void connect(); }, retryMs);
      retryTimer.unref?.();
    }
  }

  async function connect() {
    try {
      const acquired = await pool.connect();
      if (stopped) { acquired.release(true); return; }
      client = acquired;
      client.on("notification", onNotification);
      client.on("error", reconnect);
      client.on("end", reconnect);
      await client.query({ text: `LISTEN ${CHANNEL}`, query_timeout: 5000 });
      if (stopped || client !== acquired) return;
      // NOTIFY hints sent during a disconnected interval are lost. Once LISTEN
      // is restored, refresh all mapped groups to catch up without record data.
      if (hasListened) enqueueInvalidations(Object.keys(LOCAL_SYNC_EVENT_GROUPS), true);
      hasListened = true;
    } catch { reconnect(); }
  }

  void connect();
  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    releaseClient();
  };
}
