function normalizeAuditEventQuery(query) {
  const statusCode = Number.parseInt(String(query?.statusCode ?? ""), 10);

  return {
    actorUsername:
      typeof query?.actorUsername === "string" ? query.actorUsername.trim() : "",
    action: typeof query?.action === "string" ? query.action.trim() : "",
    target: typeof query?.target === "string" ? query.target.trim() : "",
    dateFrom: typeof query?.dateFrom === "string" ? query.dateFrom.trim() : "",
    dateTo: typeof query?.dateTo === "string" ? query.dateTo.trim() : "",
    statusCode: Number.isInteger(statusCode) ? statusCode : null,
    sortBy: typeof query?.sortBy === "string" ? query.sortBy.trim() : "",
    sortDirection:
      typeof query?.sortDirection === "string" ? query.sortDirection.trim() : "",
    limit: query?.limit,
  };
}

export function registerAuditRoutes({
  actorHasPermission,
  app,
  auditLogGateway,
  getActorUser,
  PERMISSIONS,
}) {
  app.get("/api/audit-events", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.VIEW_REPORTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view audit logs.",
      });
      return;
    }

    const auditEvents = await auditLogGateway.listAuditEvents(
      normalizeAuditEventQuery(req.query),
    );

    res.json({
      success: true,
      auditEvents,
    });
  });
}
