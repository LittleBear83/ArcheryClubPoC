export const migration = {
  version: "006_phase_2a1_reporting_sync",
  statements: [
    `
      ALTER TABLE guest_login_events
      ADD COLUMN IF NOT EXISTS sync_event_id TEXT
    `,
    `
      ALTER TABLE guest_login_events
      ADD COLUMN IF NOT EXISTS sync_source_machine_id TEXT
    `,
    `
      ALTER TABLE login_events
      ADD COLUMN IF NOT EXISTS sync_identity_origin TEXT NOT NULL DEFAULT 'native'
    `,
    `
      ALTER TABLE guest_login_events
      ADD COLUMN IF NOT EXISTS sync_identity_origin TEXT NOT NULL DEFAULT 'native'
    `,
    `
      ALTER TABLE range_presence_extensions
      ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT 0
    `,
    `
      ALTER TABLE beginners_courses
      ADD COLUMN IF NOT EXISTS sync_id TEXT
    `,
    `
      ALTER TABLE beginners_course_participants
      ADD COLUMN IF NOT EXISTS sync_id TEXT
    `,
    `
      ALTER TABLE beginners_course_lessons
      ADD COLUMN IF NOT EXISTS sync_id TEXT
    `,
    `
      WITH ranked_login_events AS (
        SELECT
          id,
          md5(
            'legacy-login:' ||
            LOWER(COALESCE(username, '')) || '|' ||
            COALESCE(login_method, '') || '|' ||
            COALESCE(logged_in_date, '') || '|' ||
            COALESCE(logged_in_time, '') || '|' ||
            COALESCE(sync_source_machine_id, '') || '|' ||
            ROW_NUMBER() OVER (
              PARTITION BY
                LOWER(COALESCE(username, '')),
                COALESCE(login_method, ''),
                COALESCE(logged_in_date, ''),
                COALESCE(logged_in_time, ''),
                COALESCE(sync_source_machine_id, '')
              ORDER BY id
            )::text
          ) AS next_sync_event_id
        FROM login_events
        WHERE sync_event_id IS NULL
      )
      UPDATE login_events AS target
      SET
        sync_event_id = ranked_login_events.next_sync_event_id,
        sync_identity_origin = 'legacy'
      FROM ranked_login_events
      WHERE ranked_login_events.id = target.id
    `,
    `
      WITH ranked_guest_events AS (
        SELECT
          id,
          md5(
            'legacy-guest-login:' ||
            LOWER(COALESCE(first_name, '')) || '|' ||
            LOWER(COALESCE(surname, '')) || '|' ||
            LOWER(COALESCE(archery_gb_membership_number, '')) || '|' ||
            LOWER(COALESCE(invited_by_username, '')) || '|' ||
            LOWER(COALESCE(invited_by_name, '')) || '|' ||
            COALESCE(payment_method, '') || '|' ||
            COALESCE(logged_in_date, '') || '|' ||
            COALESCE(logged_in_time, '') || '|' ||
            COALESCE(sync_source_machine_id, '') || '|' ||
            ROW_NUMBER() OVER (
              PARTITION BY
                LOWER(COALESCE(first_name, '')),
                LOWER(COALESCE(surname, '')),
                LOWER(COALESCE(archery_gb_membership_number, '')),
                LOWER(COALESCE(invited_by_username, '')),
                LOWER(COALESCE(invited_by_name, '')),
                COALESCE(payment_method, ''),
                COALESCE(logged_in_date, ''),
                COALESCE(logged_in_time, ''),
                COALESCE(sync_source_machine_id, '')
              ORDER BY id
            )::text
          ) AS next_sync_event_id
        FROM guest_login_events
        WHERE sync_event_id IS NULL
      )
      UPDATE guest_login_events AS target
      SET
        sync_event_id = ranked_guest_events.next_sync_event_id,
        sync_identity_origin = 'legacy'
      FROM ranked_guest_events
      WHERE ranked_guest_events.id = target.id
    `,
    `
      UPDATE beginners_courses
      SET sync_id = md5(random()::text || clock_timestamp()::text || txid_current()::text)
      WHERE sync_id IS NULL
    `,
    `
      UPDATE beginners_course_participants
      SET sync_id = md5(random()::text || clock_timestamp()::text || txid_current()::text)
      WHERE sync_id IS NULL
    `,
    `
      UPDATE beginners_course_lessons
      SET sync_id = md5(random()::text || clock_timestamp()::text || txid_current()::text)
      WHERE sync_id IS NULL
    `,
    `ALTER TABLE login_events ALTER COLUMN sync_event_id SET NOT NULL`,
    `ALTER TABLE guest_login_events ALTER COLUMN sync_event_id SET NOT NULL`,
    `ALTER TABLE beginners_courses ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE beginners_course_participants ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE beginners_course_lessons ALTER COLUMN sync_id SET NOT NULL`,
    `DROP INDEX IF EXISTS login_events_sync_event_id_uidx`,
    `
      CREATE UNIQUE INDEX login_events_sync_event_id_uidx
      ON login_events (sync_event_id)
    `,
    `
      ALTER TABLE login_events
      ALTER COLUMN sync_event_id
      SET DEFAULT md5(random()::text || clock_timestamp()::text || txid_current()::text)
    `,
    `
      ALTER TABLE guest_login_events
      ALTER COLUMN sync_event_id
      SET DEFAULT md5(random()::text || clock_timestamp()::text)
    `,
    `
      ALTER TABLE beginners_courses
      ALTER COLUMN sync_id
      SET DEFAULT md5(random()::text || clock_timestamp()::text)
    `,
    `
      ALTER TABLE beginners_course_participants
      ALTER COLUMN sync_id
      SET DEFAULT md5(random()::text || clock_timestamp()::text)
    `,
    `
      ALTER TABLE beginners_course_lessons
      ALTER COLUMN sync_id
      SET DEFAULT md5(random()::text || clock_timestamp()::text || txid_current()::text)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS guest_login_events_sync_event_id_uidx
      ON guest_login_events (sync_event_id)
    `,
    `
      CREATE INDEX IF NOT EXISTS guest_login_events_sync_source_machine_id_idx
      ON guest_login_events (sync_source_machine_id)
      WHERE sync_source_machine_id IS NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS beginners_courses_sync_id_uidx
      ON beginners_courses (sync_id)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS beginners_course_participants_sync_id_uidx
      ON beginners_course_participants (sync_id)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS beginners_course_lessons_sync_id_uidx
      ON beginners_course_lessons (sync_id)
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_login_event_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NEW;
        END IF;

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          'login_events',
          COALESCE(NEW.sync_event_id, ''),
          'upsert',
          to_jsonb(NEW)
        );

        RETURN NEW;
      END;
      $$;
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_guest_login_event_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NEW;
        END IF;

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          'guest_login_events',
          COALESCE(NEW.sync_event_id, ''),
          'upsert',
          to_jsonb(NEW)
        );

        RETURN NEW;
      END;
      $$;
    `,
    `
      DROP TRIGGER IF EXISTS sync_login_events_change_log_trigger ON login_events;
      CREATE TRIGGER sync_login_events_change_log_trigger
      AFTER INSERT ON login_events
      FOR EACH ROW EXECUTE FUNCTION append_sync_login_event_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_guest_login_events_change_log_trigger ON guest_login_events;
      CREATE TRIGGER sync_guest_login_events_change_log_trigger
      AFTER INSERT ON guest_login_events
      FOR EACH ROW EXECUTE FUNCTION append_sync_guest_login_event_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_range_presence_extensions_change_log_trigger ON range_presence_extensions;
      CREATE TRIGGER sync_range_presence_extensions_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON range_presence_extensions
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log('range_presence_extensions', 'username')
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_beginners_course_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE source_row RECORD; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := to_jsonb(source_row) - 'id' - 'coordinator_user_id' - 'submitted_by_user_id' - 'cancelled_by_user_id' - 'approved_by_user_id';
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES ('beginners_courses', COALESCE(payload->>'sync_id', ''), CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_beginners_course_participant_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE source_row RECORD; payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := (to_jsonb(source_row) - 'id' - 'course_id' - 'user_id' - 'converted_by_user_id' - 'assigned_case_id' - 'assigned_case_by_user_id' - 'created_by_user_id') || jsonb_build_object(
          'course_sync_id', (SELECT sync_id FROM beginners_courses WHERE id = source_row.course_id LIMIT 1)
        );
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES ('beginners_course_participants', COALESCE(payload->>'sync_id', ''), CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
    `,
    `
      DROP TRIGGER IF EXISTS sync_beginners_courses_change_log_trigger ON beginners_courses;
      CREATE TRIGGER sync_beginners_courses_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON beginners_courses
      FOR EACH ROW EXECUTE FUNCTION append_sync_beginners_course_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_beginners_course_participants_change_log_trigger ON beginners_course_participants;
      CREATE TRIGGER sync_beginners_course_participants_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON beginners_course_participants
      FOR EACH ROW EXECUTE FUNCTION append_sync_beginners_course_participant_change_log()
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_beginners_course_lesson_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := to_jsonb(source_row) || jsonb_build_object(
          'course_sync_id', (SELECT sync_id FROM beginners_courses WHERE id = source_row.course_id LIMIT 1)
        );
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES ('beginners_course_lessons', COALESCE(payload->>'sync_id', ''), CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_beginners_course_lesson_coach_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        payload := to_jsonb(source_row) || jsonb_build_object(
          'lesson_sync_id', (SELECT sync_id FROM beginners_course_lessons WHERE id = source_row.lesson_id LIMIT 1)
        );
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES ('beginners_course_lesson_coaches', COALESCE(payload->>'lesson_sync_id', '') || ':' || LOWER(COALESCE(source_row.coach_username, '')), CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END, payload);
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$;
    `,
    `
      DROP TRIGGER IF EXISTS sync_beginners_course_lessons_change_log_trigger ON beginners_course_lessons;
      CREATE TRIGGER sync_beginners_course_lessons_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON beginners_course_lessons
      FOR EACH ROW EXECUTE FUNCTION append_sync_beginners_course_lesson_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_beginners_course_lesson_coaches_change_log_trigger ON beginners_course_lesson_coaches;
      CREATE TRIGGER sync_beginners_course_lesson_coaches_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON beginners_course_lesson_coaches
      FOR EACH ROW EXECUTE FUNCTION append_sync_beginners_course_lesson_coach_change_log()
    `,
  ],
};
