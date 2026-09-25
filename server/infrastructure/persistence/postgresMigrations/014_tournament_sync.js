const trigger = (name, table, functionName, timing = "AFTER") => `
  DROP TRIGGER IF EXISTS ${name} ON ${table};
  CREATE TRIGGER ${name}
  ${timing} INSERT OR UPDATE OR DELETE ON ${table}
  FOR EACH ROW EXECUTE FUNCTION ${functionName}()
`;

export const migration = {
  version: "014_tournament_sync",
  statements: [
    // No deployment-wide minimum PostgreSQL version is pinned. Fail before DDL
    // if neither the core function (13+) nor an installed pgcrypto provides UUIDs.
    `DO $$ BEGIN
      IF to_regprocedure('gen_random_uuid()') IS NULL THEN
        RAISE EXCEPTION 'Tournament sync requires gen_random_uuid(): use PostgreSQL 13+ or install pgcrypto before migration 014';
      END IF;
    END $$`,
    `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS sync_is_cloud_managed INTEGER NOT NULL DEFAULT 0`,
    `UPDATE tournaments SET sync_id = gen_random_uuid()::text WHERE sync_id IS NULL`,
    `ALTER TABLE tournaments ALTER COLUMN sync_id SET DEFAULT gen_random_uuid()::text`,
    `ALTER TABLE tournaments ALTER COLUMN sync_id SET NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS tournaments_sync_id_uidx ON tournaments (sync_id)`,
    `
      CREATE OR REPLACE FUNCTION protect_tournament_sync_id()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.sync_id IS DISTINCT FROM NEW.sync_id
          AND current_setting('archery.sync.apply_mode', true) IS DISTINCT FROM 'maintenance'
        THEN
          RAISE EXCEPTION 'tournaments.sync_id is immutable';
        END IF;
        RETURN NEW;
      END;
      $$
    `,
    `
      DROP TRIGGER IF EXISTS protect_tournament_sync_id_trigger ON tournaments;
      CREATE TRIGGER protect_tournament_sync_id_trigger
      BEFORE UPDATE OF sync_id ON tournaments
      FOR EACH ROW EXECUTE FUNCTION protect_tournament_sync_id()
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_templates_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; old_key TEXT; next_key TEXT; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.template_key IS DISTINCT FROM NEW.template_key THEN
          INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
          VALUES ('tournament_templates', OLD.template_key, 'delete', jsonb_build_object('template_key', OLD.template_key));
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        next_key := source_row.template_key;
        payload := jsonb_build_object(
          'template_key', source_row.template_key, 'label', source_row.label,
          'description', source_row.description, 'tournament_type', source_row.tournament_type,
          'format', source_row.format, 'round_type', source_row.round_type,
          'defaults_json', source_row.defaults_json, 'capabilities_json', source_row.capabilities_json,
          'eligibility_rules_json', source_row.eligibility_rules_json,
          'created_by', source_row.created_by, 'created_at_date', source_row.created_at_date,
          'created_at_time', source_row.created_at_time
        );
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_templates', next_key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$
    `,
    trigger("sync_tournament_templates_change_log_trigger", "tournament_templates", "append_sync_tournament_templates_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournaments_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := jsonb_build_object(
          'sync_id', source_row.sync_id, 'name', source_row.name,
          'tournament_type', source_row.tournament_type, 'template_key', source_row.template_key,
          'template_definition_json', source_row.template_definition_json,
          'draw_date', source_row.draw_date, 'round_schedule_json', source_row.round_schedule_json,
          'registration_start_date', source_row.registration_start_date,
          'registration_end_date', source_row.registration_end_date,
          'score_submission_start_date', source_row.score_submission_start_date,
          'score_submission_end_date', source_row.score_submission_end_date,
          'created_by', source_row.created_by, 'created_at_date', source_row.created_at_date,
          'created_at_time', source_row.created_at_time
        );
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournaments', source_row.sync_id, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$
    `,
    trigger("sync_tournaments_change_log_trigger", "tournaments", "append_sync_tournaments_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_registrations_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; parent_sync_id TEXT; old_parent_sync_id TEXT;
        payload JSONB; record_key TEXT; old_record_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NULL;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        SELECT sync_id INTO parent_sync_id FROM tournaments WHERE id = source_row.tournament_id;
        IF parent_sync_id IS NULL THEN
          -- FK cascades run after the parent disappears. Its tombstone cascades
          -- on Pi too, so no child event is needed. Keep missing-parent writes fatal.
          IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
          RAISE EXCEPTION 'Unable to resolve tournament sync identity for tournament_registrations';
        END IF;
        record_key := parent_sync_id || ':' || LOWER(COALESCE(source_row.member_username, ''));
        payload := jsonb_build_object('tournament_sync_id', parent_sync_id,
            'member_username', source_row.member_username,
            'bow_code', source_row.bow_code,
            'registered_at_date', source_row.registered_at_date,
            'registered_at_time', source_row.registered_at_time);
        IF TG_OP = 'UPDATE' THEN
          SELECT sync_id INTO old_parent_sync_id FROM tournaments WHERE id = OLD.tournament_id;
          old_record_key := old_parent_sync_id || ':' || LOWER(COALESCE(OLD.member_username, ''));
          IF old_record_key IS DISTINCT FROM record_key THEN
            INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
            VALUES ('tournament_registrations', old_record_key, 'delete',
              jsonb_build_object('tournament_sync_id', old_parent_sync_id,
                'member_username', OLD.member_username));
          END IF;
        END IF;
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_registrations', record_key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        RETURN NULL;
      END;
      $$
    `,
    trigger("sync_tournament_registrations_change_log_trigger", "tournament_registrations", "append_sync_tournament_registrations_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_rounds_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; parent_sync_id TEXT; old_parent_sync_id TEXT;
        payload JSONB; record_key TEXT; old_record_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NULL;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        SELECT sync_id INTO parent_sync_id FROM tournaments WHERE id = source_row.tournament_id;
        IF parent_sync_id IS NULL THEN
          -- FK cascades run after the parent disappears. Its tombstone cascades
          -- on Pi too, so no child event is needed. Keep missing-parent writes fatal.
          IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
          RAISE EXCEPTION 'Unable to resolve tournament sync identity for tournament_rounds';
        END IF;
        record_key := parent_sync_id || ':' || source_row.round_number::text;
        payload := jsonb_build_object('tournament_sync_id', parent_sync_id,
            'round_number', source_row.round_number,
            'title', source_row.title,
            'publish_date', source_row.publish_date,
            'submission_deadline', source_row.submission_deadline,
            'status', source_row.status);
        IF TG_OP = 'UPDATE' THEN
          SELECT sync_id INTO old_parent_sync_id FROM tournaments WHERE id = OLD.tournament_id;
          old_record_key := old_parent_sync_id || ':' || OLD.round_number::text;
          IF old_record_key IS DISTINCT FROM record_key THEN
            INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
            VALUES ('tournament_rounds', old_record_key, 'delete',
              jsonb_build_object('tournament_sync_id', old_parent_sync_id,
                'round_number', OLD.round_number));
          END IF;
        END IF;
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_rounds', record_key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        RETURN NULL;
      END;
      $$
    `,
    trigger("sync_tournament_rounds_change_log_trigger", "tournament_rounds", "append_sync_tournament_rounds_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_scores_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; parent_sync_id TEXT; old_parent_sync_id TEXT;
        payload JSONB; record_key TEXT; old_record_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NULL;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        SELECT sync_id INTO parent_sync_id FROM tournaments WHERE id = source_row.tournament_id;
        IF parent_sync_id IS NULL THEN
          -- FK cascades run after the parent disappears. Its tombstone cascades
          -- on Pi too, so no child event is needed. Keep missing-parent writes fatal.
          IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
          RAISE EXCEPTION 'Unable to resolve tournament sync identity for tournament_scores';
        END IF;
        record_key := parent_sync_id || ':' || source_row.round_number::text || ':' || LOWER(COALESCE(source_row.member_username, ''));
        payload := jsonb_build_object('tournament_sync_id', parent_sync_id,
            'round_number', source_row.round_number,
            'member_username', source_row.member_username,
            'score', source_row.score,
            'submitted_at_date', source_row.submitted_at_date,
            'submitted_at_time', source_row.submitted_at_time);
        IF TG_OP = 'UPDATE' THEN
          SELECT sync_id INTO old_parent_sync_id FROM tournaments WHERE id = OLD.tournament_id;
          old_record_key := old_parent_sync_id || ':' || OLD.round_number::text || ':' || LOWER(COALESCE(OLD.member_username, ''));
          IF old_record_key IS DISTINCT FROM record_key THEN
            INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
            VALUES ('tournament_scores', old_record_key, 'delete',
              jsonb_build_object('tournament_sync_id', old_parent_sync_id,
                'round_number', OLD.round_number,
            'member_username', OLD.member_username));
          END IF;
        END IF;
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_scores', record_key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        RETURN NULL;
      END;
      $$
    `,
    trigger("sync_tournament_scores_change_log_trigger", "tournament_scores", "append_sync_tournament_scores_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_matches_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; parent_sync_id TEXT; old_parent_sync_id TEXT;
        payload JSONB; record_key TEXT; old_record_key TEXT;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NULL;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        SELECT sync_id INTO parent_sync_id FROM tournaments WHERE id = source_row.tournament_id;
        IF parent_sync_id IS NULL THEN
          -- FK cascades run after the parent disappears. Its tombstone cascades
          -- on Pi too, so no child event is needed. Keep missing-parent writes fatal.
          IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
          RAISE EXCEPTION 'Unable to resolve tournament sync identity for tournament_matches';
        END IF;
        record_key := parent_sync_id || ':' || source_row.round_number::text || ':' || source_row.match_number::text;
        payload := jsonb_build_object('tournament_sync_id', parent_sync_id,
            'round_number', source_row.round_number,
            'match_number', source_row.match_number,
            'left_member_username', source_row.left_member_username,
            'right_member_username', source_row.right_member_username,
            'left_score', source_row.left_score,
            'right_score', source_row.right_score,
            'winner_username', source_row.winner_username,
            'submitted_by_username', source_row.submitted_by_username,
            'submitted_at_date', source_row.submitted_at_date,
            'submitted_at_time', source_row.submitted_at_time,
            'confirmed_by_username', source_row.confirmed_by_username,
            'confirmed_at_date', source_row.confirmed_at_date,
            'confirmed_at_time', source_row.confirmed_at_time,
            'disputed_by_username', source_row.disputed_by_username,
            'disputed_at_date', source_row.disputed_at_date,
            'disputed_at_time', source_row.disputed_at_time,
            'dispute_reason', source_row.dispute_reason,
            'handicap_allowance_percent', source_row.handicap_allowance_percent,
            'left_handicap_value', source_row.left_handicap_value,
            'left_handicap_type', source_row.left_handicap_type,
            'left_handicap_bow_class', source_row.left_handicap_bow_class,
            'left_handicap_discipline', source_row.left_handicap_discipline,
            'left_reference_score', source_row.left_reference_score,
            'left_allowance_points', source_row.left_allowance_points,
            'left_adjusted_score', source_row.left_adjusted_score,
            'left_handicap_table_key', source_row.left_handicap_table_key,
            'left_handicap_table_title', source_row.left_handicap_table_title,
            'right_handicap_value', source_row.right_handicap_value,
            'right_handicap_type', source_row.right_handicap_type,
            'right_handicap_bow_class', source_row.right_handicap_bow_class,
            'right_handicap_discipline', source_row.right_handicap_discipline,
            'right_reference_score', source_row.right_reference_score,
            'right_allowance_points', source_row.right_allowance_points,
            'right_adjusted_score', source_row.right_adjusted_score,
            'right_handicap_table_key', source_row.right_handicap_table_key,
            'right_handicap_table_title', source_row.right_handicap_table_title,
            'status', source_row.status);
        IF TG_OP = 'UPDATE' THEN
          SELECT sync_id INTO old_parent_sync_id FROM tournaments WHERE id = OLD.tournament_id;
          old_record_key := old_parent_sync_id || ':' || OLD.round_number::text || ':' || OLD.match_number::text;
          IF old_record_key IS DISTINCT FROM record_key THEN
            INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
            VALUES ('tournament_matches', old_record_key, 'delete',
              jsonb_build_object('tournament_sync_id', old_parent_sync_id,
                'round_number', OLD.round_number,
            'match_number', OLD.match_number));
          END IF;
        END IF;
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_matches', record_key, CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        RETURN NULL;
      END;
      $$
    `,
    trigger("sync_tournament_matches_change_log_trigger", "tournament_matches", "append_sync_tournament_matches_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_handicap_tables_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.table_key IS DISTINCT FROM NEW.table_key THEN
          INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
          VALUES ('tournament_handicap_tables', OLD.table_key, 'delete', jsonb_build_object('table_key', OLD.table_key));
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := jsonb_build_object('table_key', source_row.table_key, 'title', source_row.title,
          'description', source_row.description, 'allowance_percent', source_row.allowance_percent,
          'is_editable', source_row.is_editable, 'updated_at_date', source_row.updated_at_date,
          'updated_at_time', source_row.updated_at_time, 'updated_by_username', source_row.updated_by_username);
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_handicap_tables', source_row.table_key,
          CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$
    `,
    trigger("sync_tournament_handicap_tables_change_log_trigger", "tournament_handicap_tables", "append_sync_tournament_handicap_tables_change_log"),
    `
      CREATE OR REPLACE FUNCTION append_sync_tournament_handicap_rows_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD; parent_key TEXT; old_parent_key TEXT; record_key TEXT; old_record_key TEXT; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        SELECT table_key INTO parent_key FROM tournament_handicap_tables WHERE id = source_row.table_id;
        IF parent_key IS NULL THEN
          -- The parent tombstone cascades locally on Pi; do not publish an invalid child key.
          IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
          RAISE EXCEPTION 'Unable to resolve handicap table sync identity';
        END IF;
        record_key := parent_key || ':' || source_row.handicap_value::text;
        payload := jsonb_build_object('table_key', parent_key, 'handicap_value', source_row.handicap_value,
          'reference_score', source_row.reference_score, 'display_order', source_row.display_order);
        IF TG_OP = 'UPDATE' THEN
          SELECT table_key INTO old_parent_key FROM tournament_handicap_tables WHERE id = OLD.table_id;
          old_record_key := old_parent_key || ':' || OLD.handicap_value::text;
          IF old_record_key IS DISTINCT FROM record_key THEN
            INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
            VALUES ('tournament_handicap_table_rows', old_record_key, 'delete',
              jsonb_build_object('table_key', old_parent_key, 'handicap_value', OLD.handicap_value));
          END IF;
        END IF;
        INSERT INTO sync_change_log(domain, record_key, operation, payload_json)
        VALUES ('tournament_handicap_table_rows', record_key,
          CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$
    `,
    trigger("sync_tournament_handicap_table_rows_change_log_trigger", "tournament_handicap_table_rows", "append_sync_tournament_handicap_rows_change_log"),
  ],
};
