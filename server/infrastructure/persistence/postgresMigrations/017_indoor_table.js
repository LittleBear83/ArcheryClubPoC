export const migration = {
  version: "017_indoor_table",
  statements: [
    `CREATE TABLE IF NOT EXISTS indoor_table_entries (
      id BIGSERIAL PRIMARY KEY,
      season_year INTEGER NOT NULL,
      archer_username TEXT NOT NULL REFERENCES users(username),
      bow_type TEXT NOT NULL,
      handicap INTEGER,
      classifications_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      updated_at_date TEXT,
      updated_at_time TEXT,
      updated_by_username TEXT REFERENCES users(username),
      UNIQUE (season_year, archer_username, bow_type)
    )`,
    `CREATE OR REPLACE FUNCTION append_sync_indoor_table_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; old_key TEXT; new_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' THEN
          old_key := concat_ws(':', OLD.season_year::text, LOWER(OLD.archer_username), LOWER(OLD.bow_type));
          new_key := concat_ws(':', NEW.season_year::text, LOWER(NEW.archer_username), LOWER(NEW.bow_type));
          IF old_key IS DISTINCT FROM new_key THEN
            INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
            VALUES ('indoor_table_entries', old_key, 'delete', to_jsonb(OLD));
          END IF;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES ('indoor_table_entries',
          concat_ws(':', source_row.season_year::text, LOWER(source_row.archer_username), LOWER(source_row.bow_type)),
          CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, to_jsonb(source_row));
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$`,
    `CREATE TRIGGER sync_indoor_table_entries_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON indoor_table_entries
      FOR EACH ROW EXECUTE FUNCTION append_sync_indoor_table_change_log()`,
  ],
};
