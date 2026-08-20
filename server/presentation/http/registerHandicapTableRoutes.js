export function registerHandicapTableRoutes({
  actorHasPermission,
  app,
  getActorUser,
  getUtcTimestampParts,
  handicapTableGateway,
  PERMISSIONS,
}) {
  app.get("/api/handicap-tables", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const handicapTables = await handicapTableGateway.listHandicapTables();
    res.json({
      success: true,
      handicapTables,
    });
  });

  app.post("/api/handicap-tables/sync-source", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_TOURNAMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to refresh handicap tables.",
      });
      return;
    }

    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const syncResult = await handicapTableGateway.syncSourceTables({
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    });

    res.json({
      success: true,
      syncResult,
    });
  });
}
