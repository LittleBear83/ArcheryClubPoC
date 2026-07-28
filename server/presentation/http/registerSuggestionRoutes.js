const ALLOWED_SUGGESTION_STATUSES = new Set([
  "new",
  "reviewing",
  "implemented",
  "declined",
]);

function buildSuggestionResponse(suggestion) {
  const submittedByResolvedName = suggestion.is_anonymous
    ? "Anonymous"
    : suggestion.submitted_by_name ||
      [suggestion.submitted_by_first_name, suggestion.submitted_by_surname]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      suggestion.submitted_by_username ||
      "Anonymous";

  return {
    id: suggestion.id,
    submittedByName: submittedByResolvedName,
    submittedByUsername: suggestion.is_anonymous ? "" : suggestion.submitted_by_username ?? "",
    isAnonymous: Boolean(suggestion.is_anonymous),
    suggestionTitle: suggestion.suggestion_title,
    improvementText: suggestion.improvement_text,
    suggestionDetails: suggestion.suggestion_details ?? "",
    resolutionNote: suggestion.resolution_note ?? "",
    status: suggestion.status,
    createdAtDate: suggestion.created_at_date,
    createdAtTime: suggestion.created_at_time,
    updatedAtDate: suggestion.updated_at_date ?? "",
    updatedAtTime: suggestion.updated_at_time ?? "",
    updatedByUsername: suggestion.updated_by_username ?? "",
    updatedByName: [
      suggestion.updated_by_first_name,
      suggestion.updated_by_surname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim(),
  };
}

function normalizeSuggestionPayload(body) {
  const submittedBy = typeof body?.submittedBy === "string" ? body.submittedBy.trim() : "";
  const suggestionTitle =
    typeof body?.suggestionTitle === "string" ? body.suggestionTitle.trim() : "";
  const improvementText =
    typeof body?.improvementText === "string" ? body.improvementText.trim() : "";
  const suggestionDetails =
    typeof body?.suggestionDetails === "string" ? body.suggestionDetails.trim() : "";

  return {
    submittedBy,
    suggestionTitle: suggestionTitle.slice(0, 200),
    improvementText: improvementText.slice(0, 4000),
    suggestionDetails: suggestionDetails.slice(0, 4000),
  };
}

function normalizeSuggestionStatusPayload(body) {
  return {
    status: typeof body?.status === "string" ? body.status.trim() : "",
    resolutionNote:
      typeof body?.resolutionNote === "string" ? body.resolutionNote.trim() : "",
  };
}

export function registerSuggestionRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  PERMISSIONS,
  suggestionGateway,
}) {
  app.get("/api/suggestions", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to review suggestions.",
      });
      return;
    }

    const suggestions = await suggestionGateway.listSuggestions();

    res.json({
      success: true,
      suggestions: suggestions.map(buildSuggestionResponse),
    });
  });

  app.get("/api/suggestions/mine", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const suggestions = await suggestionGateway.listSuggestionsByUsername(actor.username);

    res.json({
      success: true,
      suggestions: suggestions.map(buildSuggestionResponse),
    });
  });

  app.post("/api/suggestions", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const payload = normalizeSuggestionPayload(req.body);

    if (!payload.suggestionTitle) {
      res.status(400).json({
        success: false,
        message: "Suggestion title is required.",
      });
      return;
    }

    if (!payload.improvementText) {
      res.status(400).json({
        success: false,
        message: "Explain how this would improve the club.",
      });
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const suggestion = await suggestionGateway.createSuggestion({
      submittedByUsername: actor.username,
      submittedByName: payload.submittedBy || "Anonymous",
      isAnonymous: !payload.submittedBy,
      suggestionTitle: payload.suggestionTitle,
      improvementText: payload.improvementText,
      suggestionDetails: payload.suggestionDetails,
      status: "new",
      resolutionNote: "",
      createdAtDate,
      createdAtTime,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: suggestion,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: suggestion.id,
        entityLabel: suggestion.suggestion_title,
        entityType: "suggestion",
        req,
        statusCode: 201,
        target: `/api/suggestions/${suggestion.id}`,
      }).catch((auditError) => {
        console.error("Failed to record suggestion audit event", auditError);
      });
    }

    res.status(201).json({
      success: true,
      message: "Suggestion submitted successfully.",
      suggestion: buildSuggestionResponse(suggestion),
    });
  });

  app.put("/api/suggestions/:id/status", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor || !actorHasPermission(actor, PERMISSIONS.MANAGE_ANNOUNCEMENTS)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to update suggestion statuses.",
      });
      return;
    }

    const suggestionId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(suggestionId)) {
      res.status(400).json({
        success: false,
        message: "Suggestion id is invalid.",
      });
      return;
    }

    const existingSuggestion = await suggestionGateway.findSuggestionById(suggestionId);

    if (!existingSuggestion) {
      res.status(404).json({
        success: false,
        message: "Suggestion not found.",
      });
      return;
    }

    const statusPayload = normalizeSuggestionStatusPayload(req.body);
    const status = statusPayload.status;
    const resolutionNote =
      status === "implemented" || status === "declined"
        ? statusPayload.resolutionNote.slice(0, 4000)
        : "";

    if (!ALLOWED_SUGGESTION_STATUSES.has(status)) {
      res.status(400).json({
        success: false,
        message: "Choose a valid suggestion status.",
      });
      return;
    }

    if ((status === "implemented" || status === "declined") && !resolutionNote) {
      res.status(400).json({
        success: false,
        message: "Add a note explaining why this suggestion was implemented or declined.",
      });
      return;
    }

    const [updatedAtDate, updatedAtTime] = getUtcTimestampParts();
    const updatedSuggestion = await suggestionGateway.updateSuggestionStatus(suggestionId, {
      status,
      resolutionNote,
      updatedAtDate,
      updatedAtTime,
      updatedByUsername: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "updated",
        actorUsername: actor.username,
        after: updatedSuggestion,
        before: existingSuggestion,
        changedAtDate: updatedAtDate,
        changedAtTime: updatedAtTime,
        entityId: suggestionId,
        entityLabel: updatedSuggestion?.suggestion_title ?? existingSuggestion.suggestion_title,
        entityType: "suggestion",
        req,
        target: `/api/suggestions/${suggestionId}/status`,
      }).catch((auditError) => {
        console.error("Failed to record suggestion audit event", auditError);
      });
    }

    res.json({
      success: true,
      message: "Suggestion status updated successfully.",
      suggestion: buildSuggestionResponse(updatedSuggestion),
    });
  });
}
