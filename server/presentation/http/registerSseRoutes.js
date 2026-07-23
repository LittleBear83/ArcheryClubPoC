export function registerSseRoutes({
  app,
  getActorUser,
  getPermissionsForRole,
  publicServerEventBus,
  serverEventBus,
}) {
  app.get("/api/public-events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const connection = publicServerEventBus.addClient({
      permissions: [],
      res,
      username: "public",
    });

    res.write(
      `event: connected\ndata: ${JSON.stringify({
        connectedAt: new Date().toISOString(),
      })}\n\n`,
    );

    req.on("close", () => {
      connection.disconnect();
      res.end();
    });
  });

  app.get("/api/server-events", (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const connection = serverEventBus.addClient({
      permissions: getPermissionsForRole(actor.user_type),
      res,
      username: actor.username,
    });

    res.write(
      `event: connected\ndata: ${JSON.stringify({
        connectedAt: new Date().toISOString(),
      })}\n\n`,
    );

    req.on("close", () => {
      connection.disconnect();
      res.end();
    });
  });
}
