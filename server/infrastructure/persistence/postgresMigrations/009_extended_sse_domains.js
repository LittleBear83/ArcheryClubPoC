export const migration = {
  version: "009_extended_sse_domains",
  statements: [
    `
      CREATE OR REPLACE FUNCTION append_sync_outdoor_table_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        next_payload JSONB;
        next_record_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE' AND concat_ws(
          ':',
          OLD.season_year::text,
          LOWER(COALESCE(OLD.archer_username, '')),
          LOWER(COALESCE(OLD.bow_type, ''))
        ) IS DISTINCT FROM concat_ws(
          ':',
          NEW.season_year::text,
          LOWER(COALESCE(NEW.archer_username, '')),
          LOWER(COALESCE(NEW.bow_type, ''))
        ) THEN
          INSERT INTO sync_change_log (
            domain, record_key, operation, payload_json
          )
          VALUES (
            'outdoor_table_entries',
            concat_ws(
              ':',
              OLD.season_year::text,
              LOWER(COALESCE(OLD.archer_username, '')),
              LOWER(COALESCE(OLD.bow_type, ''))
            ),
            'delete',
            to_jsonb(OLD)
          );
        END IF;

        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        next_payload := to_jsonb(source_row);
        next_record_key := concat_ws(
          ':',
          source_row.season_year::text,
          LOWER(COALESCE(source_row.archer_username, '')),
          LOWER(COALESCE(source_row.bow_type, ''))
        );

        INSERT INTO sync_change_log (
          domain,
          record_key,
          operation,
          payload_json
        )
        VALUES (
          'outdoor_table_entries',
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
      DROP TRIGGER IF EXISTS sync_golden_records_member_sync_change_log_trigger
        ON golden_records_member_sync;

      CREATE TRIGGER sync_golden_records_member_sync_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON golden_records_member_sync
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log(
        'golden_records_member_sync',
        'username'
      )
    `,
    `
      DROP TRIGGER IF EXISTS sync_golden_records_integration_status_change_log_trigger
        ON golden_records_integration_status;

      CREATE TRIGGER sync_golden_records_integration_status_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON golden_records_integration_status
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log(
        'golden_records_integration_status',
        'status_key'
      )
    `,
    `
      DROP TRIGGER IF EXISTS sync_golden_records_lookup_cache_change_log_trigger
        ON golden_records_lookup_cache;

      CREATE TRIGGER sync_golden_records_lookup_cache_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON golden_records_lookup_cache
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log(
        'golden_records_lookup_cache',
        'lookup_type'
      )
    `,
    `
      DROP TRIGGER IF EXISTS sync_outdoor_table_entries_change_log_trigger
        ON outdoor_table_entries;

      CREATE TRIGGER sync_outdoor_table_entries_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON outdoor_table_entries
      FOR EACH ROW EXECUTE FUNCTION append_sync_outdoor_table_change_log()
    `,
  ],
};
