import { getDefaultGeneralInfoContent } from "../../../shared/generalInfoDefaults.js";

function safeParseJsonArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeList(value) {
  return (safeParseJsonArray(value) ?? [])
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildGeneralInfoResponse(row) {
  const defaults = getDefaultGeneralInfoContent();

  if (!row) {
    return defaults;
  }

  return {
    introParagraphs: normalizeList(row.intro_paragraphs_json).length
      ? normalizeList(row.intro_paragraphs_json)
      : defaults.introParagraphs,
    quickFacts: normalizeList(row.quick_facts_json).length
      ? normalizeList(row.quick_facts_json)
      : defaults.quickFacts,
    facilities: normalizeList(row.facilities_json).length
      ? normalizeList(row.facilities_json)
      : defaults.facilities,
    beginners: normalizeList(row.beginners_json).length
      ? normalizeList(row.beginners_json)
      : defaults.beginners,
    clubLife: normalizeList(row.club_life_json).length
      ? normalizeList(row.club_life_json)
      : defaults.clubLife,
    updatedAtDate: row.updated_at_date ?? "",
    updatedAtTime: row.updated_at_time ?? "",
    updatedByUsername: row.updated_by_username ?? "",
  };
}

function createSqliteGeneralInfoGateway(db) {
  const findGeneralInfo = db.prepare(`
    SELECT
      content_key,
      intro_paragraphs_json,
      quick_facts_json,
      facilities_json,
      beginners_json,
      club_life_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    FROM general_info_content
    WHERE content_key = 'default'
  `);

  const upsertGeneralInfo = db.prepare(`
    INSERT INTO general_info_content (
      content_key,
      intro_paragraphs_json,
      quick_facts_json,
      facilities_json,
      beginners_json,
      club_life_json,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(content_key) DO UPDATE SET
      intro_paragraphs_json = excluded.intro_paragraphs_json,
      quick_facts_json = excluded.quick_facts_json,
      facilities_json = excluded.facilities_json,
      beginners_json = excluded.beginners_json,
      club_life_json = excluded.club_life_json,
      updated_at_date = excluded.updated_at_date,
      updated_at_time = excluded.updated_at_time,
      updated_by_username = excluded.updated_by_username
  `);

  return {
    async getGeneralInfo() {
      return buildGeneralInfoResponse(findGeneralInfo.get());
    },
    async updateGeneralInfo(payload) {
      upsertGeneralInfo.run(
        "default",
        JSON.stringify(payload.introParagraphs),
        JSON.stringify(payload.quickFacts),
        JSON.stringify(payload.facilities),
        JSON.stringify(payload.beginners),
        JSON.stringify(payload.clubLife),
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
      );

      return buildGeneralInfoResponse(findGeneralInfo.get());
    },
  };
}

function createPostgresGeneralInfoGateway(pool) {
  return {
    async getGeneralInfo() {
      const result = await pool.query(`
        SELECT
          content_key,
          intro_paragraphs_json,
          quick_facts_json,
          facilities_json,
          beginners_json,
          club_life_json,
          updated_at_date,
          updated_at_time,
          updated_by_username
        FROM general_info_content
        WHERE content_key = 'default'
      `);

      return buildGeneralInfoResponse(result.rows[0] ?? null);
    },
    async updateGeneralInfo(payload) {
      const result = await pool.query(
        `
          INSERT INTO general_info_content (
            content_key,
            intro_paragraphs_json,
            quick_facts_json,
            facilities_json,
            beginners_json,
            club_life_json,
            updated_at_date,
            updated_at_time,
            updated_by_username
          )
          VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)
          ON CONFLICT(content_key) DO UPDATE SET
            intro_paragraphs_json = EXCLUDED.intro_paragraphs_json,
            quick_facts_json = EXCLUDED.quick_facts_json,
            facilities_json = EXCLUDED.facilities_json,
            beginners_json = EXCLUDED.beginners_json,
            club_life_json = EXCLUDED.club_life_json,
            updated_at_date = EXCLUDED.updated_at_date,
            updated_at_time = EXCLUDED.updated_at_time,
            updated_by_username = EXCLUDED.updated_by_username
          RETURNING
            content_key,
            intro_paragraphs_json,
            quick_facts_json,
            facilities_json,
            beginners_json,
            club_life_json,
            updated_at_date,
            updated_at_time,
            updated_by_username
        `,
        [
          "default",
          JSON.stringify(payload.introParagraphs),
          JSON.stringify(payload.quickFacts),
          JSON.stringify(payload.facilities),
          JSON.stringify(payload.beginners),
          JSON.stringify(payload.clubLife),
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
        ],
      );

      return buildGeneralInfoResponse(result.rows[0] ?? null);
    },
  };
}

export function createGeneralInfoGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresGeneralInfoGateway(pool);
  }

  return createSqliteGeneralInfoGateway(db);
}
