function normalizeAward252SignOffDates(value) {
  let parsedValue = value;

  if (typeof value === "string") {
    if (!value.trim()) {
      return ["", "", ""];
    }

    try {
      parsedValue = JSON.parse(value);
    } catch {
      return ["", "", ""];
    }
  }

  if (!Array.isArray(parsedValue)) {
    return ["", "", ""];
  }

  const normalizedDates = parsedValue.slice(0, 3).map((entry) =>
    typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry) ? entry : "",
  );

  while (normalizedDates.length < 3) {
    normalizedDates.push("");
  }

  return normalizedDates;
}

function normalizeOutdoorTableRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    seasonYear: Number(row.season_year),
    archerUsername: row.archer_username,
    archerFirstName: row.archer_first_name ?? "",
    archerSurname: row.archer_surname ?? "",
    archerName: [row.archer_first_name, row.archer_surname].filter(Boolean).join(" "),
    bowType: row.bow_type,
    handicap:
      row.handicap === null || row.handicap === undefined ? null : Number(row.handicap),
    archer3rd: Boolean(row.archer_3rd),
    archer2nd: Boolean(row.archer_2nd),
    archer1st: Boolean(row.archer_1st),
    bowman3rd: Boolean(row.bowman_3rd),
    bowman2nd: Boolean(row.bowman_2nd),
    bowman1st: Boolean(row.bowman_1st),
    masterBowman: Boolean(row.master_bowman),
    grandMasterBowman: Boolean(row.grand_master_bowman),
    eliteMasterBowman: Boolean(row.elite_master_bowman),
    archer3rdDate: row.archer_3rd_date ?? "",
    archer2ndDate: row.archer_2nd_date ?? "",
    archer1stDate: row.archer_1st_date ?? "",
    bowman3rdDate: row.bowman_3rd_date ?? "",
    bowman2ndDate: row.bowman_2nd_date ?? "",
    bowman1stDate: row.bowman_1st_date ?? "",
    masterBowmanDate: row.master_bowman_date ?? "",
    grandMasterBowmanDate: row.grand_master_bowman_date ?? "",
    eliteMasterBowmanDate: row.elite_master_bowman_date ?? "",
    award25220: Boolean(row.award_252_20),
    award25230: Boolean(row.award_252_30),
    award25240: Boolean(row.award_252_40),
    award25250: Boolean(row.award_252_50),
    award25260: Boolean(row.award_252_60),
    award25280: Boolean(row.award_252_80),
    award252100: Boolean(row.award_252_100),
    award25220SignOffDates: normalizeAward252SignOffDates(row.award_252_20_sign_off_dates),
    award25230SignOffDates: normalizeAward252SignOffDates(row.award_252_30_sign_off_dates),
    award25240SignOffDates: normalizeAward252SignOffDates(row.award_252_40_sign_off_dates),
    award25250SignOffDates: normalizeAward252SignOffDates(row.award_252_50_sign_off_dates),
    award25260SignOffDates: normalizeAward252SignOffDates(row.award_252_60_sign_off_dates),
    award25280SignOffDates: normalizeAward252SignOffDates(row.award_252_80_sign_off_dates),
    award252100SignOffDates: normalizeAward252SignOffDates(row.award_252_100_sign_off_dates),
    cloutWhite20: Boolean(row.clout_white_20),
    cloutWhite30: Boolean(row.clout_white_30),
    cloutWhite40: Boolean(row.clout_white_40),
    cloutWhite50: Boolean(row.clout_white_50),
    cloutWhite60: Boolean(row.clout_white_60),
    cloutWhite7080: Boolean(row.clout_white_70_80),
    cloutWhite90100: Boolean(row.clout_white_90_100),
    createdAtDate: row.created_at_date,
    createdAtTime: row.created_at_time,
    updatedAtDate: row.updated_at_date ?? "",
    updatedAtTime: row.updated_at_time ?? "",
    updatedByUsername: row.updated_by_username ?? "",
  };
}

