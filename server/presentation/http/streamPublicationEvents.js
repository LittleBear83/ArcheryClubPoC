import { PUBLICATION_FEED_VERSION } from "../../../shared/syncPublicationProtocol.js";
export { PUBLICATION_FEED_VERSION };

export async function drainPublicationBacklog(gateway, isClosed = () => false) {
  for (let batch = 0; batch < 100; batch += 1) {
    if (isClosed()) return false;
    if ((await gateway.publishBatch({ limit: 500 })).length === 0) return true;
  }
  return false;
}

export async function streamPublicationEvents(req, res, gateway) {
  let client;
  let closed = false;
  let ready = false;
  let dirty = false;
  let running = false;
  let lastCheckpoint;
  let heartbeat;
  let cleanupPromise;
  let clientFailed = false;

  function cleanup() {
    closed = true;
    dirty = false;
    clearInterval(heartbeat);
    req.off("aborted", disconnect);
    res.off("close", disconnect);
    res.off("error", disconnect);
    if (!client || cleanupPromise) return cleanupPromise;
    client.off("notification", onNotification);
    cleanupPromise = (async () => {
      try { await client.query("UNLISTEN archery_sync_change"); }
      catch { clientFailed = true; }
      finally {
        client.off("error", onClientError);
        client.release(clientFailed);
      }
    })();
    return cleanupPromise;
  }

  function disconnect() {
    void cleanup();
    if (!res.writableEnded && !res.destroyed) res.end();
  }
  function onClientError() { clientFailed = true; disconnect(); }
  function write(text) {
    if (!closed && !res.write(text)) disconnect();
  }
  function sendEvent(name, checkpoint) {
    write(`event: ${name}\ndata: ${JSON.stringify({ feedVersion: PUBLICATION_FEED_VERSION, checkpoint })}\n\n`);
  }

  async function pump() {
    if (running || !ready || closed) return;
    running = true;
    try {
      while (dirty && !closed) {
        dirty = false;
        if (!await drainPublicationBacklog(gateway, () => closed)) { disconnect(); return; }
        if (closed) return;
        const checkpoint = await gateway.getPublicationHead();
        if (closed) return;
        if (checkpoint !== lastCheckpoint) {
          lastCheckpoint = checkpoint;
          sendEvent("sync.available", checkpoint);
        }
      }
    } catch { disconnect(); }
    finally { running = false; }
  }
  function onNotification(message) {
    if (closed || message.channel !== "archery_sync_change") return;
    // Raw payloads (including change_id/domain) never enter the v2 stream.
    // One dirty flag coalesces wake-ups during setup or an active publisher.
    dirty = true;
    void pump();
  }

  req.on("aborted", disconnect);
  res.on("close", disconnect);
  res.on("error", disconnect);
  try {
    client = await gateway.pool.connect();
    client.on("error", onClientError);
    if (closed || req.aborted || res.destroyed) { await cleanup(); return; }
    client.on("notification", onNotification);
    await client.query("LISTEN archery_sync_change");
    if (closed) return;
    if (!await drainPublicationBacklog(gateway, () => closed)) {
      const wasClosed = closed;
      await cleanup();
      if (!wasClosed) res.status(503).json({ success: false, code: "publication_backlog", message: "Publication is catching up; retry the request." });
      return;
    }
    if (closed) return;
    lastCheckpoint = await gateway.getPublicationHead();
    if (closed) return;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    sendEvent("sync.ready", lastCheckpoint);
    ready = true;
    if (!closed) {
      heartbeat = setInterval(() => {
        write(": ping\n\n");
        // Reconcile periodically too: NOTIFY is a transient optimisation.
        dirty = true;
        void pump();
      }, 25000);
      heartbeat.unref?.();
      void pump();
    }
  } catch (error) {
    const wasClosed = closed;
    await cleanup();
    if (wasClosed || res.headersSent) {
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    }
    throw error;
  }
}
