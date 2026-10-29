// SQLite cannot drop a NOT NULL constraint in place. Rebuild this one table once,
// preserving the composite key, existing rows, and both user foreign keys.
export function migrateSqliteExternalDistanceSigners(db) {
  const signer = db.prepare("PRAGMA table_info(member_distance_sign_offs)").all()
    .find((column) => column.name === "signed_off_by_username");
  if (!signer?.notnull) return;

  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE member_distance_sign_offs_new (
      username TEXT NOT NULL,
      discipline TEXT NOT NULL CHECK (discipline IN ('Long Bow', 'Bare Bow', 'Recurve Bow', 'Compound Bow')),
      distance_yards INTEGER NOT NULL CHECK (distance_yards IN (20, 30, 40, 50, 60, 80, 100)),
      signed_off_by_username TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      signed_off_at_date TEXT NOT NULL,
      signed_off_at_time TEXT NOT NULL,
      PRIMARY KEY (username, discipline, distance_yards),
      FOREIGN KEY (username) REFERENCES users(username),
      FOREIGN KEY (signed_off_by_username) REFERENCES users(username)
    );
    INSERT INTO member_distance_sign_offs_new
      (username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time)
    SELECT username, discipline, distance_yards, signed_off_by_username, source, signed_off_at_date, signed_off_at_time
    FROM member_distance_sign_offs;
    DROP TABLE member_distance_sign_offs;
    ALTER TABLE member_distance_sign_offs_new RENAME TO member_distance_sign_offs;
    COMMIT;
    `);
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.pragma("foreign_keys = ON");
  }
  if (db.prepare("PRAGMA foreign_key_check(member_distance_sign_offs)").all().length) {
    throw new Error("Distance sign-off SQLite migration failed foreign-key validation.");
  }
}
