export const migration = {
  version: "010_member_signoff_committee_sync",
  statements: [
    `
      CREATE OR REPLACE FUNCTION append_sync_member_distance_sign_off_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        old_record_key TEXT;
        next_record_key TEXT;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          old_record_key := concat_ws(
            ':',
            LOWER(COALESCE(OLD.username, '')),
            LOWER(COALESCE(OLD.discipline, '')),
            OLD.distance_yards::text
          );

          next_record_key := concat_ws(
            ':',
            LOWER(COALESCE(NEW.username, '')),
            LOWER(COALESCE(NEW.discipline, '')),
            NEW.distance_yards::text
          );

          IF old_record_key IS DISTINCT FROM next_record_key THEN
            INSERT INTO sync_change_log (
              domain,
              record_key,
              operation,
              payload_json
            )
            VALUES (
              'member_distance_sign_offs',
              old_record_key,
              'delete',
              to_jsonb(OLD)
            );
          END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN
          next_payload := to_jsonb(OLD);
          next_record_key := concat_ws(
            ':',
            LOWER(COALESCE(OLD.username, '')),
            LOWER(COALESCE(OLD.discipline, '')),
            OLD.distance_yards::text
          );
        ELSE
          next_payload := to_jsonb(NEW);
          next_record_key := concat_ws(
            ':',
            LOWER(COALESCE(NEW.username, '')),
            LOWER(COALESCE(NEW.discipline, '')),
            NEW.distance_yards::text
          );
        END IF;

        INSERT INTO sync_change_log (
          domain,
          record_key,
          operation,
          payload_json
        )
        VALUES (
          'member_distance_sign_offs',
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
      DROP TRIGGER IF EXISTS sync_member_distance_sign_offs_change_log_trigger
        ON member_distance_sign_offs;

      CREATE TRIGGER sync_member_distance_sign_offs_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON member_distance_sign_offs
      FOR EACH ROW EXECUTE FUNCTION append_sync_member_distance_sign_off_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_committee_roles_change_log_trigger
        ON committee_roles;

      CREATE TRIGGER sync_committee_roles_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON committee_roles
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log(
        'committee_roles',
        'role_key'
      )
    `,
  ],
};
