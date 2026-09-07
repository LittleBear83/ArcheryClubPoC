function normalizePullLimit(value, max = 500) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 200;
  }

  return Math.min(parsed, max);
}

function normalizeCheckpoint(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function streamSyncEvents(req, res, syncGateway) {
  let client;
  let closed = false;
  let ready = false;
  let heartbeat;
  let cleanupPromise;
  let clientFailed = false;
  const pending = [];

  function cleanup() {
    closed = true;
    clearInterval(heartbeat);
    pending.length = 0;
    req.off("aborted", disconnect);
    res.off("close", disconnect);
    res.off("error", disconnect);
    // A disconnected request may still be waiting for pool.connect().
    if (!client || cleanupPromise) return cleanupPromise;
    client.off("notification", onNotification);
    cleanupPromise = (async () => {
      try {
        await client.query("UNLISTEN archery_sync_change");
      } catch {
        clientFailed = true;
      } finally {
        // Keep the error handler attached until all pending database work ends.
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

  function onClientError() {
    clientFailed = true;
    disconnect();
  }

  function write(text) {
    if (closed) return;
    // Hints are recoverable by pulling; disconnect a slow reader instead of
    // accumulating an unbounded response buffer.
    if (!res.write(text)) disconnect();
  }

  function sendEvent(name, data) {
    write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function onNotification(message) {
    if (closed || message.channel !== "archery_sync_change") return;
    let data;
    try {
      data = JSON.parse(message.payload);
    } catch {
      return;
    }
    if (
      !data || typeof data !== "object" || Array.isArray(data)
      || !Number.isSafeInteger(data.change_id) || data.change_id < 0
      || typeof data.domain !== "string" || !data.domain.trim()
    ) return;
    const hint = { checkpoint: data.change_id, domain: data.domain };
    if (ready) {
      sendEvent("sync.available", hint);
    } else if (pending.length < 1024) {
      pending.push(hint);
    } else {
      disconnect();
    }
  }

  req.on("aborted", disconnect);
  res.on("close", disconnect);
  res.on("error", disconnect);

  try {
    client = await syncGateway.pool.connect();
    client.on("error", onClientError);
    if (closed || req.aborted || res.destroyed) {
      await cleanup();
      return;
    }
    client.on("notification", onNotification);
    // LISTEN runs in autocommit before the checkpoint read, so changes during
    // setup are either visible in the checkpoint or queued as notifications.
    await client.query("LISTEN archery_sync_change");
    if (closed) return;
    const checkpoint = await syncGateway.getLatestCheckpoint(client);
    if (closed) return;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    sendEvent("sync.ready", { checkpoint, serverVersion: "sync-v1" });
    ready = true;
    for (const hint of pending) sendEvent("sync.available", hint);
    pending.length = 0;
    if (!closed) {
      heartbeat = setInterval(() => write(": ping\n\n"), 25000);
      heartbeat.unref?.();
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

export function registerSyncRoutes({
  app,
  authenticateMachineRequest,
  logSyncEvent = () => {},
  syncGateway,
}) {
  app.get("/api/sync/v1/events", authenticateMachineRequest, (req, res) =>
    streamSyncEvents(req, res, syncGateway),
  );

  app.get("/api/sync/v1/status", authenticateMachineRequest, async (_req, res) => {
    const latestCheckpoint = await syncGateway.getLatestCheckpoint();

    res.json({
      success: true,
      latestCheckpoint,
      serverVersion: "sync-v1",
    });
  });

  app.post("/api/sync/v1/pull", authenticateMachineRequest, async (req, res) => {
    const checkpoint = normalizeCheckpoint(req.body?.checkpoint);
    const limit = normalizePullLimit(req.body?.limit);
    const isInitialSync = Boolean(req.body?.initialSync) || checkpoint == null;

    const client = await syncGateway.pool.connect();

    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");

      if (isInitialSync) {
        const snapshot = await syncGateway.getAuthSnapshot(client);
        await client.query("COMMIT");
        logSyncEvent("pull.snapshot", {
          checkpoint: snapshot.checkpoint,
          machineId: req.syncMachine.machineId,
        });
        res.json({
          success: true,
          checkpoint: snapshot.checkpoint,
          mode: "snapshot",
          serverVersion: "sync-v1",
          snapshot: snapshot.snapshot,
        });
        return;
      }

      const changes = await syncGateway.listChangesAfterCheckpoint({
        checkpoint,
        client,
        limit,
      });
      const latestCheckpoint = changes.length > 0
        ? changes.at(-1).changeId
        : await syncGateway.getLatestCheckpoint(client);

      await client.query("COMMIT");
      logSyncEvent("pull.incremental", {
        checkpoint,
        changeCount: changes.length,
        latestCheckpoint,
        machineId: req.syncMachine.machineId,
      });
      res.json({
        success: true,
        changes,
        checkpoint: latestCheckpoint,
        mode: "incremental",
        serverVersion: "sync-v1",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/sync/v1/push", authenticateMachineRequest, async (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];

    if (events.length === 0) {
      res.status(400).json({
        success: false,
        message: "At least one sync event is required.",
      });
      return;
    }

    if (events.length > 200) {
      res.status(413).json({
        success: false,
        message: "Too many sync events in a single request.",
      });
      return;
    }

    const acceptedEventIds = [];
    const rejectedEvents = [];
    const client = await syncGateway.pool.connect();

    try {
      await client.query("BEGIN");

      for (const event of events) {
        if (
          ![
            "login_event",
            "guest_login_event",
            "range_presence_extension_upsert",
            "event_booking_created",
            "event_booking_withdrawn",
            "coaching_booking_created",
            "coaching_booking_withdrawn",
          ].includes(event?.eventType) ||
          typeof event?.eventId !== "string"
        ) {
          res.status(400).json({
            success: false,
            message: "Malformed sync event payload.",
          });
          await client.query("ROLLBACK");
          return;
        }

        if (event.eventType === "login_event") {
          if (
            typeof event.payload?.username !== "string"
            ||
            typeof event.payload.loginMethod !== "string"
            || typeof event.payload.loggedInDate !== "string"
            || typeof event.payload.loggedInTime !== "string"
          ) {
            res.status(400).json({
              success: false,
              message: "Malformed sync event payload.",
            });
            await client.query("ROLLBACK");
            return;
          }
          await syncGateway.upsertLoginEventFromSync({ client, eventId: event.eventId, loggedInDate: event.payload.loggedInDate, loggedInTime: event.payload.loggedInTime, loginMethod: event.payload.loginMethod, machineId: req.syncMachine.machineId, username: event.payload.username });
          acceptedEventIds.push(event.eventId);
        } else if (event.eventType === "guest_login_event") {
          if (
            typeof event.payload?.firstName !== "string"
            || typeof event.payload?.surname !== "string"
            || typeof event.payload?.archeryGbMembershipNumber !== "string"
            || typeof event.payload?.paymentMethod !== "string"
            || typeof event.payload?.loggedInDate !== "string"
            || typeof event.payload?.loggedInTime !== "string"
          ) {
            res.status(400).json({
              success: false,
              message: "Malformed sync event payload.",
            });
            await client.query("ROLLBACK");
            return;
          }
          await syncGateway.upsertGuestLoginEventFromSync({
            archeryGbMembershipNumber: event.payload.archeryGbMembershipNumber,
            client,
            eventId: event.eventId,
            firstName: event.payload.firstName,
            invitedByName: event.payload.invitedByName ?? null,
            invitedByUsername: event.payload.invitedByUsername ?? null,
            loggedInDate: event.payload.loggedInDate,
            loggedInTime: event.payload.loggedInTime,
            machineId: req.syncMachine.machineId,
            paymentMethod: event.payload.paymentMethod,
            surname: event.payload.surname,
          });
          acceptedEventIds.push(event.eventId);
        } else if (event.eventType === "range_presence_extension_upsert") {
          const outcome = await syncGateway.processRangePresenceCommand({
            client,
            event,
            machineId: req.syncMachine.machineId,
          });
          if (outcome.accepted) acceptedEventIds.push(event.eventId);
          else rejectedEvents.push({ eventId: event.eventId, code: outcome.code, reason: outcome.reason });
        } else {
          const outcome = await syncGateway.processBookingCommand({ client, event, machineId: req.syncMachine.machineId });
          if (outcome.accepted) acceptedEventIds.push(event.eventId);
          else rejectedEvents.push({ eventId: event.eventId, code: outcome.code, reason: outcome.reason });
        }
      }

      await client.query("COMMIT");
      logSyncEvent("push.accepted", {
        eventCount: acceptedEventIds.length,
        machineId: req.syncMachine.machineId,
      });
      res.json({
        success: true,
        acceptedEventIds,
        rejectedEvents,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
