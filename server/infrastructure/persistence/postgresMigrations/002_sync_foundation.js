export const migration = {
  version: "002_sync_foundation",
  statements: [
    `
      CREATE TABLE IF NOT EXISTS sync_change_log (
        change_id BIGSERIAL PRIMARY KEY,
        domain TEXT NOT NULL,
        record_key TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        payload_json JSONB,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS sync_change_log_domain_change_idx
      ON sync_change_log (domain, change_id)
    `,
    `
      CREATE TABLE IF NOT EXISTS sync_local_outbox (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        aggregate_key TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_attempted_at TIMESTAMPTZ,
        acknowledged_at TIMESTAMPTZ,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      )
    `,
    `
      CREATE INDEX IF NOT EXISTS sync_local_outbox_pending_idx
      ON sync_local_outbox (acknowledged_at, available_at, created_at)
    `,
    `
      CREATE TABLE IF NOT EXISTS sync_local_state (
        state_key TEXT PRIMARY KEY,
        state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        next_record_key TEXT;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) = 'pull' THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        IF TG_OP = 'DELETE' THEN
          next_record_key := CASE
            WHEN TG_ARGV[1] = '__composite__' THEN concat_ws(':', OLD.username, OLD.discipline)
            WHEN TG_ARGV[1] = '__role_permission__' THEN concat_ws(':', OLD.role_key, OLD.permission_key)
            ELSE COALESCE(to_jsonb(OLD)->>TG_ARGV[1], '')
          END;
          next_payload := to_jsonb(OLD);
        ELSE
          next_record_key := CASE
            WHEN TG_ARGV[1] = '__composite__' THEN concat_ws(':', NEW.username, NEW.discipline)
            WHEN TG_ARGV[1] = '__role_permission__' THEN concat_ws(':', NEW.role_key, NEW.permission_key)
            ELSE COALESCE(to_jsonb(NEW)->>TG_ARGV[1], '')
          END;
          next_payload := to_jsonb(NEW);
        END IF;

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          TG_ARGV[0],
          next_record_key,
          CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
          next_payload
        );

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END;
      $$;
    `,
    `
      DROP TRIGGER IF EXISTS sync_users_change_log_trigger ON users;
      CREATE TRIGGER sync_users_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON users
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('users', 'username')
    `,
    `
      DROP TRIGGER IF EXISTS sync_user_types_change_log_trigger ON user_types;
      CREATE TRIGGER sync_user_types_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON user_types
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('user_types', 'username')
    `,
    `
      DROP TRIGGER IF EXISTS sync_user_disciplines_change_log_trigger ON user_disciplines;
      CREATE TRIGGER sync_user_disciplines_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON user_disciplines
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('user_disciplines', '__composite__')
    `,
    `
      DROP TRIGGER IF EXISTS sync_roles_change_log_trigger ON roles;
      CREATE TRIGGER sync_roles_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON roles
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('roles', 'role_key')
    `,
    `
      DROP TRIGGER IF EXISTS sync_permissions_change_log_trigger ON permissions;
      CREATE TRIGGER sync_permissions_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON permissions
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('permissions', 'permission_key')
    `,
    `
      DROP TRIGGER IF EXISTS sync_role_permissions_change_log_trigger ON role_permissions;
      CREATE TRIGGER sync_role_permissions_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON role_permissions
      FOR EACH ROW
      EXECUTE FUNCTION append_sync_change_log('role_permissions', '__role_permission__')
    `,
  ],
};
