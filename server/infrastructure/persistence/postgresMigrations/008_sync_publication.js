export const migration = {
  version: "008_sync_publication",
  statements: [
    `CREATE TABLE IF NOT EXISTS sync_publication_state (
      singleton BOOLEAN PRIMARY KEY CHECK (singleton),
      last_cursor BIGINT NOT NULL CHECK (last_cursor >= 0)
    )`,
    `INSERT INTO sync_publication_state (singleton, last_cursor)
     VALUES (true, 0) ON CONFLICT (singleton) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS sync_publication (
      publication_cursor BIGINT PRIMARY KEY CHECK (publication_cursor > 0),
      change_id BIGINT NOT NULL UNIQUE REFERENCES sync_change_log(change_id)
    )`,
  ],
};
