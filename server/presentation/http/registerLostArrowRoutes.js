import {
  LOST_ARROW_ARROW_COLOUR_VALUE_SET,
  LOST_ARROW_ARROW_MATERIAL_OPTION_SET,
  LOST_ARROW_FLETCHING_COLOUR_VALUE_SET,
  LOST_ARROW_NOCK_COLOUR_VALUE_SET,
  LOST_ARROW_TARGET_DISTANCE_OPTION_SET,
} from "../../../shared/lostArrowOptions.js";

function normalizeText(value, { maxLength = 256, required = false } = {}) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    return required ? null : "";
  }

  return normalizedValue.slice(0, maxLength);
}

function normalizeLaneNumber(value) {
  const laneNumber = Number.parseInt(value, 10);

  if (!Number.isInteger(laneNumber) || laneNumber < 1 || laneNumber > 11) {
    return null;
  }

  return laneNumber;
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
    required: true,
  });
  const fletchingColour1 = normalizeText(body?.fletchingColour1, {
    maxLength: 64,
    required: true,
  });
  const fletchingColour2 = normalizeText(body?.fletchingColour2, {
    maxLength: 64,
    required: true,
  });
  const nockColour = normalizeText(body?.nockColour, {
    maxLength: 64,
    required: true,
  });
  const targetDistance = normalizeText(body?.targetDistance, {
    maxLength: 32,
    required: true,
  });
  const laneNumber = normalizeLaneNumber(body?.laneNumber);
  const otherDetails = normalizeText(body?.otherDetails, { maxLength: 256 });

  if (
    !archerUsername ||
    !dateLost ||
    !isIsoDate(dateLost) ||
    !LOST_ARROW_ARROW_MATERIAL_OPTION_SET.has(arrowMaterial) ||
    !arrowColour ||
    !LOST_ARROW_ARROW_COLOUR_VALUE_SET.has(arrowColour) ||
    !arrowIdentifier ||
    !fletchingColour1 ||
    !LOST_ARROW_FLETCHING_COLOUR_VALUE_SET.has(fletchingColour1) ||
    !fletchingColour2 ||
    !LOST_ARROW_FLETCHING_COLOUR_VALUE_SET.has(fletchingColour2) ||
    !nockColour ||
    !LOST_ARROW_NOCK_COLOUR_VALUE_SET.has(nockColour) ||
    !LOST_ARROW_TARGET_DISTANCE_OPTION_SET.has(targetDistance) ||
    laneNumber === null
  ) {
    return null;
  }

  return {
    archerUsername,
    arrowColour,
    arrowIdentifier,
    arrowMaterial,
    dateLost,
    fletchingColour1,
    fletchingColour2,
    laneNumber,
    nockColour,
    otherDetails,
    targetDistance,
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
  getActorUser,
  getUtcTimestampParts,
  lostArrowGateway,
  memberAuthGateway,
  serverEventBus,
}) {
  function broadcastLostArrowUpdated(scope = "lost-arrows", usernames = []) {
    serverEventBus?.broadcastToAll("lost-found.updated", {
      changedAt: new Date().toISOString(),
      scope,
      usernames,
    });

    if (usernames.length > 0) {
      serverEventBus?.broadcastToUsers(usernames, "lost-found.updated", {
        changedAt: new Date().toISOString(),
        scope,
        usernames,
      });
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

    const payload = buildLostArrowPayload(req.body);

    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Complete every lost arrow field with a valid value.",
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

    broadcastLostArrowUpdated("lost-arrows.create", [payload.archerUsername]);

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

    const lostArrow = await lostArrowGateway.markLostArrowFound({
      dateFound: foundPayload.dateFound,
      foundByUsername: foundPayload.foundByUsername,
      id: lostArrowId,
    });

    broadcastLostArrowUpdated("lost-arrows.found", [existingLostArrow.archerUsername]);

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
