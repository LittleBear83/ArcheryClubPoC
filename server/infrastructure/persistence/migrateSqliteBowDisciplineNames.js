const rename = (value) => `CASE ${value}
  WHEN 'Bare Bow' THEN 'Barebow'
  WHEN 'Long Bow' THEN 'Longbow'
  ELSE ${value} END`;

export function migrateSqliteBowDisciplineNames(db) {
  const tables = ["user_disciplines", "member_distance_sign_offs"];
  const rebuild = tables.filter((table) => {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql;
    return schema && (schema.includes("'Bare Bow'") || schema.includes("'Long Bow'"));
  });

  db.pragma("foreign_keys = OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    for (const table of rebuild) {
      const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
      const dependents = db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL").all(table);
      const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(({ name }) => `"${name}"`);
      const newTable = `${table}_new_bow_names`;
      const newSchema = schema.replace(table, newTable)
        .replaceAll("'Bare Bow'", "'Barebow'")
        .replaceAll("'Long Bow'", "'Longbow'");
      db.exec(newSchema);
      db.exec(`INSERT OR IGNORE INTO ${newTable} (${columns.join(", ")})
        SELECT ${columns.map((column) => column === '"discipline"' ? rename(column) : column).join(", ")}
        FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${newTable} RENAME TO ${table}`);
      for (const { sql } of dependents) db.exec(sql);
    }
    for (const column of ["left_handicap_discipline", "right_handicap_discipline"]) {
      db.exec(`UPDATE tournament_matches SET ${column} = ${rename(column)}
        WHERE ${column} IN ('Bare Bow', 'Long Bow')`);
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.pragma("foreign_keys = ON");
  }
  if (db.pragma("foreign_key_check").length) {
    throw new Error("Bow discipline SQLite migration failed foreign-key validation.");
  }
}
