import {
  getLostArrowFieldValidationErrors,
} from "../../../shared/lostArrowValidation.js";

function normalizeText(value, { maxLength = 256, required = false } = {}) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    return required ? null : "";
  }

  return normalizedValue.slice(0, maxLength);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function buildLostArrowPayload(body) {
  const archerUsername = normalizeText(body?.archerUsername, {
    maxLength: 64,
    required: true,
  });
  const dateLost = normalizeText(body?.dateLost, {
    maxLength: 10,
    required: true,
  });
  const arrowMaterial = normalizeText(body?.arrowMaterial, {
    maxLength: 32,
    required: true,
  }).toLowerCase();
  const arrowColour = normalizeText(body?.arrowColour, {
    maxLength: 64,
    required: true,
  });
  const arrowIdentifier = normalizeText(body?.arrowIdentifier, {
    maxLength: 64,
    required: false,
  });
  const fletchingColour1 = normalizeText(body?.fletchingColour1, {
    maxLength: 64,
    required: true,
  });
  const fletchingColour2 = normalizeText(body?.fletchingColour2, {
    maxLength: 64,
    required: true,
  });
  const fletchingColour3 = normalizeText(body?.fletchingColour3, {
    maxLength: 64,
    required: false,
  });
  const nockColour = normalizeText(body?.nockColour, {
    maxLength: 64,
    required: true,
  });
  const targetDistance = normalizeText(body?.targetDistance, {
    maxLength: 32,
    required: true,
  });
  const laneNumber = normalizeText(body?.laneNumber, {
    maxLength: 2,
    required: true,
  });
  const otherDetails = normalizeText(body?.otherDetails, { maxLength: 256 });
  const validationErrors = getLostArrowFieldValidationErrors({
    archerUsername,
    dateLost,
    arrowMaterial,
    arrowColour,
    arrowIdentifier,
    fletchingColour1,
    fletchingColour2,
    fletchingColour3,
    nockColour,
    targetDistance,
    laneNumber,
  });

  if (validationErrors.length > 0) {
    return {
      payload: null,
      validationErrors,
    };
  }

  return {
    payload: {
      archerUsername,
      arrowColour,
      arrowIdentifier,
      arrowMaterial,
      dateLost,
      fletchingColour1,
      fletchingColour2,
      fletchingColour3,
      laneNumber: Number.parseInt(laneNumber, 10),
      nockColour,
      otherDetails,
      targetDistance,
    },
    validationErrors: [],
  };
}

function buildLostArrowFoundPayload(body) {
  const dateFound = normalizeText(body?.dateFound, {
    maxLength: 10,
    required: true,
  });
  const foundByUsername = normalizeText(body?.foundByUsername, {
    maxLength: 64,
    required: true,
  });

  if (!dateFound || !isIsoDate(dateFound) || !foundByUsername) {
    return null;
  }

  return {
    dateFound,
    foundByUsername,
  };
}

