function safeParseMetadataJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      raw: String(value),
    };
  }
}

function normalizeAuditEventRow(row) {
  return {
    id: row.id,
    actorUsername: row.actor_username ?? "",
    action: row.action ?? "",
    target: row.target ?? "",
    statusCode: Number(row.status_code ?? 0),
    ipAddress: row.ip_address ?? "",
    userAgent: row.user_agent ?? "",
    metadata: safeParseMetadataJson(row.metadata_json),
    createdAtDate: row.created_at_date ?? "",
    createdAtTime: row.created_at_time ?? "",
  };
}

function normalizeSortBy(value) {
  return ["action", "actorUsername", "createdAt", "statusCode", "target"].includes(value)
    ? value
    : "createdAt";
}

function normalizeSortDirection(value) {
  return value === "asc" ? "asc" : "desc";
}

function buildSqlOrderBy(sortBy, sortDirection) {
  const direction = sortDirection === "asc" ? "ASC" : "DESC";

  switch (sortBy) {
    case "actorUsername":
      return `actor_username ${direction}, created_at_date DESC, created_at_time DESC`;
    case "action":
      return `action ${direction}, created_at_date DESC, created_at_time DESC`;
    case "statusCode":
      return `status_code ${direction}, created_at_date DESC, created_at_time DESC`;
    case "target":
      return `target ${direction}, created_at_date DESC, created_at_time DESC`;
    default:
      return `created_at_date ${direction}, created_at_time ${direction}`;
  }
}

function buildFilters(filters, options = {}) {
  const {
    actorUsername = "",
    action = "",
    dateFrom = "",
    dateTo = "",
    statusCode = null,
    target = "",
  } = filters;
  const whereClauses = [];
  const values = [];
  const usePostgresPlaceholders = options.placeholderStyle === "postgres";
  const addValue = (value) => {
    values.push(value);
    return usePostgresPlaceholders ? `$${values.length}` : "?";
  };

  if (actorUsername) {
    const placeholder = addValue(`%${actorUsername.toLowerCase()}%`);
    whereClauses.push(`LOWER(COALESCE(actor_username, '')) LIKE ${placeholder}`);
  }

  if (action) {
    const placeholder = addValue(`%${action.toLowerCase()}%`);
    whereClauses.push(`LOWER(action) LIKE ${placeholder}`);
  }

  if (target) {
    const placeholder = addValue(`%${target.toLowerCase()}%`);
    whereClauses.push(`LOWER(target) LIKE ${placeholder}`);
  }

  if (Number.isInteger(statusCode)) {
    const placeholder = addValue(statusCode);
    whereClauses.push(`status_code = ${placeholder}`);
  }

  if (dateFrom) {
    const placeholder = addValue(dateFrom);
    whereClauses.push(`created_at_date >= ${placeholder}`);
  }

  if (dateTo) {
    const placeholder = addValue(dateTo);
    whereClauses.push(`created_at_date <= ${placeholder}`);
  }

  return {
    values,
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
  };
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 250;
  }

  return Math.min(parsed, 500);
}

function createSqliteAuditLogGateway(db) {
  return {
    async listAuditEvents(filters = {}) {
      const sortBy = normalizeSortBy(filters.sortBy);
      const sortDirection = normalizeSortDirection(filters.sortDirection);
      const limit = normalizeLimit(filters.limit);
      const { values, whereSql } = buildFilters(filters);
      const rows = db.prepare(`
        SELECT
          id,
          actor_username,
          action,
          target,
          status_code,
          ip_address,
          user_agent,
          metadata_json,
          created_at_date,
          created_at_time
        FROM audit_events
        ${whereSql}
        ORDER BY ${buildSqlOrderBy(sortBy, sortDirection)}
        LIMIT ?
      `).all(...values, limit);

      return rows.map(normalizeAuditEventRow);
    },
  };
}

function createPostgresAuditLogGateway(pool) {
  return {
    async listAuditEvents(filters = {}) {
      const sortBy = normalizeSortBy(filters.sortBy);
      const sortDirection = normalizeSortDirection(filters.sortDirection);
      const limit = normalizeLimit(filters.limit);
      const { values, whereSql } = buildFilters(filters, {
        placeholderStyle: "postgres",
      });
      const limitPlaceholder = `$${values.length + 1}`;
      const result = await pool.query(
        `
          SELECT
            id,
            actor_username,
            action,
            target,
            status_code,
            ip_address,
            user_agent,
            metadata_json,
            created_at_date,
            created_at_time
          FROM audit_events
          ${whereSql}
          ORDER BY ${buildSqlOrderBy(sortBy, sortDirection)}
          LIMIT ${limitPlaceholder}
        `,
        [...values, limit],
      );

      return result.rows.map(normalizeAuditEventRow);
    },
  };
}

export function createAuditLogGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresAuditLogGateway(pool);
  }

  return createSqliteAuditLogGateway(db);
}
