function normalize(row) {
  if (!row) return null;
  const parse = (value) => typeof value === "string" ? JSON.parse(value) : (value ?? {});
  return {
    id: row.id,
    seasonYear: row.season_year,
    archerUsername: row.archer_username,
    archerFirstName: row.first_name ?? "",
    archerSurname: row.surname ?? "",
    archerName: [row.first_name, row.surname].filter(Boolean).join(" "),
    bowType: row.bow_type,
    handicap: row.handicap,
    classifications: parse(row.classifications_json),
    scores: parse(row.scores_json),
    createdAtDate: row.created_at_date,
    createdAtTime: row.created_at_time,
    updatedAtDate: row.updated_at_date,
    updatedAtTime: row.updated_at_time,
    updatedByUsername: row.updated_by_username,
  };
}

const select = `SELECT indoor_table_entries.*, users.first_name, users.surname
  FROM indoor_table_entries JOIN users ON users.username = indoor_table_entries.archer_username`;

export function createIndoorTableGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return {
      async listEntriesByYear(year) {
        const result = await pool.query(`${select} WHERE season_year = $1 ORDER BY users.surname, users.first_name, bow_type`, [year]);
        return result.rows.map(normalize);
      },
      async listAvailableYears() {
        const result = await pool.query("SELECT DISTINCT season_year FROM indoor_table_entries ORDER BY season_year DESC");
        return result.rows.map((row) => row.season_year);
      },
      async findEntryById(id) {
        return normalize((await pool.query(`${select} WHERE indoor_table_entries.id = $1`, [id])).rows[0]);
      },
      async findDuplicate({ seasonYear, archerUsername, bowType, excludeId = -1 }) {
        return normalize((await pool.query(`${select} WHERE season_year = $1 AND LOWER(archer_username) = LOWER($2) AND LOWER(bow_type) = LOWER($3) AND indoor_table_entries.id != $4`, [seasonYear, archerUsername, bowType, excludeId])).rows[0]);
      },
      async createEntry(entry) {
        const result = await pool.query(`INSERT INTO indoor_table_entries (season_year, archer_username, bow_type, handicap, classifications_json, scores_json, created_at_date, created_at_time, updated_at_date, updated_at_time, updated_by_username) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id`, values(entry));
        return this.findEntryById(result.rows[0].id);
      },
      async createEntryIfAbsent(entry) {
        const result = await pool.query(`INSERT INTO indoor_table_entries (season_year, archer_username, bow_type, handicap, classifications_json, scores_json, created_at_date, created_at_time, updated_at_date, updated_at_time, updated_by_username) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11) ON CONFLICT (season_year, archer_username, bow_type) DO NOTHING`, values(entry));
        return result.rowCount > 0;
      },
      async updateEntry(entry) {
        await pool.query(`UPDATE indoor_table_entries SET season_year=$1, archer_username=$2, bow_type=$3, handicap=$4, classifications_json=$5::jsonb, scores_json=$6::jsonb, created_at_date=$7, created_at_time=$8, updated_at_date=$9, updated_at_time=$10, updated_by_username=$11 WHERE id=$12`, [...values(entry), entry.id]);
        return this.findEntryById(entry.id);
      },
      async deleteEntry(id) { await pool.query("DELETE FROM indoor_table_entries WHERE id=$1", [id]); },
    };
  }
  return {
    async listEntriesByYear(year) {
      return db.prepare(`${select} WHERE season_year = ? ORDER BY users.surname COLLATE NOCASE, users.first_name COLLATE NOCASE, bow_type COLLATE NOCASE`).all(year).map(normalize);
    },
    async listAvailableYears() {
      return db.prepare("SELECT DISTINCT season_year FROM indoor_table_entries ORDER BY season_year DESC").all().map((row) => row.season_year);
    },
    async findEntryById(id) { return normalize(db.prepare(`${select} WHERE indoor_table_entries.id = ?`).get(id)); },
    async findDuplicate({ seasonYear, archerUsername, bowType, excludeId = -1 }) {
      return normalize(db.prepare(`${select} WHERE season_year = ? AND LOWER(archer_username) = LOWER(?) AND LOWER(bow_type) = LOWER(?) AND indoor_table_entries.id != ?`).get(seasonYear, archerUsername, bowType, excludeId));
    },
    async createEntry(entry) {
      const result = db.prepare(`INSERT INTO indoor_table_entries (season_year, archer_username, bow_type, handicap, classifications_json, scores_json, created_at_date, created_at_time, updated_at_date, updated_at_time, updated_by_username) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...values(entry));
      return this.findEntryById(Number(result.lastInsertRowid));
    },
    async createEntryIfAbsent(entry) {
      return db.prepare(`INSERT INTO indoor_table_entries (season_year, archer_username, bow_type, handicap, classifications_json, scores_json, created_at_date, created_at_time, updated_at_date, updated_at_time, updated_by_username) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(season_year, archer_username, bow_type) DO NOTHING`).run(...values(entry)).changes > 0;
    },
    async updateEntry(entry) {
      db.prepare(`UPDATE indoor_table_entries SET season_year=?, archer_username=?, bow_type=?, handicap=?, classifications_json=?, scores_json=?, created_at_date=?, created_at_time=?, updated_at_date=?, updated_at_time=?, updated_by_username=? WHERE id=?`).run(...values(entry), entry.id);
      return this.findEntryById(entry.id);
    },
    async deleteEntry(id) { db.prepare("DELETE FROM indoor_table_entries WHERE id=?").run(id); },
  };
}

function values(entry) {
  return [entry.seasonYear, entry.archerUsername, entry.bowType, entry.handicap,
    JSON.stringify(entry.classifications ?? {}), JSON.stringify(entry.scores ?? {}),
    entry.createdAtDate, entry.createdAtTime, entry.updatedAtDate,
    entry.updatedAtTime, entry.updatedByUsername];
}
