function normalizeSectionPayload(section, index) {
  const title =
    typeof section?.title === "string" ? section.title.trim().slice(0, 160) : "";
  const body =
    typeof section?.body === "string" ? section.body.trim().slice(0, 12000) : "";

  if (!title && !body) {
    return null;
  }

  return {
    id:
      typeof section?.id === "string" && section.id.trim()
        ? section.id.trim().slice(0, 80)
        : `section-${index + 1}`,
    title: title || `Section ${index + 1}`,
    body,
  };
}

function normalizeActionPayload(action, index) {
  const text =
    typeof action?.text === "string" ? action.text.trim().slice(0, 2000) : "";
  const owner =
    typeof action?.owner === "string" ? action.owner.trim().slice(0, 160) : "";

  if (!text && !owner) {
    return null;
  }

  return {
    id:
      typeof action?.id === "string" && action.id.trim()
        ? action.id.trim().slice(0, 80)
        : `action-${index + 1}`,
    text,
    owner,
  };
}

function buildCommitteeMinuteResponse(minute) {
  return {
    id: minute.id,
    meetingDate: minute.meeting_date,
    title: minute.title,
    sections: Array.isArray(minute.sections_json) ? minute.sections_json : [],
    actions: Array.isArray(minute.actions_json) ? minute.actions_json : [],
    createdAtDate: minute.created_at_date,
    createdAtTime: minute.created_at_time,
    updatedAtDate: minute.updated_at_date,
    updatedAtTime: minute.updated_at_time,
    updatedByUsername: minute.updated_by_username ?? "",
  };
}

function normalizeCreateMinutesPayload(body) {
  return {
    meetingDate:
      typeof body?.meetingDate === "string" ? body.meetingDate.trim().slice(0, 10) : "",
    title: typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "",
    sections: Array.isArray(body?.sections)
      ? body.sections.map(normalizeSectionPayload).filter(Boolean)
      : [],
    actions: Array.isArray(body?.actions)
      ? body.actions.map(normalizeActionPayload).filter(Boolean)
      : [],
  };
}

async function isCommitteeActor(actor, { actorHasPermission, PERMISSIONS, roleCommitteeGateway }) {
  if (!actor) {
    return false;
  }

  if (
    actorHasPermission(actor, PERMISSIONS.MANAGE_COMMITTEE_ROLES) ||
    actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)
  ) {
    return true;
  }

  const committeeRoles = await roleCommitteeGateway.listCommitteeRoles();

  return committeeRoles.some(
    (role) =>
      String(role.assigned_username ?? "").trim().toLowerCase() ===
      String(actor.username ?? "").trim().toLowerCase(),
  );
}

export function registerCommitteeMinutesRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  committeeMinutesGateway,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  roleCommitteeGateway,
  serverEventBus,
}) {
  app.get("/api/committee-minutes", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const minutes = await committeeMinutesGateway.listMinutes();

    res.json({
      success: true,
      minutes: minutes.map(buildCommitteeMinuteResponse),
    });
  });

  app.post("/api/committee-minutes", async (req, res) => {
    const actor = getActorUser(req);

    if (
      !(await isCommitteeActor(actor, {
        actorHasPermission,
        PERMISSIONS,
        roleCommitteeGateway,
      }))
    ) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to add committee meeting minutes.",
      });
      return;
    }

    const payload = normalizeCreateMinutesPayload(req.body);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.meetingDate)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid meeting date.",
      });
      return;
    }

    if (!payload.title) {
      res.status(400).json({
        success: false,
        message: "Add a meeting title.",
      });
      return;
    }

    if (payload.sections.length === 0) {
      res.status(400).json({
        success: false,
        message: "Add at least one minutes section.",
      });
      return;
    }

    const [date, time] = getUtcTimestampParts();
    const minute = await committeeMinutesGateway.createMinute({
      actions: payload.actions,
      createdAtDate: date,
      createdAtTime: time,
      meetingDate: payload.meetingDate,
      sections: payload.sections,
      title: payload.title,
      updatedAtDate: date,
      updatedAtTime: time,
      updatedByUsername: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: minute,
        before: null,
        changedAtDate: date,
        changedAtTime: time,
        entityId: minute.id,
        entityLabel: minute.title,
        entityType: "committee_meeting_minutes",
        req,
        statusCode: 201,
        target: `/api/committee-minutes/${minute.id}`,
      }).catch((auditError) => {
        console.error("Failed to record committee minutes audit event", auditError);
      });
    }

    serverEventBus?.broadcastToAll("committee-minutes.updated", {
      changedAt: new Date().toISOString(),
      minuteId: minute.id,
    });

    res.status(201).json({
      success: true,
      message: "Committee meeting minutes added.",
      minute: buildCommitteeMinuteResponse(minute),
    });
  });
}
