const CONFIG = {
  member_question_created: {
    table: "member_questions",
    columns: ["submitted_by_username", "question_title", "question_body", "created_at_date", "created_at_time"],
    required: ["submitted_by_username", "question_title", "question_body", "created_at_date", "created_at_time"],
  },
  suggestion_created: {
    table: "suggestions",
    columns: ["submitted_by_username", "submitted_by_name", "is_anonymous", "suggestion_title", "improvement_text", "suggestion_details", "created_at_date", "created_at_time"],
    required: ["suggestion_title", "improvement_text", "created_at_date", "created_at_time"],
  },
};

export async function processFeedbackCreateCommand({ client, event, machineId }) {
  const config = CONFIG[event.eventType];
  if (!config) throw new Error("Unsupported feedback command type.");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:feedback:${event.eventId}`]);
  const previous = await client.query(
    "SELECT outcome_json, event_type, machine_id FROM sync_received_commands WHERE event_id = $1",
    [event.eventId],
  );
  if (previous.rows[0]) {
    return previous.rows[0].event_type === event.eventType && previous.rows[0].machine_id === machineId
      ? previous.rows[0].outcome_json
      : { accepted: false, code: "feedback_event_id_conflict", reason: "This event ID belongs to another command." };
  }

  const payload = event.payload ?? {};
  let outcome;
  if (
    !payload || typeof payload !== "object" ||
    typeof payload.sync_id !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.sync_id) ||
    payload.expectedVersion !== 0 ||
    payload.sync_origin_event_id !== event.eventId ||
    payload.sync_source_machine_id !== machineId ||
    config.required.some((key) => typeof payload[key] !== "string" || !payload[key].trim()) ||
    (event.eventType === "suggestion_created" && (
      typeof payload.is_anonymous !== "boolean" ||
      typeof payload.submitted_by_name !== "string" ||
      typeof payload.suggestion_details !== "string" ||
      (payload.submitted_by_username !== null &&
        (typeof payload.submitted_by_username !== "string" || !payload.submitted_by_username.trim()))
    ))
  ) {
    outcome = { accepted: false, code: "malformed_feedback_create", reason: "The feedback creation command is incomplete or invalid." };
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:feedback-id:${payload.sync_id}`]);
    const existing = await client.query(
      `SELECT sync_version, sync_origin_event_id, sync_source_machine_id FROM ${config.table} WHERE sync_id = $1 FOR UPDATE`,
      [payload.sync_id],
    );
    if (existing.rows[0]) {
      outcome = existing.rows[0].sync_origin_event_id === event.eventId &&
        existing.rows[0].sync_source_machine_id === machineId
        ? { accepted: true }
        : { accepted: false, code: "feedback_stale_version", reason: "Cloud has a newer record for this sync ID." };
    } else {
      const member = payload.submitted_by_username == null
        ? null
        : await client.query(
          "SELECT username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
          [payload.submitted_by_username],
        );
      if (payload.submitted_by_username != null && !member?.rows[0]) {
        outcome = { accepted: false, code: "feedback_submitter_missing", reason: "The submitting member does not exist in cloud." };
      } else {
        const columns = [...config.columns, "sync_id", "sync_source_machine_id", "sync_origin_event_id"];
        const values = [
          ...config.columns.map((key) => key === "submitted_by_username" ? member?.rows[0]?.username ?? null : payload[key]),
          payload.sync_id, machineId, event.eventId,
        ];
        await client.query(
          `INSERT INTO ${config.table} (${columns.join(", ")}, submitted_by_user_id)
           VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")},
             (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1))`,
          values,
        );
        outcome = { accepted: true };
      }
    }
  }

  await client.query(
    `INSERT INTO sync_received_commands (event_id, event_type, machine_id, outcome_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [event.eventId, event.eventType, machineId, JSON.stringify(outcome)],
  );
  return outcome;
}

export async function processFeedbackUpdateCommand({ client, event, machineId }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:feedback:${event.eventId}`]);
  const previous = await client.query(
    "SELECT outcome_json, event_type, machine_id FROM sync_received_commands WHERE event_id = $1",
    [event.eventId],
  );
  if (previous.rows[0]) {
    return previous.rows[0].event_type === event.eventType && previous.rows[0].machine_id === machineId
      ? previous.rows[0].outcome_json
      : { accepted: false, code: "feedback_event_id_conflict", reason: "This event ID belongs to another command." };
  }

  const payload = event.payload ?? {};
  const table = event.eventType === "suggestion_status_updated" ? "suggestions" : "member_questions";
  let outcome;
  if (
    typeof payload.syncId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.syncId) ||
    !Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion < 1 ||
    (event.eventType === "member_question_response_updated" &&
      (typeof payload.responseText !== "string" || !payload.responseText.trim() ||
        typeof payload.respondedByUsername !== "string" || !payload.respondedByUsername.trim())) ||
    (event.eventType === "suggestion_status_updated" &&
      (!["new", "reviewing", "implemented", "declined"].includes(payload.status) ||
        typeof payload.resolutionNote !== "string" ||
        typeof payload.updatedByUsername !== "string" || !payload.updatedByUsername.trim()))
  ) {
    outcome = { accepted: false, code: "malformed_feedback_update", reason: "The feedback update command is invalid." };
  } else {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`archery:feedback-id:${payload.syncId}`]);
    const current = await client.query(
      `SELECT sync_version, submitted_by_username FROM ${table} WHERE sync_id = $1 FOR UPDATE`,
      [payload.syncId],
    );
    if (!current.rows[0]) {
      outcome = { accepted: false, code: "feedback_missing", reason: "The feedback record no longer exists in cloud." };
    } else if (Number(current.rows[0].sync_version) !== payload.expectedVersion) {
      outcome = { accepted: false, code: "feedback_stale_version", reason: "Cloud has a newer version of this feedback record." };
    } else if (event.eventType === "member_question_seen" &&
      String(current.rows[0].submitted_by_username).toLowerCase() !== String(payload.submittedByUsername ?? "").toLowerCase()) {
      outcome = { accepted: false, code: "feedback_actor_forbidden", reason: "Only the submitter can mark this response as seen." };
    } else {
      const actorUsername = event.eventType === "member_question_response_updated"
        ? payload.respondedByUsername
        : event.eventType === "suggestion_status_updated"
          ? payload.updatedByUsername
          : null;
      const actor = actorUsername ? await client.query(
        "SELECT username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [actorUsername],
      ) : null;
      const permissions = actor?.rows[0] ? await client.query(
        `SELECT 1 FROM user_types AS types
         JOIN role_permissions AS permissions ON permissions.role_key = types.user_type
         WHERE LOWER(types.username) = LOWER($1)
           AND permissions.permission_key = ANY($2::text[])
         LIMIT 1`,
        [actor.rows[0].username, event.eventType === "suggestion_status_updated"
          ? ["manage_announcements"]
          : ["manage_announcements", "manage_committee_roles"]],
      ) : null;
      const committee = actor?.rows[0] && event.eventType === "member_question_response_updated" && !permissions?.rows[0]
        ? await client.query("SELECT 1 FROM committee_roles WHERE LOWER(assigned_username) = LOWER($1) LIMIT 1", [actor.rows[0].username])
        : null;
      if (actorUsername && !actor?.rows[0]) {
        outcome = { accepted: false, code: "feedback_actor_missing", reason: "The reviewing member does not exist in cloud." };
      } else if (actorUsername && !permissions?.rows[0] && !committee?.rows[0]) {
        outcome = { accepted: false, code: "feedback_actor_forbidden", reason: "The reviewing member no longer has permission in cloud." };
      } else if (event.eventType === "member_question_seen") {
        await client.query("UPDATE member_questions SET member_seen_response = TRUE WHERE sync_id = $1", [payload.syncId]);
      } else if (event.eventType === "member_question_response_updated") {
        await client.query(`UPDATE member_questions SET status = 'answered', response_text = $2,
          member_seen_response = FALSE, responded_by_username = $3,
          responded_by_user_id = (SELECT id FROM users WHERE LOWER(username) = LOWER($3) LIMIT 1),
          responded_at_date = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
          responded_at_time = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'HH24:MI:SS'),
          updated_at_date = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
          updated_at_time = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'HH24:MI:SS')
          WHERE sync_id = $1`, [payload.syncId, payload.responseText, actor.rows[0].username]);
      } else {
        await client.query(`UPDATE suggestions SET status = $2, resolution_note = $3,
          updated_by_username = $4,
          updated_by_user_id = (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1),
          updated_at_date = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
          updated_at_time = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'HH24:MI:SS')
          WHERE sync_id = $1`, [payload.syncId, payload.status, payload.resolutionNote, actor.rows[0].username]);
      }
      if (!outcome) outcome = { accepted: true };
    }
  }

  await client.query(
    `INSERT INTO sync_received_commands (event_id, event_type, machine_id, outcome_json)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [event.eventId, event.eventType, machineId, JSON.stringify(outcome)],
  );
  return outcome;
}
