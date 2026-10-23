function createSqliteRememberedDeviceGateway(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remembered_devices (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL CHECK (expires_at > created_at)
    );
    CREATE INDEX IF NOT EXISTS remembered_devices_user_id_idx ON remembered_devices (user_id);
    CREATE INDEX IF NOT EXISTS remembered_devices_expires_at_idx ON remembered_devices (expires_at);
    CREATE TRIGGER IF NOT EXISTS users_revoke_remembered_devices
      AFTER UPDATE OF password, active_member ON users
      WHEN OLD.password IS NOT NEW.password OR
           (OLD.active_member = 1 AND NEW.active_member <> 1)
      BEGIN
        DELETE FROM remembered_devices WHERE user_id = NEW.id;
      END;
  `);

  const insert = db.prepare(`INSERT INTO remembered_devices
    (token_hash, user_id, credential_fingerprint, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`);
  const find = db.prepare(`SELECT devices.user_id, devices.credential_fingerprint,
    devices.expires_at, users.username
    FROM remembered_devices AS devices
    JOIN users ON users.id = devices.user_id
    WHERE devices.token_hash = ?`);
  const remove = db.prepare("DELETE FROM remembered_devices WHERE token_hash = ?");
  const cleanup = db.prepare("DELETE FROM remembered_devices WHERE expires_at <= ?");

  return {
    async insert({ tokenHash, userId, credentialFingerprint, createdAt, expiresAt }) {
      cleanup.run(createdAt.toISOString());
      insert.run(tokenHash, userId, credentialFingerprint,
        createdAt.toISOString(), expiresAt.toISOString());
    },
    async findByTokenHash(tokenHash) {
      return find.get(tokenHash) ?? null;
    },
    async revokeByTokenHash(tokenHash) {
      remove.run(tokenHash);
    },
  };
}

function createPostgresRememberedDeviceGateway(pool) {
  return {
    async insert({ tokenHash, userId, credentialFingerprint, createdAt, expiresAt }) {
      await pool.query("DELETE FROM remembered_devices WHERE expires_at <= $1", [createdAt]);
      await pool.query(`INSERT INTO remembered_devices
        (token_hash, user_id, credential_fingerprint, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)`,
      [tokenHash, userId, credentialFingerprint, createdAt, expiresAt]);
    },
    async findByTokenHash(tokenHash) {
      const result = await pool.query(`SELECT devices.user_id, devices.credential_fingerprint,
        devices.expires_at, users.username
        FROM remembered_devices AS devices
        JOIN users ON users.id = devices.user_id
        WHERE devices.token_hash = $1`, [tokenHash]);
      return result.rows[0] ?? null;
    },
    async revokeByTokenHash(tokenHash) {
      await pool.query("DELETE FROM remembered_devices WHERE token_hash = $1", [tokenHash]);
    },
  };
}

export function createRememberedDeviceGateway({ databaseEngine, db, pool }) {
  return databaseEngine === "postgres"
    ? createPostgresRememberedDeviceGateway(pool)
    : createSqliteRememberedDeviceGateway(db);
}
