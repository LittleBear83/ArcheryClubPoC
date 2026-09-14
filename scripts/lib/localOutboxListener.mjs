import { setTimeout as delay } from "node:timers/promises";

export const LOCAL_OUTBOX_CHANNEL = "archery_local_sync_outbox";
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

// Reserve a connection for LISTEN. Query durable work after LISTEN on every
// connection, closing the startup/reconnect gap without periodic polling.
export async function listenLocalOutbox({ pool, countPendingOutbox, signal, onWake,
  wait = (ms, abortSignal) => delay(ms, undefined, { signal: abortSignal }), log = () => {},
}) {
  let retry = 0;
  while (!signal.aborted) {
    let client;
    let finish;
    const disconnected = new Promise((resolve) => { finish = resolve; });
    const notify = (message) => {
      if (!signal.aborted && message.channel === LOCAL_OUTBOX_CHANNEL) onWake();
    };
    signal.addEventListener("abort", finish, { once: true });
    try {
      client = await pool.connect();
      if (signal.aborted) break;
      client.on("notification", notify);
      client.on("error", finish);
      client.on("end", finish);
      await client.query({ text: `LISTEN ${LOCAL_OUTBOX_CHANNEL}`, query_timeout: 5000 });
      if (!signal.aborted && await countPendingOutbox(client) > 0) onWake();
      retry = 0;
      await disconnected;
    } catch {
      if (!signal.aborted) log("Local outbox listener unavailable; reconnecting with backoff.");
    } finally {
      signal.removeEventListener("abort", finish);
      if (client) {
        client.off("notification", notify);
        client.off("error", finish);
        client.off("end", finish);
        client.release(true);
      }
    }
    if (!signal.aborted) {
      try { await wait(BACKOFF_MS[Math.min(retry++, BACKOFF_MS.length - 1)], signal); }
      catch { if (!signal.aborted) throw new Error("Local outbox retry wait failed."); }
    }
  }
}
