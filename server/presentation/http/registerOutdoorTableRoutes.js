const BOW_TYPE_OPTIONS = new Set(["Rec", "Comp", "B/bow", "L/bow", "Flat"]);
const BOOLEAN_FIELD_KEYS = [
  "archer3rd",
  "archer2nd",
  "archer1st",
  "bowman3rd",
  "bowman2nd",
  "bowman1st",
  "masterBowman",
  "grandMasterBowman",
  "eliteMasterBowman",
  "award25220",
  "award25230",
  "award25240",
  "award25250",
  "award25260",
  "award25280",
  "award252100",
  "cloutWhite20",
  "cloutWhite30",
  "cloutWhite40",
  "cloutWhite50",
  "cloutWhite60",
  "cloutWhite7080",
  "cloutWhite90100",
];
const INVALID_HANDICAP = Symbol("invalid-handicap");

function normalizeText(value, { maxLength = 64, required = false } = {}) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    return required ? null : "";
  }

  return normalizedValue.slice(0, maxLength);
}

function normalizeSeasonYear(value) {
  const seasonYear = Number.parseInt(value, 10);

  if (!Number.isInteger(seasonYear) || seasonYear < 2020 || seasonYear > 2100) {
    return null;
  }

  return seasonYear;
}

function normalizeHandicap(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const handicap = Number.parseInt(value, 10);

  if (!Number.isInteger(handicap) || handicap < 0 || handicap > 150) {
    return INVALID_HANDICAP;
  }

  return handicap;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false" || value === "" || value == null) {
    return false;
  }

  return null;
}

function buildOutdoorTablePayload(body) {
  const seasonYear = normalizeSeasonYear(body?.seasonYear);
  const archerUsername = normalizeText(body?.archerUsername, {
    maxLength: 64,
    required: true,
  });
  const bowType = normalizeText(body?.bowType, {
    maxLength: 16,
    required: true,
  });
  const handicap = normalizeHandicap(body?.handicap);

  if (
    !seasonYear ||
    !archerUsername ||
    !bowType ||
    !BOW_TYPE_OPTIONS.has(bowType) ||
    handicap === INVALID_HANDICAP
  ) {
    return null;
  }

  const payload = {
    seasonYear,
    archerUsername,
    bowType,
    handicap,
  };

  for (const fieldKey of BOOLEAN_FIELD_KEYS) {
    const normalizedValue = normalizeBoolean(body?.[fieldKey]);

    if (normalizedValue === null) {
      return null;
    }

    payload[fieldKey] = normalizedValue;
  }

  return payload;
}

export function registerOutdoorTableRoutes({
  app,
  actorHasPermission,
  getActorUser,
  getUtcTimestampParts,
  memberAuthGateway,
  outdoorTableGateway,
  PERMISSIONS,
  serverEventBus,
}) {
  function broadcastOutdoorTableUpdated(scope = "outdoor-table") {
    serverEventBus?.broadcastToAll("outdoor-table.updated", {
      changedAt: new Date().toISOString(),
      scope,
    });
  }

  function ensureCanManage(actor, res) {
    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage the outdoor table.",
      });
      return false;
    }

    return true;
  }

  app.get("/api/outdoor-table", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const requestedYear = normalizeSeasonYear(req.query?.year);
    const currentYear = new Date().getUTCFullYear();
    const seasonYear = requestedYear ?? currentYear;
    const [rows, availableYearsRaw] = await Promise.all([
      outdoorTableGateway.listEntriesByYear(seasonYear),
      outdoorTableGateway.listAvailableYears(),
    ]);
    const availableYears = Array.from(
      new Set([seasonYear, currentYear, ...availableYearsRaw]),
    ).sort((left, right) => right - left);

    res.json({
      success: true,
      seasonYear,
      availableYears,
      rows,
    });
  });

  app.post("/api/outdoor-table", async (req, res) => {
    const actor = getActorUser(req);

    if (!ensureCanManage(actor, res)) {
      return;
    }

    const payload = buildOutdoorTablePayload(req.body);

    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Complete the outdoor table entry with valid values.",
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

    const duplicate = await outdoorTableGateway.findDuplicate(payload);

    if (duplicate) {
      res.status(409).json({
        success: false,
        message: "That member already has an outdoor table row for this bow and year.",
      });
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const entry = await outdoorTableGateway.createEntry({
      ...payload,
      createdAtDate,
      createdAtTime,
      updatedAtDate: createdAtDate,
      updatedAtTime: createdAtTime,
      updatedByUsername: actor.username,
    });

    broadcastOutdoorTableUpdated("outdoor-table.create");

    res.status(201).json({
      success: true,
      entry,
    });
  });

  app.put("/api/outdoor-table/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!ensureCanManage(actor, res)) {
      return;
    }

    const entryId = Number.parseInt(req.params.id, 10);
    const payload = buildOutdoorTablePayload(req.body);

    if (!Number.isInteger(entryId) || entryId <= 0 || !payload) {
      res.status(400).json({
        success: false,
        message: "Provide a valid outdoor table row and id.",
      });
      return;
    }

    const existingEntry = await outdoorTableGateway.findEntryById(entryId);

    if (!existingEntry) {
      res.status(404).json({
        success: false,
        message: "Outdoor table row not found.",
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

    const duplicate = await outdoorTableGateway.findDuplicate({
      ...payload,
      excludeId: entryId,
    });

    if (duplicate) {
      res.status(409).json({
        success: false,
        message: "That member already has an outdoor table row for this bow and year.",
      });
      return;
    }

    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const entry = await outdoorTableGateway.updateEntry({
      ...payload,
      id: entryId,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    });

    broadcastOutdoorTableUpdated("outdoor-table.update");

    res.json({
      success: true,
      entry,
    });
  });

  app.delete("/api/outdoor-table/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!ensureCanManage(actor, res)) {
      return;
    }

    const entryId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(entryId) || entryId <= 0) {
      res.status(400).json({
        success: false,
        message: "Provide a valid outdoor table row id.",
      });
      return;
    }

    const existingEntry = await outdoorTableGateway.findEntryById(entryId);

    if (!existingEntry) {
      res.status(404).json({
        success: false,
        message: "Outdoor table row not found.",
      });
      return;
    }

    await outdoorTableGateway.deleteEntry(entryId);
    broadcastOutdoorTableUpdated("outdoor-table.delete");

    res.json({
      success: true,
    });
  });
}
