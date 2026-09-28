const domains = ["member_questions", "suggestions"];

export const migration = {
  version: "015_feedback_sync",
  statements: [
    ...domains.flatMap((table) => [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_id TEXT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_version INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_source_machine_id TEXT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_origin_event_id TEXT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_is_cloud_managed BOOLEAN NOT NULL DEFAULT FALSE`,
      `UPDATE ${table} SET sync_id = gen_random_uuid()::text WHERE sync_id IS NULL`,
      `ALTER TABLE ${table} ALTER COLUMN sync_id SET DEFAULT gen_random_uuid()::text`,
      `ALTER TABLE ${table} ALTER COLUMN sync_id SET NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_sync_id_uidx ON ${table} (sync_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ${table}_sync_origin_event_id_uidx ON ${table} (sync_origin_event_id) WHERE sync_origin_event_id IS NOT NULL`,
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${table}_sync_version_positive') THEN
           ALTER TABLE ${table} ADD CONSTRAINT ${table}_sync_version_positive CHECK (sync_version > 0);
         END IF;
       END $$`,
    ]),
    `
      CREATE OR REPLACE FUNCTION protect_feedback_sync_identity_and_version()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          RETURN NEW;
        END IF;
        IF NEW.sync_id IS DISTINCT FROM OLD.sync_id THEN
          RAISE EXCEPTION 'feedback sync_id is immutable';
        END IF;
        IF NEW.sync_source_machine_id IS DISTINCT FROM OLD.sync_source_machine_id
          OR NEW.sync_origin_event_id IS DISTINCT FROM OLD.sync_origin_event_id
          OR to_jsonb(NEW)->>'submitted_by_username' IS DISTINCT FROM to_jsonb(OLD)->>'submitted_by_username'
          OR to_jsonb(NEW)->>'created_at_date' IS DISTINCT FROM to_jsonb(OLD)->>'created_at_date'
          OR to_jsonb(NEW)->>'created_at_time' IS DISTINCT FROM to_jsonb(OLD)->>'created_at_time'
          OR (TG_TABLE_NAME = 'member_questions' AND (
            to_jsonb(NEW)->>'question_title' IS DISTINCT FROM to_jsonb(OLD)->>'question_title'
            OR to_jsonb(NEW)->>'question_body' IS DISTINCT FROM to_jsonb(OLD)->>'question_body'
          ))
          OR (TG_TABLE_NAME = 'suggestions' AND (
            to_jsonb(NEW)->>'submitted_by_name' IS DISTINCT FROM to_jsonb(OLD)->>'submitted_by_name'
            OR to_jsonb(NEW)->>'is_anonymous' IS DISTINCT FROM to_jsonb(OLD)->>'is_anonymous'
            OR to_jsonb(NEW)->>'suggestion_title' IS DISTINCT FROM to_jsonb(OLD)->>'suggestion_title'
            OR to_jsonb(NEW)->>'improvement_text' IS DISTINCT FROM to_jsonb(OLD)->>'improvement_text'
            OR to_jsonb(NEW)->>'suggestion_details' IS DISTINCT FROM to_jsonb(OLD)->>'suggestion_details'
          ))
        THEN
          RAISE EXCEPTION 'feedback submitter content is immutable';
        END IF;
        IF NEW.sync_version IS DISTINCT FROM OLD.sync_version THEN
          RAISE EXCEPTION 'feedback sync_version is server-managed';
        END IF;
        NEW.sync_version := OLD.sync_version + 1;
        RETURN NEW;
      END;
      $$
    `,
    ...domains.map((table) => `
      DROP TRIGGER IF EXISTS protect_${table}_sync_trigger ON ${table};
      CREATE TRIGGER protect_${table}_sync_trigger
      BEFORE UPDATE ON ${table} FOR EACH ROW
      EXECUTE FUNCTION protect_feedback_sync_identity_and_version()
    `),
    `
      CREATE OR REPLACE FUNCTION append_feedback_sync_change_log()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      DECLARE source_row RECORD;
      BEGIN
        IF current_setting('archery.sync.apply_mode', true) IN ('pull', 'maintenance') THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;
        IF TG_OP = 'DELETE' THEN source_row := OLD;
        ELSE source_row := NEW;
        END IF;
        INSERT INTO sync_change_log (domain, record_key, operation, payload_json)
        VALUES (
          TG_TABLE_NAME,
          source_row.sync_id,
          CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
          CASE WHEN TG_OP = 'DELETE' THEN
            jsonb_build_object('sync_id', source_row.sync_id, 'sync_version', source_row.sync_version)
          ELSE
            to_jsonb(source_row) - 'id' - 'submitted_by_user_id' - 'responded_by_user_id' - 'updated_by_user_id' - 'sync_is_cloud_managed'
          END
        );
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$
    `,
    ...domains.map((table) => `
      DROP TRIGGER IF EXISTS ${table}_sync_change_trigger ON ${table};
      CREATE TRIGGER ${table}_sync_change_trigger
      AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW
      EXECUTE FUNCTION append_feedback_sync_change_log()
    `),
  ],
};
