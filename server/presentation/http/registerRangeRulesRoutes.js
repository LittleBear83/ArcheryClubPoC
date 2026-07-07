function normalizeRuleList(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);

  return normalized.length > 0 ? normalized : null;
}

function normalizeLaneRules(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => ({
      distance: typeof entry?.distance === "string" ? entry.distance.trim() : "",
      lanes: typeof entry?.lanes === "string" ? entry.lanes.trim() : "",
    }))
    .filter((entry) => entry.lanes && entry.distance)
    .slice(0, 20);

  return normalized.length > 0 ? normalized : null;
}

function normalizeRangeRulesPayload(body) {
  const indoorRules = normalizeRuleList(body?.indoorRules);
  const outdoorRules = normalizeRuleList(body?.outdoorRules);
  const outdoorLaneRules = normalizeLaneRules(body?.outdoorLaneRules);

  if (!indoorRules || !outdoorRules || !outdoorLaneRules) {
    return null;
  }

  return {
    indoorRules,
    outdoorLaneRules,
    outdoorRules,
  };
}

export function registerRangeRulesRoutes({
  actorHasPermission,
  app,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  rangeRulesGateway,
  serverEventBus,
}) {
  app.get("/api/range-rules", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const rangeRules = await rangeRulesGateway.getRangeRules();

    res.json({
      success: true,
      rangeRules,
    });
  });

  app.put("/api/range-rules", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_RANGE_RULES)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update the range rules.",
      });
      return;
    }

    const payload = normalizeRangeRulesPayload(req.body);

    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Provide valid indoor rules, outdoor rules, and lane guidance.",
      });
      return;
    }

    const timestampParts = getUtcTimestampParts();
    const rangeRules = await rangeRulesGateway.updateRangeRules({
      ...payload,
      updatedAtDate: timestampParts.date,
      updatedAtTime: timestampParts.time,
      updatedByUsername: actor.username,
    });

    serverEventBus?.broadcastToAll("range-rules.updated", {
      changedAt: new Date().toISOString(),
      updatedByUsername: actor.username,
    });

    res.json({
      success: true,
      rangeRules,
    });
  });
}
