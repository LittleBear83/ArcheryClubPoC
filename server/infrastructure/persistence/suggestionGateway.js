const ALLOWED_SUGGESTION_STATUSES = new Set([
  "new",
  "reviewing",
  "implemented",
  "declined",
]);

function normalizeSuggestionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id ?? 0),
    is_anonymous: Number(row.is_anonymous ?? 0),
    resolution_note: row.resolution_note ?? "",
  };
}

function createSqliteSuggestionGateway(db) {
  const selectColumns = `
    suggestions.*,
    submitted_by_user.first_name AS submitted_by_first_name,
    submitted_by_user.surname AS submitted_by_surname,
    updated_by_user.first_name AS updated_by_first_name,
    updated_by_user.surname AS updated_by_surname
  `;
  const findSuggestionByIdStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM suggestions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = suggestions.submitted_by_username
    LEFT JOIN users AS updated_by_user
      ON updated_by_user.username = suggestions.updated_by_username
    WHERE suggestions.id = ?
    LIMIT 1
  `);
  const listSuggestionsStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM suggestions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = suggestions.submitted_by_username
    LEFT JOIN users AS updated_by_user
      ON updated_by_user.username = suggestions.updated_by_username
    ORDER BY
      CASE suggestions.status
        WHEN 'new' THEN 0
        WHEN 'reviewing' THEN 1
        WHEN 'implemented' THEN 2
        WHEN 'declined' THEN 3
        ELSE 4
      END ASC,
      suggestions.created_at_date DESC,
      suggestions.created_at_time DESC,
      suggestions.id DESC
  `);
  const listSuggestionsByUsernameStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM suggestions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = suggestions.submitted_by_username
    LEFT JOIN users AS updated_by_user
      ON updated_by_user.username = suggestions.updated_by_username
    WHERE suggestions.submitted_by_username = ?
    ORDER BY
      suggestions.created_at_date DESC,
      suggestions.created_at_time DESC,
      suggestions.id DESC
  `);
  const createSuggestionStatement = db.prepare(`
    INSERT INTO suggestions (
      submitted_by_username,
      submitted_by_name,
      is_anonymous,
      suggestion_title,
      improvement_text,
      suggestion_details,
      status,
      resolution_note,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSuggestionStatusStatement = db.prepare(`
    UPDATE suggestions
    SET
      status = ?,
      resolution_note = ?,
      updated_at_date = ?,
      updated_at_time = ?,
      updated_by_username = ?
    WHERE id = ?
  `);

  return {
    async createSuggestion(payload) {
      const result = createSuggestionStatement.run(
        payload.submittedByUsername,
        payload.submittedByName,
        payload.isAnonymous ? 1 : 0,
        payload.suggestionTitle,
        payload.improvementText,
        payload.suggestionDetails,
        ALLOWED_SUGGESTION_STATUSES.has(payload.status) ? payload.status : "new",
        payload.resolutionNote ?? "",
        payload.createdAtDate,
        payload.createdAtTime,
      );

      return normalizeSuggestionRow(findSuggestionByIdStatement.get(result.lastInsertRowid));
    },
    async findSuggestionById(id) {
      return normalizeSuggestionRow(findSuggestionByIdStatement.get(id));
    },
    async listSuggestions() {
      return listSuggestionsStatement.all().map(normalizeSuggestionRow);
    },
    async listSuggestionsByUsername(username) {
      return listSuggestionsByUsernameStatement.all(username).map(normalizeSuggestionRow);
    },
    async updateSuggestionStatus(id, payload) {
      updateSuggestionStatusStatement.run(
        ALLOWED_SUGGESTION_STATUSES.has(payload.status) ? payload.status : "new",
        payload.resolutionNote ?? "",
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
        id,
      );

      return normalizeSuggestionRow(findSuggestionByIdStatement.get(id));
    },
  };
}

