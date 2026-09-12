export const migration = {
  version: "011_committee_minutes_sync",
  statements: [
    `
      ALTER TABLE committee_meeting_minutes
      ADD COLUMN IF NOT EXISTS sync_id TEXT
    `,
    `
      UPDATE committee_meeting_minutes
      SET sync_id = gen_random_uuid()::text
      WHERE sync_id IS NULL
    `,
    `
      ALTER TABLE committee_meeting_minutes
      ALTER COLUMN sync_id SET DEFAULT gen_random_uuid()::text
    `,
    `
      ALTER TABLE committee_meeting_minutes
      ALTER COLUMN sync_id SET NOT NULL
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS
        committee_meeting_minutes_sync_id_uidx
      ON committee_meeting_minutes (sync_id)
    `,
    `
      CREATE OR REPLACE FUNCTION append_sync_committee_meeting_minutes_change_log()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        source_row RECORD;
        next_payload JSONB;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true)
          IN ('pull', 'maintenance')
        THEN
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;

          RETURN NEW;
        END IF;

        IF TG_OP = 'UPDATE'
          AND OLD.sync_id IS DISTINCT FROM NEW.sync_id
        THEN
          INSERT INTO sync_change_log (
            domain,
            record_key,
            operation,
            payload_json
          )
          VALUES (
            'committee_meeting_minutes',
            COALESCE(OLD.sync_id, ''),
            'delete',
            jsonb_build_object(
              'sync_id', OLD.sync_id
            )
          );
        END IF;

        source_row :=
          CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

        next_payload := jsonb_build_object(
          'sync_id',
          source_row.sync_id,
          'meeting_date',
          source_row.meeting_date,
          'title',
          source_row.title,
          'sections_json',
          source_row.sections_json,
          'actions_json',
          source_row.actions_json,
          'created_at_date',
          source_row.created_at_date,
          'created_at_time',
          source_row.created_at_time,
          'updated_at_date',
          source_row.updated_at_date,
          'updated_at_time',
          source_row.updated_at_time,
          'updated_by_username',
          source_row.updated_by_username
        );

        INSERT INTO sync_change_log (
          domain,
          record_key,
          operation,
          payload_json
        )
        VALUES (
          'committee_meeting_minutes',
          COALESCE(source_row.sync_id, ''),
          CASE
            WHEN TG_OP = 'DELETE' THEN 'delete'
            ELSE 'upsert'
          END,
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
      DROP TRIGGER IF EXISTS
        sync_committee_meeting_minutes_change_log_trigger
      ON committee_meeting_minutes;

      CREATE TRIGGER
        sync_committee_meeting_minutes_change_log_trigger
      AFTER INSERT OR UPDATE OR DELETE
      ON committee_meeting_minutes
      FOR EACH ROW
      EXECUTE FUNCTION
        append_sync_committee_meeting_minutes_change_log()
    `,
  ],
};
