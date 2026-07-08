import { getDefaultRangeRulesContent } from "../../../shared/rangeRulesDefaults.js";

function safeParseJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRuleList(value) {
  return (safeParseJsonArray(value) ?? [])
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeLaneRules(value) {
  return (safeParseJsonArray(value) ?? [])
    .map((entry) => ({
      target: typeof entry?.target === "string"
        ? entry.target.trim()
        : typeof entry?.lanes === "string"
          ? entry.lanes.trim()
          : "",
      recurve: typeof entry?.recurve === "string"
        ? entry.recurve.trim()
        : typeof entry?.distance === "string"
          ? entry.distance.trim()
          : "",
      compound: typeof entry?.compound === "string" ? entry.compound.trim() : "",
      longbow: typeof entry?.longbow === "string"
        ? entry.longbow.trim()
        : typeof entry?.distance === "string"
          ? entry.distance.trim()
          : "",
      barebow: typeof entry?.barebow === "string"
        ? entry.barebow.trim()
        : typeof entry?.distance === "string"
          ? entry.distance.trim()
          : "",
    }))
    .filter((entry) =>
      entry.target &&
      entry.recurve &&
      entry.compound &&
      entry.longbow &&
      entry.barebow,
    );
}

function buildRangeRulesResponse(row) {
  const defaults = getDefaultRangeRulesContent();

  if (!row) {
    return {
      ...defaults,
      updatedAtDate: "",
      updatedAtTime: "",
      updatedByUsername: "",
    };
  }

  return {
    indoorRules: normalizeRuleList(row.indoor_rules_json).length
      ? normalizeRuleList(row.indoor_rules_json)
      : defaults.indoorRules,
    outdoorRules: normalizeRuleList(row.outdoor_rules_json).length
      ? normalizeRuleList(row.outdoor_rules_json)
      : defaults.outdoorRules,
    outdoorLaneRules: normalizeLaneRules(row.outdoor_lane_rules_json).length
      ? normalizeLaneRules(row.outdoor_lane_rules_json)
      : defaults.outdoorLaneRules,
    updatedAtDate: row.updated_at_date ?? "",
    updatedAtTime: row.updated_at_time ?? "",
    updatedByUsername: row.updated_by_username ?? "",
  };
}

function createSqliteRangeRulesGateway(db) {
  const findRangeRules = db.prepare(`
    SELECT
      content_key,
      indoor_rules_json,
      outdoor_rules_json,
      outdoor_lane_rules_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    FROM range_rules_content
    WHERE content_key = 'default'
  `);

  const upsertRangeRules = db.prepare(`
    INSERT INTO range_rules_content (
      content_key,
      indoor_rules_json,
      outdoor_rules_json,
      outdoor_lane_rules_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_key) DO UPDATE SET
      indoor_rules_json = excluded.indoor_rules_json,
      outdoor_rules_json = excluded.outdoor_rules_json,
      outdoor_lane_rules_json = excluded.outdoor_lane_rules_json,
      updated_at_date = excluded.updated_at_date,
      updated_at_time = excluded.updated_at_time,
      updated_by_username = excluded.updated_by_username
  `);

  return {
    async getRangeRules() {
      return buildRangeRulesResponse(findRangeRules.get());
    },
    async updateRangeRules(payload) {
      upsertRangeRules.run(
        "default",
        JSON.stringify(payload.indoorRules),
        JSON.stringify(payload.outdoorRules),
        JSON.stringify(payload.outdoorLaneRules),
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
      );

      return buildRangeRulesResponse(findRangeRules.get());
    },
  };
}

function createPostgresRangeRulesGateway(pool) {
  return {
    async getRangeRules() {
      const result = await pool.query(
        `
          SELECT
            content_key,
            indoor_rules_json,
            outdoor_rules_json,
            outdoor_lane_rules_json,
            updated_at_date,
            updated_at_time,
            updated_by_username
          FROM range_rules_content
          WHERE content_key = 'default'
        `,
      );

      return buildRangeRulesResponse(result.rows[0] ?? null);
    },
    async updateRangeRules(payload) {
      const result = await pool.query(
        `
          INSERT INTO range_rules_content (
            content_key,
            indoor_rules_json,
            outdoor_rules_json,
            outdoor_lane_rules_json,
            updated_at_date,
            updated_at_time,
            updated_by_username
          )
          VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7)
          ON CONFLICT(content_key) DO UPDATE SET
            indoor_rules_json = EXCLUDED.indoor_rules_json,
            outdoor_rules_json = EXCLUDED.outdoor_rules_json,
            outdoor_lane_rules_json = EXCLUDED.outdoor_lane_rules_json,
            updated_at_date = EXCLUDED.updated_at_date,
            updated_at_time = EXCLUDED.updated_at_time,
            updated_by_username = EXCLUDED.updated_by_username
          RETURNING
            content_key,
            indoor_rules_json,
            outdoor_rules_json,
            outdoor_lane_rules_json,
            updated_at_date,
            updated_at_time,
            updated_by_username
        `,
        [
          "default",
          JSON.stringify(payload.indoorRules),
          JSON.stringify(payload.outdoorRules),
          JSON.stringify(payload.outdoorLaneRules),
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
        ],
      );

      return buildRangeRulesResponse(result.rows[0] ?? null);
    },
  };
}

export function createRangeRulesGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresRangeRulesGateway(pool);
  }

  return createSqliteRangeRulesGateway(db);
}
