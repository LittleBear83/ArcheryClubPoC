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

export function registerSyncRoutes({
  app,
  authenticateMachineRequest,
  logSyncEvent = () => {},
  syncGateway,
}) {
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
          !["login_event", "event_booking_created", "event_booking_withdrawn", "coaching_booking_created", "coaching_booking_withdrawn"].includes(event?.eventType) ||
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
