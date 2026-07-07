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

function haveRangeRulesChanged(previousRules, nextRules) {
  return JSON.stringify({
    indoorRules: previousRules.indoorRules,
    outdoorRules: previousRules.outdoorRules,
    outdoorLaneRules: previousRules.outdoorLaneRules,
  }) !== JSON.stringify({
    indoorRules: nextRules.indoorRules,
    outdoorRules: nextRules.outdoorRules,
    outdoorLaneRules: nextRules.outdoorLaneRules,
  });
}

export function registerRangeRulesRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
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

    const existingRangeRules = await rangeRulesGateway.getRangeRules();
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const rangeRules = await rangeRulesGateway.updateRangeRules({
      ...payload,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    });

    if (auditChangeLogger && haveRangeRulesChanged(existingRangeRules, rangeRules)) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: {
          indoorRules: rangeRules.indoorRules,
          outdoorRules: rangeRules.outdoorRules,
          outdoorLaneRules: rangeRules.outdoorLaneRules,
        },
        before: {
          indoorRules: existingRangeRules.indoorRules,
          outdoorRules: existingRangeRules.outdoorRules,
          outdoorLaneRules: existingRangeRules.outdoorLaneRules,
        },
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: "default",
        entityLabel: "Range rules",
        entityType: "range_rules",
        req,
        target: "/api/range-rules",
      }).catch((auditError) => {
        console.error("Failed to record range rules audit event", auditError);
      });
    }

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
