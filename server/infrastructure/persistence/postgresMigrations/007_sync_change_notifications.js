export const migration = {
  version: "007_sync_change_notifications",
  statements: [
    `
      CREATE OR REPLACE FUNCTION notify_sync_change()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        -- PostgreSQL delivers notifications only when the inserting transaction commits.
        PERFORM pg_notify(
          'archery_sync_change',
          json_build_object(
            'change_id', NEW.change_id,
            'domain', NEW.domain
          )::text
        );
        RETURN NEW;
      END;
      $$;
    `,
    `
      DROP TRIGGER IF EXISTS sync_change_log_notify_trigger ON sync_change_log;
      CREATE TRIGGER sync_change_log_notify_trigger
      AFTER INSERT ON sync_change_log
      FOR EACH ROW EXECUTE FUNCTION notify_sync_change()
    `,
  ],
};
