const DOMAINS = {
  member_questions: {
    eventType: "member_question_created",
    fields: [
      "sync_id", "sync_version", "sync_source_machine_id", "sync_origin_event_id",
      "submitted_by_username", "question_title", "question_body", "status",
      "response_text", "member_seen_response", "created_at_date", "created_at_time",
      "responded_at_date", "responded_at_time", "responded_by_username",
      "updated_at_date", "updated_at_time",
    ],
    foreignKeys: [
      ["submitted_by_user_id", "submitted_by_username"],
      ["responded_by_user_id", "responded_by_username"],
    ],
  },
  suggestions: {
    eventType: "suggestion_created",
    fields: [
      "sync_id", "sync_version", "sync_source_machine_id", "sync_origin_event_id",
      "submitted_by_username", "submitted_by_name", "is_anonymous",
      "suggestion_title", "improvement_text", "suggestion_details", "status",
      "resolution_note", "created_at_date", "created_at_time",
      "updated_at_date", "updated_at_time", "updated_by_username",
    ],
    foreignKeys: [
      ["submitted_by_user_id", "submitted_by_username"],
      ["updated_by_user_id", "updated_by_username"],
    ],
  },
};

export async function upsertFeedbackRows(client, domain, rows) {
  const config = DOMAINS[domain];
  if (!config || !Array.isArray(rows)) throw new Error("Invalid feedback sync rows.");
  const { fields, foreignKeys } = config;
  const columns = [...fields, "sync_is_cloud_managed", ...foreignKeys.map(([column]) => column)];
  const placeholders = [
    ...fields.map((_, index) => `$${index + 1}`),
    "TRUE",
    ...foreignKeys.map(([, usernameColumn]) =>
      `(SELECT id FROM users WHERE LOWER(username) = LOWER($${fields.indexOf(usernameColumn) + 1}) LIMIT 1)`),
  ];
  const updates = columns.filter((column) => column !== "sync_id")
    .map((column) => `${column} = EXCLUDED.${column}`).join(", ");

  for (const row of rows) {
    if (typeof row?.sync_id !== "string" || !row.sync_id) throw new Error("Feedback sync ID is required.");
    await client.query(
      `INSERT INTO ${domain} (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (sync_id) DO UPDATE SET ${updates}`,
      fields.map((field) => row[field] ?? null),
    );
  }
}

export async function reconcileFeedbackSnapshot(client, domain, rows) {
  const config = DOMAINS[domain];
  if (!config || !Array.isArray(rows)) throw new Error("Invalid feedback snapshot rows.");
  await upsertFeedbackRows(client, domain, rows);
  await client.query(
    `DELETE FROM ${domain} AS feedback
     WHERE feedback.sync_id <> ALL($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM sync_local_outbox AS pending
         WHERE pending.aggregate_key = feedback.sync_id
           AND pending.event_type = $2
           AND pending.acknowledged_at IS NULL
           AND pending.rejected_at IS NULL
       )`,
    [rows.map((row) => row.sync_id), config.eventType],
  );
}

export async function applyFeedbackChange(client, change) {
  if (!DOMAINS[change.domain]) throw new Error("Unknown feedback sync domain.");
  const syncId = change.payload?.sync_id;
  if (typeof syncId !== "string" || !syncId) throw new Error("Feedback change is missing its sync ID.");
  if (change.operation === "delete") {
    await client.query(`DELETE FROM ${change.domain} WHERE sync_id = $1`, [syncId]);
  } else if (change.operation === "upsert") {
    await upsertFeedbackRows(client, change.domain, [change.payload]);
  } else {
    throw new Error("Unknown feedback change operation.");
  }
}
