function canManageMembers(
  req,
  { actorHasPermission, getActorUser, PERMISSIONS },
) {
  const actor = getActorUser(req);
  return Boolean(
    actor && actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS),
  );
}

function rejectForbidden(res) {
  res.status(403).json({
    success: false,
    message: "You do not have permission to download the RFID agent.",
  });
}

function reportUnavailable(res) {
  res.status(503).json({
    success: false,
    message: "RFID agent release information is unavailable.",
  });
}

export function registerRfidAgentDistributionRoutes({
  actorHasPermission,
  app,
  distribution,
  getActorUser,
  logger = console,
  PERMISSIONS,
}) {
  const authorization = { actorHasPermission, getActorUser, PERMISSIONS };

  app.get("/api/admin/rfid-agent/version", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");

    if (!canManageMembers(req, authorization)) {
      rejectForbidden(res);
      return;
    }

    try {
      const release = await distribution.getLatestVersion();
      res.json(release);
    } catch (error) {
      logger.error("RFID agent version lookup failed", { error });
      reportUnavailable(res);
    }
  });

  app.get("/api/admin/rfid-agent/download/latest", async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");

    if (!canManageMembers(req, authorization)) {
      rejectForbidden(res);
      return;
    }

    try {
      const installer = await distribution.openLatestInstaller();
      res.status(200);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${installer.filename}"`,
      );

      if (
        Number.isSafeInteger(installer.contentLength) &&
        installer.contentLength > 0
      ) {
        res.setHeader("Content-Length", String(installer.contentLength));
      }

      installer.stream.once("error", (error) => {
        logger.error("RFID agent installer stream failed", { error });

        if (!res.headersSent) {
          reportUnavailable(res);
          return;
        }

        res.destroy(error);
      });
      installer.stream.pipe(res);
    } catch (error) {
      logger.error("RFID agent download failed", { error });
      reportUnavailable(res);
    }
  });
}
