function normalizeQuestionRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id ?? 0),
    member_seen_response: Number(row.member_seen_response ?? 0),
  };
}

function createSqliteMemberQuestionGateway(db) {
  const selectColumns = `
    member_questions.*,
    submitted_by_user.first_name AS submitted_by_first_name,
    submitted_by_user.surname AS submitted_by_surname,
    responded_by_user.first_name AS responded_by_first_name,
    responded_by_user.surname AS responded_by_surname
  `;
  const findQuestionByIdStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM member_questions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = member_questions.submitted_by_username
    LEFT JOIN users AS responded_by_user
      ON responded_by_user.username = member_questions.responded_by_username
    WHERE member_questions.id = ?
    LIMIT 1
  `);
  const listQuestionsStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM member_questions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = member_questions.submitted_by_username
    LEFT JOIN users AS responded_by_user
      ON responded_by_user.username = member_questions.responded_by_username
    ORDER BY
      CASE member_questions.status
        WHEN 'new' THEN 0
        WHEN 'answered' THEN 1
        ELSE 2
      END ASC,
      member_questions.created_at_date DESC,
      member_questions.created_at_time DESC,
      member_questions.id DESC
  `);
  const listQuestionsByUsernameStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM member_questions
    LEFT JOIN users AS submitted_by_user
      ON submitted_by_user.username = member_questions.submitted_by_username
    LEFT JOIN users AS responded_by_user
      ON responded_by_user.username = member_questions.responded_by_username
    WHERE member_questions.submitted_by_username = ?
    ORDER BY
      member_questions.created_at_date DESC,
      member_questions.created_at_time DESC,
      member_questions.id DESC
  `);
  const createQuestionStatement = db.prepare(`
    INSERT INTO member_questions (
      submitted_by_username,
      question_title,
      question_body,
      status,
      response_text,
      member_seen_response,
      created_at_date,
      created_at_time
    )
    VALUES (?, ?, ?, 'new', '', 1, ?, ?)
  `);
  const respondToQuestionStatement = db.prepare(`
    UPDATE member_questions
    SET
      status = 'answered',
      response_text = ?,
      member_seen_response = 0,
      responded_at_date = ?,
      responded_at_time = ?,
      responded_by_username = ?,
      updated_at_date = ?,
      updated_at_time = ?
    WHERE id = ?
  `);
  const markResponseSeenStatement = db.prepare(`
    UPDATE member_questions
    SET
      member_seen_response = 1
    WHERE id = ?
  `);

  return {
    async createQuestion(payload) {
      const result = createQuestionStatement.run(
        payload.submittedByUsername,
        payload.questionTitle,
        payload.questionBody,
        payload.createdAtDate,
        payload.createdAtTime,
      );

      return normalizeQuestionRow(findQuestionByIdStatement.get(result.lastInsertRowid));
    },
    async findQuestionById(id) {
      return normalizeQuestionRow(findQuestionByIdStatement.get(id));
    },
    async listQuestions() {
      return listQuestionsStatement.all().map(normalizeQuestionRow);
    },
    async listQuestionsByUsername(username) {
      return listQuestionsByUsernameStatement.all(username).map(normalizeQuestionRow);
    },
    async markResponseSeen(id) {
      markResponseSeenStatement.run(id);
      return normalizeQuestionRow(findQuestionByIdStatement.get(id));
    },
    async respondToQuestion(id, payload) {
      respondToQuestionStatement.run(
        payload.responseText,
        payload.respondedAtDate,
        payload.respondedAtTime,
        payload.respondedByUsername,
        payload.updatedAtDate,
        payload.updatedAtTime,
        id,
      );

      return normalizeQuestionRow(findQuestionByIdStatement.get(id));
    },
  };
}

function createPostgresMemberQuestionGateway({ pool }) {
  return {
    async createQuestion(payload) {
      const result = await pool.query(
        `
          INSERT INTO member_questions (
            submitted_by_username,
            question_title,
            question_body,
            status,
            response_text,
            member_seen_response,
            created_at_date,
            created_at_time,
            submitted_by_user_id
          )
          VALUES (
            $1,
            $2,
            $3,
            'new',
            '',
            TRUE,
            $4,
            $5,
            (SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1)
          )
          RETURNING id
        `,
        [
          payload.submittedByUsername,
          payload.questionTitle,
          payload.questionBody,
          payload.createdAtDate,
          payload.createdAtTime,
        ],
      );

      return this.findQuestionById(result.rows[0]?.id);
    },
    async findQuestionById(id) {
      const result = await pool.query(
        `
          SELECT
            member_questions.*,
            submitted_by_user.first_name AS submitted_by_first_name,
            submitted_by_user.surname AS submitted_by_surname,
            responded_by_user.first_name AS responded_by_first_name,
            responded_by_user.surname AS responded_by_surname
          FROM member_questions
          LEFT JOIN users AS submitted_by_user
            ON submitted_by_user.username = member_questions.submitted_by_username
          LEFT JOIN users AS responded_by_user
            ON responded_by_user.username = member_questions.responded_by_username
          WHERE member_questions.id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeQuestionRow(result.rows[0] ?? null);
    },
    async listQuestions() {
      const result = await pool.query(`
        SELECT
          member_questions.*,
          submitted_by_user.first_name AS submitted_by_first_name,
          submitted_by_user.surname AS submitted_by_surname,
          responded_by_user.first_name AS responded_by_first_name,
          responded_by_user.surname AS responded_by_surname
        FROM member_questions
        LEFT JOIN users AS submitted_by_user
          ON submitted_by_user.username = member_questions.submitted_by_username
        LEFT JOIN users AS responded_by_user
          ON responded_by_user.username = member_questions.responded_by_username
        ORDER BY
          CASE member_questions.status
            WHEN 'new' THEN 0
            WHEN 'answered' THEN 1
            ELSE 2
          END ASC,
          member_questions.created_at_date DESC,
          member_questions.created_at_time DESC,
          member_questions.id DESC
      `);

      return result.rows.map(normalizeQuestionRow);
    },
    async listQuestionsByUsername(username) {
      const result = await pool.query(
        `
          SELECT
            member_questions.*,
            submitted_by_user.first_name AS submitted_by_first_name,
            submitted_by_user.surname AS submitted_by_surname,
            responded_by_user.first_name AS responded_by_first_name,
            responded_by_user.surname AS responded_by_surname
          FROM member_questions
          LEFT JOIN users AS submitted_by_user
            ON submitted_by_user.username = member_questions.submitted_by_username
          LEFT JOIN users AS responded_by_user
            ON responded_by_user.username = member_questions.responded_by_username
          WHERE member_questions.submitted_by_username = $1
          ORDER BY
            member_questions.created_at_date DESC,
            member_questions.created_at_time DESC,
            member_questions.id DESC
        `,
        [username],
      );

      return result.rows.map(normalizeQuestionRow);
    },
    async markResponseSeen(id) {
      await pool.query(
        `
          UPDATE member_questions
          SET
            member_seen_response = TRUE
          WHERE id = $1
        `,
        [id],
      );

      return this.findQuestionById(id);
    },
    async respondToQuestion(id, payload) {
      await pool.query(
        `
          UPDATE member_questions
          SET
            status = 'answered',
            response_text = $1,
            member_seen_response = FALSE,
            responded_at_date = $2,
            responded_at_time = $3,
            responded_by_username = $4,
            updated_at_date = $5,
            updated_at_time = $6,
            responded_by_user_id = (SELECT id FROM users WHERE LOWER(username) = LOWER($4) LIMIT 1)
          WHERE id = $7
        `,
        [
          payload.responseText,
          payload.respondedAtDate,
          payload.respondedAtTime,
          payload.respondedByUsername,
          payload.updatedAtDate,
          payload.updatedAtTime,
          id,
        ],
      );

      return this.findQuestionById(id);
    },
  };
}

export function createMemberQuestionGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresMemberQuestionGateway(options);
  }

  return createSqliteMemberQuestionGateway(options.db);
}