function createSqliteOutdoorTableGateway(db) {
  const selectColumns = `
    outdoor_table_entries.*,
    users.first_name AS archer_first_name,
    users.surname AS archer_surname
  `;
  const listEntriesByYearStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM outdoor_table_entries
    INNER JOIN users ON users.username = outdoor_table_entries.archer_username
    WHERE outdoor_table_entries.season_year = ?
    ORDER BY users.surname COLLATE NOCASE ASC, users.first_name COLLATE NOCASE ASC, outdoor_table_entries.bow_type COLLATE NOCASE ASC
  `);
  const listAvailableYearsStatement = db.prepare(`
    SELECT DISTINCT season_year
    FROM outdoor_table_entries
    ORDER BY season_year DESC
  `);
  const findByIdStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM outdoor_table_entries
    INNER JOIN users ON users.username = outdoor_table_entries.archer_username
    WHERE outdoor_table_entries.id = ?
    LIMIT 1
  `);
  const findDuplicateStatement = db.prepare(`
    SELECT
      ${selectColumns}
    FROM outdoor_table_entries
    INNER JOIN users ON users.username = outdoor_table_entries.archer_username
    WHERE outdoor_table_entries.season_year = ?
      AND LOWER(outdoor_table_entries.archer_username) = LOWER(?)
      AND LOWER(outdoor_table_entries.bow_type) = LOWER(?)
      AND outdoor_table_entries.id != COALESCE(?, -1)
    LIMIT 1
  `);
  const createStatement = db.prepare(`
    INSERT INTO outdoor_table_entries (
      season_year,
      archer_username,
      bow_type,
      handicap,
      archer_3rd,
      archer_2nd,
      archer_1st,
      bowman_3rd,
      bowman_2nd,
      bowman_1st,
      master_bowman,
      grand_master_bowman,
      elite_master_bowman,
      archer_3rd_date,
      archer_2nd_date,
      archer_1st_date,
      bowman_3rd_date,
      bowman_2nd_date,
      bowman_1st_date,
      master_bowman_date,
      grand_master_bowman_date,
      elite_master_bowman_date,
      award_252_20,
      award_252_30,
      award_252_40,
      award_252_50,
      award_252_60,
      award_252_80,
      award_252_100,
      award_252_20_sign_off_dates,
      award_252_30_sign_off_dates,
      award_252_40_sign_off_dates,
      award_252_50_sign_off_dates,
      award_252_60_sign_off_dates,
      award_252_80_sign_off_dates,
      award_252_100_sign_off_dates,
      clout_white_20,
      clout_white_30,
      clout_white_40,
      clout_white_50,
      clout_white_60,
      clout_white_70_80,
      clout_white_90_100,
      created_at_date,
      created_at_time,
      updated_at_date,
      updated_at_time,
      updated_by_username
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStatement = db.prepare(`
    UPDATE outdoor_table_entries
    SET
      season_year = ?,
      archer_username = ?,
      bow_type = ?,
      handicap = ?,
      archer_3rd = ?,
      archer_2nd = ?,
      archer_1st = ?,
      bowman_3rd = ?,
      bowman_2nd = ?,
      bowman_1st = ?,
      master_bowman = ?,
      grand_master_bowman = ?,
      elite_master_bowman = ?,
      archer_3rd_date = ?,
      archer_2nd_date = ?,
      archer_1st_date = ?,
      bowman_3rd_date = ?,
      bowman_2nd_date = ?,
      bowman_1st_date = ?,
      master_bowman_date = ?,
      grand_master_bowman_date = ?,
      elite_master_bowman_date = ?,
      award_252_20 = ?,
      award_252_30 = ?,
      award_252_40 = ?,
      award_252_50 = ?,
      award_252_60 = ?,
      award_252_80 = ?,
      award_252_100 = ?,
      award_252_20_sign_off_dates = ?,
      award_252_30_sign_off_dates = ?,
      award_252_40_sign_off_dates = ?,
      award_252_50_sign_off_dates = ?,
      award_252_60_sign_off_dates = ?,
      award_252_80_sign_off_dates = ?,
      award_252_100_sign_off_dates = ?,
      clout_white_20 = ?,
      clout_white_30 = ?,
      clout_white_40 = ?,
      clout_white_50 = ?,
      clout_white_60 = ?,
      clout_white_70_80 = ?,
      clout_white_90_100 = ?,
      updated_at_date = ?,
      updated_at_time = ?,
      updated_by_username = ?
    WHERE id = ?
  `);
  const deleteStatement = db.prepare(`
    DELETE FROM outdoor_table_entries
    WHERE id = ?
  `);

  function toStatementValues(payload) {
    return [
      payload.seasonYear,
      payload.archerUsername,
      payload.bowType,
      payload.handicap,
      payload.archer3rd ? 1 : 0,
      payload.archer2nd ? 1 : 0,
      payload.archer1st ? 1 : 0,
      payload.bowman3rd ? 1 : 0,
      payload.bowman2nd ? 1 : 0,
      payload.bowman1st ? 1 : 0,
      payload.masterBowman ? 1 : 0,
      payload.grandMasterBowman ? 1 : 0,
      payload.eliteMasterBowman ? 1 : 0,
      payload.archer3rdDate ?? "",
      payload.archer2ndDate ?? "",
      payload.archer1stDate ?? "",
      payload.bowman3rdDate ?? "",
      payload.bowman2ndDate ?? "",
      payload.bowman1stDate ?? "",
      payload.masterBowmanDate ?? "",
      payload.grandMasterBowmanDate ?? "",
      payload.eliteMasterBowmanDate ?? "",
      payload.award25220 ? 1 : 0,
      payload.award25230 ? 1 : 0,
      payload.award25240 ? 1 : 0,
      payload.award25250 ? 1 : 0,
      payload.award25260 ? 1 : 0,
      payload.award25280 ? 1 : 0,
      payload.award252100 ? 1 : 0,
      JSON.stringify(payload.award25220SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25230SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25240SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25250SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25260SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25280SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award252100SignOffDates ?? ["", "", ""]),
      payload.cloutWhite20 ? 1 : 0,
      payload.cloutWhite30 ? 1 : 0,
      payload.cloutWhite40 ? 1 : 0,
      payload.cloutWhite50 ? 1 : 0,
      payload.cloutWhite60 ? 1 : 0,
      payload.cloutWhite7080 ? 1 : 0,
      payload.cloutWhite90100 ? 1 : 0,
    ];
  }

  return {
    async createEntry(payload) {
      const result = createStatement.run(
        ...toStatementValues(payload),
        payload.createdAtDate,
        payload.createdAtTime,
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
      );

      return normalizeOutdoorTableRow(findByIdStatement.get(result.lastInsertRowid));
    },
    async deleteEntry(id) {
      deleteStatement.run(id);
    },
    async findDuplicate({ archerUsername, bowType, excludeId = null, seasonYear }) {
      return normalizeOutdoorTableRow(
        findDuplicateStatement.get(seasonYear, archerUsername, bowType, excludeId),
      );
    },
    async findEntryById(id) {
      return normalizeOutdoorTableRow(findByIdStatement.get(id));
    },
    async listAvailableYears() {
      return listAvailableYearsStatement
        .all()
        .map((row) => Number(row.season_year))
        .filter((seasonYear) => Number.isInteger(seasonYear));
    },
    async listEntriesByYear(seasonYear) {
      return listEntriesByYearStatement
        .all(seasonYear)
        .map(normalizeOutdoorTableRow);
    },
    async updateEntry(payload) {
      updateStatement.run(
        ...toStatementValues(payload),
        payload.updatedAtDate,
        payload.updatedAtTime,
        payload.updatedByUsername,
        payload.id,
      );

      return normalizeOutdoorTableRow(findByIdStatement.get(payload.id));
    },
  };
}

function createPostgresOutdoorTableGateway(pool) {
  const selectColumns = `
    outdoor_table_entries.*,
    users.first_name AS archer_first_name,
    users.surname AS archer_surname
  `;

  function toStatementValues(payload) {
    return [
      payload.seasonYear,
      payload.archerUsername,
      payload.bowType,
      payload.handicap,
      payload.archer3rd,
      payload.archer2nd,
      payload.archer1st,
      payload.bowman3rd,
      payload.bowman2nd,
      payload.bowman1st,
      payload.masterBowman,
      payload.grandMasterBowman,
      payload.eliteMasterBowman,
      payload.archer3rdDate ?? "",
      payload.archer2ndDate ?? "",
      payload.archer1stDate ?? "",
      payload.bowman3rdDate ?? "",
      payload.bowman2ndDate ?? "",
      payload.bowman1stDate ?? "",
      payload.masterBowmanDate ?? "",
      payload.grandMasterBowmanDate ?? "",
      payload.eliteMasterBowmanDate ?? "",
      payload.award25220,
      payload.award25230,
      payload.award25240,
      payload.award25250,
      payload.award25260,
      payload.award25280,
      payload.award252100,
      JSON.stringify(payload.award25220SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25230SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25240SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25250SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25260SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award25280SignOffDates ?? ["", "", ""]),
      JSON.stringify(payload.award252100SignOffDates ?? ["", "", ""]),
      payload.cloutWhite20,
      payload.cloutWhite30,
      payload.cloutWhite40,
      payload.cloutWhite50,
      payload.cloutWhite60,
      payload.cloutWhite7080,
      payload.cloutWhite90100,
    ];
  }

  return {
    async createEntry(payload) {
      const result = await pool.query(
        `
          INSERT INTO outdoor_table_entries (
            season_year,
            archer_username,
            bow_type,
            handicap,
            archer_3rd,
            archer_2nd,
            archer_1st,
            bowman_3rd,
            bowman_2nd,
            bowman_1st,
            master_bowman,
            grand_master_bowman,
            elite_master_bowman,
            archer_3rd_date,
            archer_2nd_date,
            archer_1st_date,
            bowman_3rd_date,
            bowman_2nd_date,
            bowman_1st_date,
            master_bowman_date,
            grand_master_bowman_date,
            elite_master_bowman_date,
            award_252_20,
            award_252_30,
            award_252_40,
            award_252_50,
            award_252_60,
            award_252_80,
            award_252_100,
            award_252_20_sign_off_dates,
            award_252_30_sign_off_dates,
            award_252_40_sign_off_dates,
            award_252_50_sign_off_dates,
            award_252_60_sign_off_dates,
            award_252_80_sign_off_dates,
            award_252_100_sign_off_dates,
            clout_white_20,
            clout_white_30,
            clout_white_40,
            clout_white_50,
            clout_white_60,
            clout_white_70_80,
            clout_white_90_100,
            created_at_date,
            created_at_time,
            updated_at_date,
            updated_at_time,
            updated_by_username
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44,
            $45, $46, $47, $48
          )
          RETURNING id
        `,
        [
          ...toStatementValues(payload),
          payload.createdAtDate,
          payload.createdAtTime,
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
        ],
      );

      return this.findEntryById(result.rows[0]?.id);
    },
    async deleteEntry(id) {
      await pool.query(
        `
          DELETE FROM outdoor_table_entries
          WHERE id = $1
        `,
        [id],
      );
    },
    async findDuplicate({ archerUsername, bowType, excludeId = null, seasonYear }) {
      const result = await pool.query(
        `
          SELECT
            ${selectColumns}
          FROM outdoor_table_entries
          INNER JOIN users ON users.username = outdoor_table_entries.archer_username
          WHERE outdoor_table_entries.season_year = $1
            AND LOWER(outdoor_table_entries.archer_username) = LOWER($2)
            AND LOWER(outdoor_table_entries.bow_type) = LOWER($3)
            AND outdoor_table_entries.id != COALESCE($4, -1)
          LIMIT 1
        `,
        [seasonYear, archerUsername, bowType, excludeId],
      );

      return normalizeOutdoorTableRow(result.rows[0] ?? null);
    },
    async findEntryById(id) {
      const result = await pool.query(
        `
          SELECT
            ${selectColumns}
          FROM outdoor_table_entries
          INNER JOIN users ON users.username = outdoor_table_entries.archer_username
          WHERE outdoor_table_entries.id = $1
          LIMIT 1
        `,
        [id],
      );

      return normalizeOutdoorTableRow(result.rows[0] ?? null);
    },
    async listAvailableYears() {
      const result = await pool.query(`
        SELECT DISTINCT season_year
        FROM outdoor_table_entries
        ORDER BY season_year DESC
      `);

      return result.rows
        .map((row) => Number(row.season_year))
        .filter((seasonYear) => Number.isInteger(seasonYear));
    },
    async listEntriesByYear(seasonYear) {
      const result = await pool.query(
        `
          SELECT
            ${selectColumns}
          FROM outdoor_table_entries
          INNER JOIN users ON users.username = outdoor_table_entries.archer_username
          WHERE outdoor_table_entries.season_year = $1
          ORDER BY users.surname ASC, users.first_name ASC, outdoor_table_entries.bow_type ASC
        `,
        [seasonYear],
      );

      return result.rows.map(normalizeOutdoorTableRow);
    },
    async updateEntry(payload) {
      await pool.query(
        `
          UPDATE outdoor_table_entries
          SET
            season_year = $1,
            archer_username = $2,
            bow_type = $3,
            handicap = $4,
            archer_3rd = $5,
            archer_2nd = $6,
            archer_1st = $7,
            bowman_3rd = $8,
            bowman_2nd = $9,
            bowman_1st = $10,
            master_bowman = $11,
            grand_master_bowman = $12,
            elite_master_bowman = $13,
            archer_3rd_date = $14,
            archer_2nd_date = $15,
            archer_1st_date = $16,
            bowman_3rd_date = $17,
            bowman_2nd_date = $18,
            bowman_1st_date = $19,
            master_bowman_date = $20,
            grand_master_bowman_date = $21,
            elite_master_bowman_date = $22,
            award_252_20 = $23,
            award_252_30 = $24,
            award_252_40 = $25,
            award_252_50 = $26,
            award_252_60 = $27,
            award_252_80 = $28,
            award_252_100 = $29,
            award_252_20_sign_off_dates = $30,
            award_252_30_sign_off_dates = $31,
            award_252_40_sign_off_dates = $32,
            award_252_50_sign_off_dates = $33,
            award_252_60_sign_off_dates = $34,
            award_252_80_sign_off_dates = $35,
            award_252_100_sign_off_dates = $36,
            clout_white_20 = $37,
            clout_white_30 = $38,
            clout_white_40 = $39,
            clout_white_50 = $40,
            clout_white_60 = $41,
            clout_white_70_80 = $42,
            clout_white_90_100 = $43,
            updated_at_date = $44,
            updated_at_time = $45,
            updated_by_username = $46
          WHERE id = $47
        `,
        [
          ...toStatementValues(payload),
          payload.updatedAtDate,
          payload.updatedAtTime,
          payload.updatedByUsername,
          payload.id,
        ],
      );

      return this.findEntryById(payload.id);
    },
  };
}

export function createOutdoorTableGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return createPostgresOutdoorTableGateway(pool);
  }

  return createSqliteOutdoorTableGateway(db);
}
