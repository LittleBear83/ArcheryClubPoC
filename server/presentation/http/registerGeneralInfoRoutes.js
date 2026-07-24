function normalizeGeneralInfoList(value, maxItems = 12) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);

  return normalized.length > 0 ? normalized : null;
}

function normalizeGeneralInfoPayload(body) {
  const introParagraphs = normalizeGeneralInfoList(body?.introParagraphs, 6);
  const quickFacts = normalizeGeneralInfoList(body?.quickFacts);
  const facilities = normalizeGeneralInfoList(body?.facilities);
  const beginners = normalizeGeneralInfoList(body?.beginners);
  const clubLife = normalizeGeneralInfoList(body?.clubLife);

  if (
    !introParagraphs ||
    !quickFacts ||
    !facilities ||
    !beginners ||
    !clubLife
  ) {
    return null;
  }

  return {
    introParagraphs,
    quickFacts,
    facilities,
    beginners,
    clubLife,
  };
}

function haveGeneralInfoChanged(previousContent, nextContent) {
  return JSON.stringify({
    introParagraphs: previousContent.introParagraphs,
    quickFacts: previousContent.quickFacts,
    facilities: previousContent.facilities,
    beginners: previousContent.beginners,
    clubLife: previousContent.clubLife,
  }) !== JSON.stringify({
    introParagraphs: nextContent.introParagraphs,
    quickFacts: nextContent.quickFacts,
    facilities: nextContent.facilities,
    beginners: nextContent.beginners,
    clubLife: nextContent.clubLife,
  });
}

export function registerGeneralInfoRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  generalInfoGateway,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  serverEventBus,
}) {
  app.get("/api/general-info", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const generalInfo = await generalInfoGateway.getGeneralInfo();

    res.json({
      success: true,
      generalInfo,
    });
  });

  app.put("/api/general-info", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_RANGE_RULES)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update the general information.",
      });
      return;
    }

    const payload = normalizeGeneralInfoPayload(req.body);

    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Provide valid general information content for each section.",
      });
      return;
    }

    const existingGeneralInfo = await generalInfoGateway.getGeneralInfo();
    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const generalInfo = await generalInfoGateway.updateGeneralInfo({
      ...payload,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    });

    if (auditChangeLogger && haveGeneralInfoChanged(existingGeneralInfo, generalInfo)) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: payload,
        before: {
          introParagraphs: existingGeneralInfo.introParagraphs,
          quickFacts: existingGeneralInfo.quickFacts,
          facilities: existingGeneralInfo.facilities,
          beginners: existingGeneralInfo.beginners,
          clubLife: existingGeneralInfo.clubLife,
        },
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: "default",
        entityLabel: "General information",
        entityType: "general_info",
        req,
        target: "/api/general-info",
      }).catch((auditError) => {
        console.error("Failed to record general info audit event", auditError);
      });
    }

    serverEventBus?.broadcastToAll("general-info.updated", {
      changedAt: new Date().toISOString(),
      updatedByUsername: actor.username,
    });

    res.json({
      success: true,
      generalInfo,
    });
  });
}
