function buildMemberQuestionResponse(question) {
  const submittedByName =
    [question.submitted_by_first_name, question.submitted_by_surname]
      .filter(Boolean)
      .join(" ")
      .trim() || question.submitted_by_username || "Member";
  const respondedByName =
    [question.responded_by_first_name, question.responded_by_surname]
      .filter(Boolean)
      .join(" ")
      .trim() || question.responded_by_username || "";

  return {
    id: question.id,
    submittedByName,
    submittedByUsername: question.submitted_by_username,
    questionTitle: question.question_title,
    questionBody: question.question_body,
    status: question.status,
    responseText: question.response_text ?? "",
    memberSeenResponse: Boolean(question.member_seen_response),
    createdAtDate: question.created_at_date,
    createdAtTime: question.created_at_time,
    respondedAtDate: question.responded_at_date ?? "",
    respondedAtTime: question.responded_at_time ?? "",
    respondedByUsername: question.responded_by_username ?? "",
    respondedByName,
    updatedAtDate: question.updated_at_date ?? "",
    updatedAtTime: question.updated_at_time ?? "",
  };
}

function normalizeCreateQuestionPayload(body) {
  return {
    questionBody:
      typeof body?.questionBody === "string" ? body.questionBody.trim().slice(0, 4000) : "",
    questionTitle:
      typeof body?.questionTitle === "string" ? body.questionTitle.trim().slice(0, 200) : "",
  };
}

function normalizeResponsePayload(body) {
  return {
    responseText:
      typeof body?.responseText === "string" ? body.responseText.trim().slice(0, 4000) : "",
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

async function listCommitteeUsernames(roleCommitteeGateway) {
  const committeeRoles = await roleCommitteeGateway.listCommitteeRoles();

  return [...new Set(
    committeeRoles
      .map((role) => String(role.assigned_username ?? "").trim())
      .filter(Boolean),
  )];
}

export function registerMemberQuestionRoutes({
  actorHasPermission,
  app,
  auditChangeLogger,
  getActorUser,
  getUtcTimestampParts,
  memberQuestionGateway,
  PERMISSIONS,
  roleCommitteeGateway,
  serverEventBus,
}) {
  app.get("/api/member-questions", async (req, res) => {
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
        message: "You do not have permission to review member questions.",
      });
      return;
    }

    const questions = await memberQuestionGateway.listQuestions();

    res.json({
      success: true,
      questions: questions.map(buildMemberQuestionResponse),
    });
  });

  app.get("/api/member-questions/mine", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const questions = await memberQuestionGateway.listQuestionsByUsername(actor.username);

    res.json({
      success: true,
      questions: questions.map(buildMemberQuestionResponse),
    });
  });

  app.post("/api/member-questions", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const payload = normalizeCreateQuestionPayload(req.body);

    if (!payload.questionTitle) {
      res.status(400).json({
        success: false,
        message: "Question title is required.",
      });
      return;
    }

    if (!payload.questionBody) {
      res.status(400).json({
        success: false,
        message: "Add your question before sending it to the committee.",
      });
      return;
    }

    const [createdAtDate, createdAtTime] = getUtcTimestampParts();
    const question = await memberQuestionGateway.createQuestion({
      createdAtDate,
      createdAtTime,
      questionBody: payload.questionBody,
      questionTitle: payload.questionTitle,
      submittedByUsername: actor.username,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "created",
        actorUsername: actor.username,
        after: question,
        before: null,
        changedAtDate: createdAtDate,
        changedAtTime: createdAtTime,
        entityId: question.id,
        entityLabel: question.question_title,
        entityType: "member_question",
        req,
        statusCode: 201,
        target: `/api/member-questions/${question.id}`,
      }).catch((auditError) => {
        console.error("Failed to record member question audit event", auditError);
      });
    }

    serverEventBus?.broadcastToUsers(
      await listCommitteeUsernames(roleCommitteeGateway),
      "member-questions.inbox-updated",
      {
        changedAt: new Date().toISOString(),
        questionId: question.id,
      },
    );

    res.status(201).json({
      success: true,
      message: "Your question has been sent to the committee.",
      question: buildMemberQuestionResponse(question),
    });
  });

  app.put("/api/member-questions/:id/response", async (req, res) => {
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
        message: "You do not have permission to respond to member questions.",
      });
      return;
    }

    const questionId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(questionId)) {
      res.status(400).json({
        success: false,
        message: "Question id is invalid.",
      });
      return;
    }

    const existingQuestion = await memberQuestionGateway.findQuestionById(questionId);

    if (!existingQuestion) {
      res.status(404).json({
        success: false,
        message: "Question not found.",
      });
      return;
    }

    const payload = normalizeResponsePayload(req.body);

    if (!payload.responseText) {
      res.status(400).json({
        success: false,
        message: "Add a response before saving it.",
      });
      return;
    }

    const [respondedAtDate, respondedAtTime] = getUtcTimestampParts();
    const updatedQuestion = await memberQuestionGateway.respondToQuestion(questionId, {
      respondedAtDate,
      respondedAtTime,
      respondedByUsername: actor.username,
      responseText: payload.responseText,
      updatedAtDate: respondedAtDate,
      updatedAtTime: respondedAtTime,
    });

    if (auditChangeLogger) {
      void auditChangeLogger.recordEntityChange({
        action: "answered",
        actorUsername: actor.username,
        after: updatedQuestion,
        before: existingQuestion,
        changedAtDate: respondedAtDate,
        changedAtTime: respondedAtTime,
        entityId: questionId,
        entityLabel: updatedQuestion?.question_title ?? existingQuestion.question_title,
        entityType: "member_question",
        req,
        target: `/api/member-questions/${questionId}/response`,
      }).catch((auditError) => {
        console.error("Failed to record member question response audit event", auditError);
      });
    }

    if (updatedQuestion?.submitted_by_username) {
      serverEventBus?.broadcastToUsers(
        [updatedQuestion.submitted_by_username],
        "member-questions.updated",
        {
          changedAt: new Date().toISOString(),
          hasUnreadResponse: true,
          questionId,
        },
      );
    }

    serverEventBus?.broadcastToUsers(
      await listCommitteeUsernames(roleCommitteeGateway),
      "member-questions.inbox-updated",
      {
        changedAt: new Date().toISOString(),
        questionId,
      },
    );

    res.json({
      success: true,
      message: "Response saved successfully.",
      question: buildMemberQuestionResponse(updatedQuestion),
    });
  });

  app.put("/api/member-questions/:id/seen", async (req, res) => {
    const actor = getActorUser(req);

    if (!actor) {
      res.status(401).json({
        success: false,
        message: "An authenticated member is required.",
      });
      return;
    }

    const questionId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(questionId)) {
      res.status(400).json({
        success: false,
        message: "Question id is invalid.",
      });
      return;
    }

    const question = await memberQuestionGateway.findQuestionById(questionId);

    if (!question) {
      res.status(404).json({
        success: false,
        message: "Question not found.",
      });
      return;
    }

    if (
      String(question.submitted_by_username ?? "").trim().toLowerCase() !==
      String(actor.username ?? "").trim().toLowerCase()
    ) {
      res.status(403).json({
        success: false,
        message: "You can only mark your own question responses as seen.",
      });
      return;
    }

    const updatedQuestion = await memberQuestionGateway.markResponseSeen(questionId);

    res.json({
      success: true,
      question: buildMemberQuestionResponse(updatedQuestion),
    });
  });
}
