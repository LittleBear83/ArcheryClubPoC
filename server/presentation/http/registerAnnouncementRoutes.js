const ALLOWED_ANNOUNCEMENT_SEVERITIES = new Set([
  "information",
  "urgent",
  "urgent_important",
]);
const ALLOWED_EMAIL_AUDIENCES = new Set([
  "all-members",
  "all-committee-members",
  "all-associate-members",
  "adhoc-list",
]);

function buildAnnouncementResponse(announcement, seenCount = 0) {
  return {
    id: announcement.id,
    activeFromDate: announcement.active_from_date,
    activeTillDate: announcement.active_till_date,
    severity: announcement.severity,
    message: announcement.message,
    escalateSeverity: Boolean(announcement.escalate_severity),
    createdByUsername: announcement.created_by_username,
    createdByName: [
      announcement.created_by_first_name,
      announcement.created_by_surname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
    createdAtDate: announcement.created_at_date,
    createdAtTime: announcement.created_at_time,
    amendedByUsername: announcement.amended_by_username ?? "",
    amendedByName: [
      announcement.amended_by_first_name,
      announcement.amended_by_surname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
    amendedAtDate: announcement.amended_at_date ?? "",
    amendedAtTime: announcement.amended_at_time ?? "",
    deletedByUsername: announcement.deleted_by_username ?? "",
    deletedByName: [
      announcement.deleted_by_first_name,
      announcement.deleted_by_surname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
    deletedAtDate: announcement.deleted_at_date ?? "",
    deletedAtTime: announcement.deleted_at_time ?? "",
    isDeleted: Boolean(announcement.is_deleted),
    seenCount,
  };
}

function normalizeAnnouncementPayload(body) {
  const activeFromDate =
    typeof body?.activeFromDate === "string" ? body.activeFromDate.trim() : "";
  const activeTillDate =
    typeof body?.activeTillDate === "string" ? body.activeTillDate.trim() : "";
  const severity =
    typeof body?.severity === "string" ? body.severity.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const escalateSeverity = body?.escalateSeverity === true;

  return {
    activeFromDate,
    activeTillDate,
    severity,
    message,
    escalateSeverity,
  };
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeEmailPayload(body) {
  const audience = typeof body?.audience === "string" ? body.audience.trim() : "";
  const adhocRecipients =
    typeof body?.adhocRecipients === "string" ? body.adhocRecipients.trim() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const messageBody = typeof body?.body === "string" ? body.body.trim() : "";

  return {
    audience,
    adhocRecipients,
    title: title.slice(0, 200),
    body: messageBody,
  };
}

export function registerAnnouncementRoutes({
  actorHasPermission,
  announcementGateway,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  serverEventBus,
  toUtcDateString,
}) {
  app.get("/api/announcements/active", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const activeAnnouncements = await announcementGateway.listActiveAnnouncements(
      toUtcDateString(new Date()),
    );

    res.json({
      success: true,
      announcements: activeAnnouncements.map((announcement) =>
        buildAnnouncementResponse(announcement),
      ),
    });
  });

  app.get("/api/announcements", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to manage announcements.",
      });
      return;
    }

    const announcements = await announcementGateway.listAnnouncements();
    const announcementsWithSeenCounts = await Promise.all(
      announcements.map(async (announcement) =>
        buildAnnouncementResponse(
          announcement,
          await announcementGateway.countSeenMembersByAnnouncementId(announcement.id),
        )),
    );

    res.json({
      success: true,
      announcements: announcementsWithSeenCounts,
    });
  });

  app.get("/api/announcements/:id/seen-members", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view announcement readership.",
      });
      return;
    }

    const announcementId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(announcementId)) {
      res.status(400).json({
        success: false,
        message: "Announcement id is invalid.",
      });
      return;
    }

    const announcement = await announcementGateway.findAnnouncementById(announcementId);

    if (!announcement) {
      res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
      return;
    }

    const seenMembers = await announcementGateway.listSeenMembersByAnnouncementId(
      announcementId,
    );

    res.json({
      success: true,
      members: seenMembers.map((member) => ({
        username: member.username,
        fullName: [member.first_name, member.surname].filter(Boolean).join(" ").trim(),
        seenAtDate: member.seen_at_date,
        seenAtTime: member.seen_at_time,
      })),
    });
  });

  app.post("/api/announcements/send-email", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.SEND_EMAIL)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to send email.",
      });
      return;
    }

    const payload = normalizeEmailPayload(req.body);

    if (!ALLOWED_EMAIL_AUDIENCES.has(payload.audience)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid email audience.",
      });
      return;
    }

    if (!payload.title) {
      res.status(400).json({
        success: false,
        message: "Email title is required.",
      });
      return;
    }

    if (!payload.body) {
      res.status(400).json({
        success: false,
        message: "Email body is required.",
      });
      return;
    }

    if (payload.audience === "adhoc-list" && !payload.adhocRecipients) {
      res.status(400).json({
        success: false,
        message: "Add at least one recipient for the ad hoc list.",
      });
      return;
    }

    res.json({
      success: true,
      message: "Email sent successfully.",
    });
  });

  app.post("/api/announcements", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to create announcements.",
      });
      return;
    }

    const payload = normalizeAnnouncementPayload(req.body);

    if (
      !isIsoDate(payload.activeFromDate) ||
      !isIsoDate(payload.activeTillDate)
    ) {
      res.status(400).json({
        success: false,
        message: "Active from and active till dates are required.",
      });
      return;
    }

    if (payload.activeTillDate < payload.activeFromDate) {
      res.status(400).json({
        success: false,
        message: "Active till date must be on or after the active from date.",
      });
      return;
    }

    if (!ALLOWED_ANNOUNCEMENT_SEVERITIES.has(payload.severity)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid announcement severity.",
      });
      return;
    }

    if (!payload.message) {
      res.status(400).json({
        success: false,
        message: "Announcement message is required.",
      });
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const announcement = await announcementGateway.createAnnouncement({
      ...payload,
      createdAtDate,
      createdAtTime,
      createdByUsername: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: announcement,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: announcement.id,
        entityLabel: announcement.message,
        entityType: "announcement",
        req,
        target: `/api/announcements/${announcement.id}`,
        statusCode: 201,
      }).catch((auditError) => {
        console.error("Failed to record announcement audit event", auditError);
      });
    }

    res.status(201).json({
      success: true,
      announcement: buildAnnouncementResponse(announcement, 0),
    });

    serverEventBus.broadcastToAll("announcements.updated", {
      action: "created",
      announcementId: announcement.id,
      changedAt: new Date().toISOString(),
    });
  });

  app.put("/api/announcements/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to amend announcements.",
      });
      return;
    }

    const announcementId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(announcementId)) {
      res.status(400).json({
        success: false,
        message: "Announcement id is invalid.",
      });
      return;
    }

    const existingAnnouncement = await announcementGateway.findAnnouncementById(
      announcementId,
    );

    if (!existingAnnouncement) {
      res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
      return;
    }

    const payload = normalizeAnnouncementPayload(req.body);

    if (!isIsoDate(payload.activeFromDate) || !isIsoDate(payload.activeTillDate)) {
      res.status(400).json({
        success: false,
        message: "Active from and active till dates are required.",
      });
      return;
    }

    if (payload.activeTillDate < payload.activeFromDate) {
      res.status(400).json({
        success: false,
        message: "Active till date must be on or after the active from date.",
      });
      return;
    }

    if (!ALLOWED_ANNOUNCEMENT_SEVERITIES.has(payload.severity)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid announcement severity.",
      });
      return;
    }

    if (!payload.message) {
      res.status(400).json({
        success: false,
        message: "Announcement message is required.",
      });
      return;
    }

    const [amendedAtDate, amendedAtTime] = getUtcTimestampParts();
    const updatedAnnouncement = await announcementGateway.updateAnnouncement(announcementId, {
      ...payload,
      amendedAtDate,
      amendedAtTime,
      amendedByUsername: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedAnnouncement,
        before: existingAnnouncement,
        changedAtDate: amendedAtDate,
        changedAtTime: amendedAtTime,
        entityId: announcementId,
        entityLabel: updatedAnnouncement?.message ?? existingAnnouncement.message,
        entityType: "announcement",
        req,
        target: `/api/announcements/${announcementId}`,
      }).catch((auditError) => {
        console.error("Failed to record announcement audit event", auditError);
      });
    }

    res.json({
      success: true,
      announcement: buildAnnouncementResponse(
        updatedAnnouncement,
        await announcementGateway.countSeenMembersByAnnouncementId(announcementId),
      ),
    });

    serverEventBus.broadcastToAll("announcements.updated", {
      action: "updated",
      announcementId,
      changedAt: new Date().toISOString(),
    });
  });

  app.delete("/api/announcements/:id", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to delete announcements.",
      });
      return;
    }

    const announcementId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(announcementId)) {
      res.status(400).json({
        success: false,
        message: "Announcement id is invalid.",
      });
      return;
    }

    const existingAnnouncement = await announcementGateway.findAnnouncementById(
      announcementId,
    );

    if (!existingAnnouncement) {
      res.status(404).json({
        success: false,
        message: "Announcement not found.",
      });
      return;
    }

    const [deletedAtDate, deletedAtTime] = getUtcTimestampParts();
    const deletedAnnouncement = await announcementGateway.softDeleteAnnouncement(
      announcementId,
      {
        deletedAtDate,
        deletedAtTime,
        deletedByUsername: actor.username,
      },
    );

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "deleted",
        actorUsername: actor.username,
        after: deletedAnnouncement,
        before: existingAnnouncement,
        changedAtDate: deletedAtDate,
        changedAtTime: deletedAtTime,
        entityId: announcementId,
        entityLabel: existingAnnouncement.message,
        entityType: "announcement",
        req,
        target: `/api/announcements/${announcementId}`,
      }).catch((auditError) => {
        console.error("Failed to record announcement audit event", auditError);
      });
    }

    res.json({
      success: true,
      announcement: buildAnnouncementResponse(
        deletedAnnouncement,
        await announcementGateway.countSeenMembersByAnnouncementId(announcementId),
      ),
    });

    serverEventBus.broadcastToAll("announcements.updated", {
      action: "deleted",
      announcementId,
      changedAt: new Date().toISOString(),
    });
  });
}
