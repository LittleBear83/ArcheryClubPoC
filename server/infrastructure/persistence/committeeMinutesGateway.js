function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSection(section, index) {
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

function normalizeActionItem(action, index) {
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

function normalizeMinuteRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id ?? 0),
    sections_json: parseJsonArray(row.sections_json)
      .map(normalizeSection)
      .filter(Boolean),
    actions_json: parseJsonArray(row.actions_json)
      .map(normalizeActionItem)
      .filter(Boolean),
  };
}

function createSqliteCommitteeMinutesGateway(db) {
  const findMinuteByIdStatement = db.prepare(`
    SELECT *
    FROM committee_meeting_minutes
    WHERE id = ?
    LIMIT 1
  `);
  const listMinutesStatement = db.prepare(`
    SELECT *
    FROM committee_meeting_minutes
    ORDER BY meeting_date DESC, id DESC
  `);
  const createMinuteStatement = db.prepare(`
    INSERT INTO committee_meeting_minutes (
      meeting_date,
      title,
      sections_json,
      actions_json,
      created_at_date,
      created_at_time,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    async createMinute(payload) {
      const result = createMinuteStatement.run(
        payload.meetingDate,
        payload.title,
        JSON.stringify(payload.sections ?? []),
        JSON.stringify(payload.actions ?? []),
        payload.createdAtDate,
        payload.createdAtTime,
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
      );

      return normalizeMinuteRow(findMinuteByIdStatement.get(result.lastInsertRowid));
    },
    async findMinuteById(id) {
      return normalizeMinuteRow(findMinuteByIdStatement.get(id));
    },
    async listMinutes() {
      return listMinutesStatement.all().map(normalizeMinuteRow);
    },
  };
}

function createPostgresCommitteeMinutesGateway({ pool }) {
  return {
    async createMinute(payload) {
      const result = await pool.query(
        `
          INSERT INTO committee_meeting_minutes (
            meeting_date,
            title,
            sections_json,
            actions_json,
            created_at_date,
            created_at_time,
            updated_at_date,
            updated_at_time,
            updated_by_username,
            updated_by_user_id
          )
          VALUES (
            $1,
            $2,
            $3::jsonb,
            $4::jsonb,
            $5,
            $6,
            $7,
            $8,
            $9,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($9) LIMIT 1)
          )
          RETURNING id
        `,
        [
          payload.meetingDate,
          payload.title,
          JSON.stringify(payload.sections ?? []),
          JSON.stringify(payload.actions ?? []),
          payload.createdAtDate,
          payload.createdAtTime,
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
        ],
      );

      return this.findMinuteById(result.rows[0]?.id);
    },
    async findMinuteById(id) {
      const result = await pool.query(
        `
          SELECT *
          FROM committee_meeting_minutes
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeMinuteRow(result.rows[0] ?? null);
    },
    async listMinutes() {
      const result = await pool.query(`
        SELECT *
        FROM committee_meeting_minutes
        ORDER BY meeting_date DESC, id DESC
      `);

      return result.rows.map(normalizeMinuteRow);
    },
  };
}

export function createCommitteeMinutesGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresCommitteeMinutesGateway(options);
  }

  return createSqliteCommitteeMinutesGateway(options.db);
}
