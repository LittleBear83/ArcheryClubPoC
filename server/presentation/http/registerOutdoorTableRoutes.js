const BOW_TYPE_OPTIONS = new Set(["Rec", "Comp", "B/bow", "L/bow", "Flat"]);
const STANDARD_BOOLEAN_FIELD_KEYS = [
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
const AWARD_252_FIELD_MAPPINGS = [
  { awardKey: "award25220", signOffKey: "award25220SignOffDates" },
  { awardKey: "award25230", signOffKey: "award25230SignOffDates" },
  { awardKey: "award25240", signOffKey: "award25240SignOffDates" },
  { awardKey: "award25250", signOffKey: "award25250SignOffDates" },
  { awardKey: "award25260", signOffKey: "award25260SignOffDates" },
  { awardKey: "award25280", signOffKey: "award25280SignOffDates" },
  { awardKey: "award252100", signOffKey: "award252100SignOffDates" },
];
const ACHIEVEMENT_DATE_FIELD_MAPPINGS = [
  { awardKey: "archer3rd", dateKey: "archer3rdDate" },
  { awardKey: "archer2nd", dateKey: "archer2ndDate" },
  { awardKey: "archer1st", dateKey: "archer1stDate" },
  { awardKey: "bowman3rd", dateKey: "bowman3rdDate" },
  { awardKey: "bowman2nd", dateKey: "bowman2ndDate" },
  { awardKey: "bowman1st", dateKey: "bowman1stDate" },
  { awardKey: "masterBowman", dateKey: "masterBowmanDate" },
  { awardKey: "grandMasterBowman", dateKey: "grandMasterBowmanDate" },
  { awardKey: "eliteMasterBowman", dateKey: "eliteMasterBowmanDate" },
];
const BOW_TYPE_TO_DISCIPLINE = {
  Rec: "Recurve Bow",
  Comp: "Compound Bow",
  "B/bow": "Bare Bow",
  "L/bow": "Long Bow",
  Flat: "Flat Bow",
};
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

function normalizeSignOffDates(value) {
  if (value == null) {
    return ["", "", ""];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedDates = value.slice(0, 3).map((entry) => {
    if (entry == null || entry === "") {
      return "";
    }

    if (typeof entry !== "string") {
      return null;
    }

    const trimmedEntry = entry.trim();

    if (!trimmedEntry) {
      return "";
    }

    return /^\d{4}-\d{2}-\d{2}$/.test(trimmedEntry) ? trimmedEntry : null;
  });

  if (normalizedDates.some((entry) => entry === null)) {
    return null;
  }

  while (normalizedDates.length < 3) {
    normalizedDates.push("");
  }

  return normalizedDates;
}

function normalizeOptionalDate(value) {
  if (value == null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : null;
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

  for (const fieldKey of STANDARD_BOOLEAN_FIELD_KEYS) {
    const normalizedValue = normalizeBoolean(body?.[fieldKey]);

    if (normalizedValue === null) {
      return null;
    }

    payload[fieldKey] = normalizedValue;
  }

  for (const { awardKey, dateKey } of ACHIEVEMENT_DATE_FIELD_MAPPINGS) {
    const legacyAwardValue = normalizeBoolean(body?.[awardKey]);
    const dateValue = normalizeOptionalDate(body?.[dateKey]);

    if (legacyAwardValue === null || dateValue === null) {
      return null;
    }

    payload[awardKey] = legacyAwardValue || Boolean(dateValue);
    payload[dateKey] = dateValue;
  }

  for (const { awardKey, signOffKey } of AWARD_252_FIELD_MAPPINGS) {
    const legacyAwardValue = normalizeBoolean(body?.[awardKey]);
    const signOffDates = normalizeSignOffDates(body?.[signOffKey]);

    if (legacyAwardValue === null || signOffDates === null) {
      return null;
    }

    const completedRounds = signOffDates.filter(Boolean).length;

    payload[awardKey] = legacyAwardValue || completedRounds >= 3;
    payload[signOffKey] = signOffDates;
  }

  return payload;
}

export function registerOutdoorTableRoutes({
  app,
  actorHasPermission,
  getActorUser,
  getUtcTimestampParts,
  memberAuthGateway,
  memberDistanceSignOffRepository,
  outdoorTableGateway,
  PERMISSIONS,
  serverEventBus,
}) {
  async function applySightMarksFromProfile(entry) {
    if (!entry) {
      return entry;
    }

    const discipline = BOW_TYPE_TO_DISCIPLINE[entry.bowType];

    if (!discipline) {
      return entry;
    }

    const [disciplineGroup] = await memberDistanceSignOffRepository.listByDiscipline(
      entry.archerUsername,
      [discipline],
    );
    const hasSignedOffDistance = (distanceYards) =>
      Boolean(
        disciplineGroup?.distances?.find(
          (distance) => distance.distanceYards === distanceYards,
        )?.signOff,
      );

    return {
      ...entry,
      cloutWhite20: hasSignedOffDistance(20),
      cloutWhite30: hasSignedOffDistance(30),
      cloutWhite40: hasSignedOffDistance(40),
      cloutWhite50: hasSignedOffDistance(50),
      cloutWhite60: hasSignedOffDistance(60),
      cloutWhite7080: hasSignedOffDistance(80),
      cloutWhite90100: hasSignedOffDistance(100),
    };
  }

  async function applySightMarksFromProfiles(entries) {
    return Promise.all(entries.map((entry) => applySightMarksFromProfile(entry)));
  }

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
    const [rowsRaw, availableYearsRaw] = await Promise.all([
      outdoorTableGateway.listEntriesByYear(seasonYear),
      outdoorTableGateway.listAvailableYears(),
    ]);
    const rows = await applySightMarksFromProfiles(rowsRaw);
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
    const archerDisciplines = await memberAuthGateway.findDisciplinesByUsername(
      payload.archerUsername,
    );
    const requiredDiscipline = BOW_TYPE_TO_DISCIPLINE[payload.bowType];

    if (!archer) {
      res.status(404).json({
        success: false,
        message: "The selected archer could not be found.",
      });
      return;
    }

    if (
      requiredDiscipline &&
      !archerDisciplines.some((entry) => entry.discipline === requiredDiscipline)
    ) {
      res.status(400).json({
        success: false,
        message: `This member does not have ${requiredDiscipline} on their profile, so ${payload.bowType} cannot be submitted.`,
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
    const entry = await applySightMarksFromProfile(await outdoorTableGateway.createEntry({
      ...payload,
      createdAtDate,
      createdAtTime,
      updatedAtDate: createdAtDate,
      updatedAtTime: createdAtTime,
      updatedByUsername: actor.username,
    }));

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
    const archerDisciplines = await memberAuthGateway.findDisciplinesByUsername(
      payload.archerUsername,
    );
    const requiredDiscipline = BOW_TYPE_TO_DISCIPLINE[payload.bowType];

    if (!archer) {
      res.status(404).json({
        success: false,
        message: "The selected archer could not be found.",
      });
      return;
    }

    if (
      requiredDiscipline &&
      !archerDisciplines.some((entry) => entry.discipline === requiredDiscipline)
    ) {
      res.status(400).json({
        success: false,
        message: `This member does not have ${requiredDiscipline} on their profile, so ${payload.bowType} cannot be submitted.`,
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
    const entry = await applySightMarksFromProfile(await outdoorTableGateway.updateEntry({
      ...payload,
      id: entryId,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    }));

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
