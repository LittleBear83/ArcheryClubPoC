export const migration = {
  version: "024_remembered_devices",
  statements: [
    `CREATE TABLE remembered_devices (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_fingerprint TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
    )`,
    `CREATE INDEX remembered_devices_user_id_idx ON remembered_devices (user_id)`,
    `CREATE INDEX remembered_devices_expires_at_idx ON remembered_devices (expires_at)`,
    `CREATE OR REPLACE FUNCTION revoke_remembered_devices_on_user_security_change()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        DELETE FROM remembered_devices WHERE user_id = NEW.id;
        RETURN NEW;
      END;
      $$`,
    `CREATE TRIGGER users_revoke_remembered_devices
      AFTER UPDATE OF password, active_member ON users
      FOR EACH ROW
      WHEN (OLD.password IS DISTINCT FROM NEW.password OR
            (OLD.active_member = 1 AND NEW.active_member <> 1))
      EXECUTE FUNCTION revoke_remembered_devices_on_user_security_change()`,
  ],
};