export function registerLostArrowRoutes({
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  lostArrowGateway,
  memberAuthGateway,
  serverEventBus,
}) {
  function broadcastLostArrowUpdated(scope = "lost-arrows", usernames = [], details = {}) {
    const payload = {
      changedAt: new Date().toISOString(),
      scope,
      usernames,
      ...details,
    };

    serverEventBus?.broadcastToAll("lost-found.updated", payload);

    if (usernames.length > 0) {
      serverEventBus?.broadcastToUsers(usernames, "lost-found.updated", payload);
    }
  }

  app.get("/api/lost-arrows", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    res.json({
      success: true,
      lostArrows: await lostArrowGateway.listOpenLostArrows(),
    });
  });

  app.post("/api/lost-arrows", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const { payload, validationErrors } = buildLostArrowPayload(req.body);

    if (!payload) {
      res.status(400).json({
        success: false,
        message: `Complete these fields: ${validationErrors.join(", ")}.`,
      });
      return;
    }

    const archer = await memberAuthGateway.findUserByUsername(payload.archerUsername);

    if (!archer) {
      res.status(404).json({
        success: false,
        message: "The selected archer could not be found.",
      });
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const lostArrow = await lostArrowGateway.createLostArrow({
      ...payload,
      createdAtDate,
      createdAtTime,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: lostArrow,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: lostArrow.id,
        entityLabel: `${lostArrow.arrowColour} ${lostArrow.arrowMaterial}`,
        entityType: "lost_arrow",
        req,
        statusCode: 201,
        target: `/api/lost-arrows/${lostArrow.id}`,
      }).catch((auditError) => {
        console.error("Failed to record lost arrow audit event", auditError);
      });
    }

    broadcastLostArrowUpdated("lost-arrows.create", [payload.archerUsername], {
      action: "created",
      archerName: lostArrow.archerName || lostArrow.archerUsername,
      archerUsername: lostArrow.archerUsername,
      arrowId: lostArrow.id,
      arrowSummary: `${lostArrow.arrowColour} ${lostArrow.arrowMaterial} arrow`,
      message: `${lostArrow.archerName || lostArrow.archerUsername} reported a lost ${lostArrow.arrowColour} ${lostArrow.arrowMaterial} arrow.`,
      targetPath: "/lost-and-found",
    });

    res.status(201).json({
      success: true,
      lostArrow,
    });
  });

  app.post("/api/lost-arrows/:id/found", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const lostArrowId = Number.parseInt(req.params.id, 10);
    const foundPayload = buildLostArrowFoundPayload(req.body);

    if (!Number.isInteger(lostArrowId) || lostArrowId <= 0 || !foundPayload) {
      res.status(400).json({
        success: false,
        message: "Provide a valid lost arrow id, found date, and member.",
      });
      return;
    }

    const existingLostArrow = await lostArrowGateway.findLostArrowById(lostArrowId);

    if (!existingLostArrow) {
      res.status(404).json({
        success: false,
        message: "Lost arrow not found.",
      });
      return;
    }

    if (existingLostArrow.dateFound) {
      res.status(400).json({
        success: false,
        message: "That arrow has already been marked as found.",
      });
      return;
    }

    const foundByUser = await memberAuthGateway.findUserByUsername(
      foundPayload.foundByUsername,
    );

    if (!foundByUser) {
      res.status(404).json({
        success: false,
        message: "The member who found the arrow could not be found.",
      });
      return;
    }

    const [foundAtDate, foundAtTime] = getUtcTimestampParts();
    const lostArrow = await lostArrowGateway.markLostArrowFound({
      dateFound: foundPayload.dateFound,
      foundByUsername: foundPayload.foundByUsername,
      id: lostArrowId,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "found",
        actorUsername: actor.username,
        after: lostArrow,
        before: existingLostArrow,
        changedAtDate: foundAtDate,
        changedAtTime: foundAtTime,
        entityId: lostArrowId,
        entityLabel: `${existingLostArrow.arrowColour} ${existingLostArrow.arrowMaterial}`,
        entityType: "lost_arrow",
        req,
        target: `/api/lost-arrows/${lostArrowId}/found`,
      }).catch((auditError) => {
        console.error("Failed to record lost arrow audit event", auditError);
      });
    }

    broadcastLostArrowUpdated("lost-arrows.found", [existingLostArrow.archerUsername], {
      action: "found",
      archerName: lostArrow.archerName || lostArrow.archerUsername,
      archerUsername: lostArrow.archerUsername,
      arrowId: lostArrow.id,
      arrowSummary: `${lostArrow.arrowColour} ${lostArrow.arrowMaterial} arrow`,
      targetPath: "/lost-and-found",
    });

    res.json({
      success: true,
      lostArrow,
    });
  });

  app.get("/api/my-lost-arrow-notices", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const notices = await lostArrowGateway.listFoundLostArrowsForUser(actor.username);

    if (notices.length > 0) {
      const [seenAtDate, seenAtTime] = getUtcTimestampParts();

      await lostArrowGateway.markFoundLostArrowsSeenForUser({
        seenAtDate,
        seenAtTime,
        username: actor.username,
      });
    }

    res.json({
      success: true,
      notices,
    });
  });
}