function createPostgresSuggestionGateway({ pool }) {
  return {
    async createSuggestion(payload) {
      const result = await pool.query(
        `
          INSERT INTO suggestions (
            submitted_by_username,
            submitted_by_name,
            is_anonymous,
            suggestion_title,
            improvement_text,
            suggestion_details,
            status,
            resolution_note,
            created_at_date,
            created_at_time
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `,
        [
          payload.submittedByUsername,
          payload.submittedByName,
          payload.isAnonymous,
          payload.suggestionTitle,
          payload.improvementText,
          payload.suggestionDetails,
          ALLOWED_SUGGESTION_STATUSES.has(payload.status) ? payload.status : "new",
          payload.resolutionNote ?? "",
          payload.createdAtDate,
          payload.createdAtTime,
        ],
      );

      return this.findSuggestionById(result.rows[0]?.id);
    },
    async findSuggestionById(id) {
      const result = await pool.query(
        `
          SELECT
            suggestions.*,
            submitted_by_user.first_name AS submitted_by_first_name,
            submitted_by_user.surname AS submitted_by_surname,
            updated_by_user.first_name AS updated_by_first_name,
            updated_by_user.surname AS updated_by_surname
          FROM suggestions
          LEFT JOIN users AS submitted_by_user
            ON submitted_by_user.username = suggestions.submitted_by_username
          LEFT JOIN users AS updated_by_user
            ON updated_by_user.username = suggestions.updated_by_username
          WHERE suggestions.id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeSuggestionRow(result.rows[0] ?? null);
    },
    async listSuggestions() {
      const result = await pool.query(`
        SELECT
          suggestions.*,
          submitted_by_user.first_name AS submitted_by_first_name,
          submitted_by_user.surname AS submitted_by_surname,
          updated_by_user.first_name AS updated_by_first_name,
          updated_by_user.surname AS updated_by_surname
        FROM suggestions
        LEFT JOIN users AS submitted_by_user
          ON submitted_by_user.username = suggestions.submitted_by_username
        LEFT JOIN users AS updated_by_user
          ON updated_by_user.username = suggestions.updated_by_username
        ORDER BY
          CASE suggestions.status
            WHEN 'new' THEN 0
            WHEN 'reviewing' THEN 1
            WHEN 'implemented' THEN 2
            WHEN 'declined' THEN 3
            ELSE 4
          END ASC,
          suggestions.created_at_date DESC,
          suggestions.created_at_time DESC,
          suggestions.id DESC
      `);

      return result.rows.map(normalizeSuggestionRow);
    },
    async listSuggestionsByUsername(username) {
      const result = await pool.query(
        `
          SELECT
            suggestions.*,
            submitted_by_user.first_name AS submitted_by_first_name,
            submitted_by_user.surname AS submitted_by_surname,
            updated_by_user.first_name AS updated_by_first_name,
            updated_by_user.surname AS updated_by_surname
          FROM suggestions
          LEFT JOIN users AS submitted_by_user
            ON submitted_by_user.username = suggestions.submitted_by_username
          LEFT JOIN users AS updated_by_user
            ON updated_by_user.username = suggestions.updated_by_username
          WHERE suggestions.submitted_by_username = $1
          ORDER BY
            suggestions.created_at_date DESC,
            suggestions.created_at_time DESC,
            suggestions.id DESC
        `,
        [username],
      );

      return result.rows.map(normalizeSuggestionRow);
    },
    async updateSuggestionStatus(id, payload) {
      await pool.query(
        `
          UPDATE suggestions
          SET
            status = $1,
            resolution_note = $2,
            updated_at_date = $3,
            updated_at_time = $4,
            updated_by_username = $5
          WHERE id = $6
        `,
        [
          ALLOWED_SUGGESTION_STATUSES.has(payload.status) ? payload.status : "new",
          payload.resolutionNote ?? "",
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
          id,
        ],
      );

      return this.findSuggestionById(id);
    },
  };
}

export function createSuggestionGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresSuggestionGateway(options);
  }

  return createSqliteSuggestionGateway(options.db);
}
