export const INDOOR_CLASSIFICATIONS = [
  "archer3rd", "archer2nd", "archer1st", "bowman3rd", "bowman2nd", "bowman1st",
  "indoorMasterBowman", "indoorGrandMasterBowman",
];
export const INDOOR_SCORES = [300, 325, 350, 375, 400, 425, 450, 475, 500, 525, 550, 575, 580, 585, 590, 595, 600];
const BOW_DISCIPLINES = { Rec: "Recurve Bow", Comp: "Compound Bow", "B/bow": "Bare Bow", "L/bow": "Long Bow" };

function normalizeDates(value, keys) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [key, date] of Object.entries(value)) {
    if (!keys.includes(key) || typeof date !== "string" || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    if (date) result[key] = date;
  }
  return result;
}

function normalize(body) {
  const seasonYear = Number(body?.seasonYear);
  const handicap = body?.handicap == null || body?.handicap === "" ? null : Number(body.handicap);
  const archerUsername = String(body?.archerUsername ?? "").trim();
  const bowType = String(body?.bowType ?? "").trim();
  const classifications = normalizeDates(body?.classifications, INDOOR_CLASSIFICATIONS);
  const scores = normalizeDates(body?.scores, INDOOR_SCORES.map(String));
  if (!Number.isInteger(seasonYear) || seasonYear < 2020 || seasonYear > 2100 ||
    !archerUsername || archerUsername.length > 64 || !BOW_DISCIPLINES[bowType] ||
    (handicap !== null && (!Number.isInteger(handicap) || handicap < 0 || handicap > 150)) ||
    !classifications || !scores) return null;
  return { seasonYear, archerUsername, bowType, handicap, classifications, scores };
}

export function registerIndoorTableRoutes({ app, actorHasPermission, auditChangeLogger, getActorUser,
  getUtcTimestampParts, goldenRecordsMemberSyncService, indoorTableGateway, memberAuthGateway,
  PERMISSIONS, serverEventBus, syncNodeMode }) {
  let backfilledYear = null;
  let backfillPromise = null;
  function canManage(req, res) {
    const actor = getActorUser(req);
    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_MEMBERS)) {
      res.status(403).json({ success: false, message: "You do not have permission to manage indoor achievements." });
      return null;
    }
    return actor;
  }
  async function validMember(payload, res) {
    if (!await memberAuthGateway.findUserByUsername(payload.archerUsername)) {
      res.status(404).json({ success: false, message: "Member not found." }); return false;
    }
    const disciplines = await memberAuthGateway.findDisciplinesByUsername(payload.archerUsername);
    if (!disciplines.some((row) => row.discipline === BOW_DISCIPLINES[payload.bowType])) {
      res.status(400).json({ success: false, message: "The member does not have this bow discipline." }); return false;
    }
    return true;
  }
  function notify(scope) {
    serverEventBus?.broadcastToAll("indoor-table.updated", { changedAt: new Date().toISOString(), scope });
  }
  function audit({ action, actor, after, before, req, statusCode }) {
    if (!auditChangeLogger) return;
    const [changedAtDate, changedAtTime] = getUtcTimestampParts();
    void auditChangeLogger.recordEntityChange({ action, actorUsername: actor.username, after, before,
      changedAtDate, changedAtTime, entityId: after?.id ?? before?.id,
      entityLabel: `${(after ?? before).archerUsername} ${(after ?? before).bowType} ${(after ?? before).seasonYear}`,
      entityType: "indoor_table_entry", req, statusCode, target: `/api/indoor-table/${after?.id ?? before?.id}`
    }).catch((error) => console.error("Failed to record indoor table audit event", error));
  }
  app.get("/api/indoor-table", async (req, res) => {
    if (!getActorUser(req)) { res.status(401).json({ success: false, message: "An authenticated member is required." }); return; }
    const year = Number(req.query?.year);
    const seasonYear = Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : new Date().getUTCFullYear();
    if (seasonYear === new Date().getUTCFullYear() && syncNodeMode !== "local-pi" &&
      goldenRecordsMemberSyncService?.backfillIndoorTableFromStoredSnapshots && backfilledYear !== seasonYear) {
      if (!backfillPromise) {
        backfillPromise = goldenRecordsMemberSyncService.backfillIndoorTableFromStoredSnapshots()
          .then((createdCount) => {
            backfilledYear = seasonYear;
            if (createdCount > 0) notify("stored-snapshot-backfill");
          }).finally(() => { backfillPromise = null; });
      }
      await backfillPromise;
    }
    const [rows, availableYears] = await Promise.all([indoorTableGateway.listEntriesByYear(seasonYear), indoorTableGateway.listAvailableYears()]);
    res.json({ success: true, seasonYear, availableYears, rows });
  });
  app.post("/api/indoor-table", async (req, res) => {
    const actor = canManage(req, res); if (!actor) return;
    const payload = normalize(req.body);
    if (!payload) { res.status(400).json({ success: false, message: "Invalid indoor achievement row." }); return; }
    if (actor.username.toLowerCase() === payload.archerUsername.toLowerCase()) { res.status(403).json({ success: false, message: "Members cannot sign off their own achievements." }); return; }
    if (!await validMember(payload, res)) return;
    if (await indoorTableGateway.findDuplicate(payload)) { res.status(409).json({ success: false, message: "This member already has an indoor row for this bow and year." }); return; }
    const [date, time] = getUtcTimestampParts();
    const entry = await indoorTableGateway.createEntry({ ...payload, createdAtDate: date, createdAtTime: time,
      updatedAtDate: date, updatedAtTime: time, updatedByUsername: actor.username });
    audit({ action: "created", actor, after: entry, before: null, req, statusCode: 201 }); notify("create");
    res.status(201).json({ success: true, entry });
  });
  app.put("/api/indoor-table/:id", async (req, res) => {
    const actor = canManage(req, res); if (!actor) return;
    const id = Number(req.params.id); const payload = normalize(req.body);
    if (!Number.isInteger(id) || id <= 0 || !payload) { res.status(400).json({ success: false, message: "Invalid indoor achievement row." }); return; }
    if (actor.username.toLowerCase() === payload.archerUsername.toLowerCase()) { res.status(403).json({ success: false, message: "Members cannot sign off their own achievements." }); return; }
    const before = await indoorTableGateway.findEntryById(id);
    if (!before) { res.status(404).json({ success: false, message: "Indoor row not found." }); return; }
    if (!await validMember(payload, res)) return;
    if (await indoorTableGateway.findDuplicate({ ...payload, excludeId: id })) { res.status(409).json({ success: false, message: "This member already has an indoor row for this bow and year." }); return; }
    const [date, time] = getUtcTimestampParts();
    const entry = await indoorTableGateway.updateEntry({ ...payload, id, createdAtDate: before.createdAtDate,
      createdAtTime: before.createdAtTime, updatedAtDate: date, updatedAtTime: time, updatedByUsername: actor.username });
    audit({ action: "updated", actor, after: entry, before, req }); notify("update"); res.json({ success: true, entry });
  });
  app.delete("/api/indoor-table/:id", async (req, res) => {
    const actor = canManage(req, res); if (!actor) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ success: false, message: "Invalid row id." }); return; }
    const before = await indoorTableGateway.findEntryById(id);
    if (!before) { res.status(404).json({ success: false, message: "Indoor row not found." }); return; }
    await indoorTableGateway.deleteEntry(id); audit({ action: "deleted", actor, after: null, before, req }); notify("delete");
    res.json({ success: true });
  });
}
