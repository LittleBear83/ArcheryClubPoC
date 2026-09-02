export const migration = {
  version: "004_fix_sync_change_trigger",
  statements: [
    `
      CREATE OR REPLACE FUNCTION append_sync_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        next_record_key TEXT;
        next_payload JSONB;
      BEGIN
        IF TG_OP = 'DELETE' THEN
          next_payload := to_jsonb(OLD);
        ELSE
          next_payload := to_jsonb(NEW);
        END IF;

        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        next_record_key := CASE
          WHEN TG_ARGV[1] = '__composite__' THEN concat_ws(
            ':',
            next_payload ->> 'username',
            next_payload ->> 'discipline'
          )
          WHEN TG_ARGV[1] = '__role_permission__' THEN concat_ws(
            ':',
            next_payload ->> 'role_key',
            next_payload ->> 'permission_key'
          )
          ELSE COALESCE(next_payload ->> TG_ARGV[1], '')
        END;

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
  ],
};
