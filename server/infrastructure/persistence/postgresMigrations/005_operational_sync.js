export const migration = {
  version: "005_operational_sync",
  statements: [
    `ALTER TABLE club_events ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `ALTER TABLE equipment_storage_locations ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `ALTER TABLE equipment_items ADD COLUMN IF NOT EXISTS sync_id TEXT`,
    `UPDATE club_events SET sync_id = md5('club_events:' || id::text) WHERE sync_id IS NULL`,
    `UPDATE coaching_sessions SET sync_id = md5('coaching_sessions:' || id::text) WHERE sync_id IS NULL`,
    `UPDATE announcements SET sync_id = md5('announcements:' || id::text) WHERE sync_id IS NULL`,
    `UPDATE equipment_storage_locations SET sync_id = md5('equipment_storage_locations:' || label) WHERE sync_id IS NULL`,
    `UPDATE equipment_items SET sync_id = md5('equipment_items:' || id::text) WHERE sync_id IS NULL`,
    `ALTER TABLE club_events ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE coaching_sessions ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE announcements ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE equipment_storage_locations ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE equipment_items ALTER COLUMN sync_id SET NOT NULL`,
    `ALTER TABLE club_events ALTER COLUMN sync_id SET DEFAULT md5(random()::text || clock_timestamp()::text)`,
    `ALTER TABLE coaching_sessions ALTER COLUMN sync_id SET DEFAULT md5(random()::text || clock_timestamp()::text)`,
    `ALTER TABLE announcements ALTER COLUMN sync_id SET DEFAULT md5(random()::text || clock_timestamp()::text)`,
    `ALTER TABLE equipment_storage_locations ALTER COLUMN sync_id SET DEFAULT md5(random()::text || clock_timestamp()::text)`,
    `ALTER TABLE equipment_items ALTER COLUMN sync_id SET DEFAULT md5(random()::text || clock_timestamp()::text)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS club_events_sync_id_uidx ON club_events (sync_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS coaching_sessions_sync_id_uidx ON coaching_sessions (sync_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS announcements_sync_id_uidx ON announcements (sync_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS equipment_storage_locations_sync_id_uidx ON equipment_storage_locations (sync_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS equipment_items_sync_id_uidx ON equipment_items (sync_id)`,
    `
      ALTER TABLE sync_local_outbox
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_code TEXT,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS outbox_order BIGINT
    `,
    `CREATE SEQUENCE IF NOT EXISTS sync_local_outbox_order_seq`,
    `ALTER SEQUENCE sync_local_outbox_order_seq OWNED BY sync_local_outbox.outbox_order`,
    `ALTER TABLE sync_local_outbox ALTER COLUMN outbox_order SET DEFAULT nextval('sync_local_outbox_order_seq')`,
    `UPDATE sync_local_outbox SET outbox_order = nextval('sync_local_outbox_order_seq') WHERE outbox_order IS NULL`,
    `ALTER TABLE sync_local_outbox ALTER COLUMN outbox_order SET NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS sync_local_outbox_order_uidx ON sync_local_outbox (outbox_order)`,
    `DROP INDEX IF EXISTS sync_local_outbox_pending_idx`,
    `
      CREATE INDEX IF NOT EXISTS sync_local_outbox_pending_idx
      ON sync_local_outbox (acknowledged_at, rejected_at, available_at, outbox_order)
    `,
    `
      CREATE TABLE IF NOT EXISTS sync_received_commands (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        outcome_json JSONB NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_event_booking_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        next_payload := jsonb_build_object(
          'parent_sync_id',
          (
            SELECT sync_id
            FROM club_events
            WHERE id = source_row.club_event_id
            LIMIT 1
          ),
          'member_username',
          source_row.member_username,
          'booked_at_date',
          source_row.booked_at_date,
          'booked_at_time',
          source_row.booked_at_time
        );

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          'event_bookings',
          COALESCE(next_payload->>'parent_sync_id', '') || ':' || LOWER(COALESCE(source_row.member_username, '')),
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
      CREATE OR REPLACE FUNCTION append_sync_coaching_booking_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        next_payload := jsonb_build_object(
          'parent_sync_id',
          (
            SELECT sync_id
            FROM coaching_sessions
            WHERE id = source_row.coaching_session_id
            LIMIT 1
          ),
          'member_username',
          source_row.member_username,
          'booked_at_date',
          source_row.booked_at_date,
          'booked_at_time',
          source_row.booked_at_time
        );

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          'coaching_session_bookings',
          COALESCE(next_payload->>'parent_sync_id', '') || ':' || LOWER(COALESCE(source_row.member_username, '')),
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
      CREATE OR REPLACE FUNCTION append_sync_equipment_item_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        source_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        next_payload := to_jsonb(source_row) || jsonb_build_object(
          'location_case_sync_id',
          (
            SELECT sync_id
            FROM equipment_items
            WHERE id = source_row.location_case_id
            LIMIT 1
          )
        );

        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          'equipment_items',
          COALESCE(next_payload->>'sync_id', ''),
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
      DROP TRIGGER IF EXISTS sync_club_events_change_log_trigger ON club_events;
      CREATE TRIGGER sync_club_events_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON club_events
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log('club_events', 'sync_id')
    `,
    `
      DROP TRIGGER IF EXISTS sync_coaching_sessions_change_log_trigger ON coaching_sessions;
      CREATE TRIGGER sync_coaching_sessions_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON coaching_sessions
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log('coaching_sessions', 'sync_id')
    `,
    `
      DROP TRIGGER IF EXISTS sync_event_bookings_change_log_trigger ON event_bookings;
      CREATE TRIGGER sync_event_bookings_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON event_bookings
      FOR EACH ROW EXECUTE FUNCTION append_sync_event_booking_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_coaching_session_bookings_change_log_trigger ON coaching_session_bookings;
      CREATE TRIGGER sync_coaching_session_bookings_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON coaching_session_bookings
      FOR EACH ROW EXECUTE FUNCTION append_sync_coaching_booking_change_log()
    `,
    `
      DROP TRIGGER IF EXISTS sync_announcements_change_log_trigger ON announcements;
      CREATE TRIGGER sync_announcements_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON announcements
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log('announcements', 'sync_id')
    `,
    `
      DROP TRIGGER IF EXISTS sync_equipment_storage_locations_change_log_trigger ON equipment_storage_locations;
      CREATE TRIGGER sync_equipment_storage_locations_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON equipment_storage_locations
      FOR EACH ROW EXECUTE FUNCTION append_sync_change_log('equipment_storage_locations', 'sync_id')
    `,
    `
      DROP TRIGGER IF EXISTS sync_equipment_items_change_log_trigger ON equipment_items;
      CREATE TRIGGER sync_equipment_items_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE ON equipment_items
      FOR EACH ROW EXECUTE FUNCTION append_sync_equipment_item_change_log()
    `,
  ],
};
