export const migration = {
  version: "013_local_outbox_notifications",
  statements: [
    `CREATE OR REPLACE FUNCTION notify_local_sync_outbox()
     RETURNS TRIGGER LANGUAGE plpgsql AS $$
     BEGIN
       -- Delivered only on commit; the durable outbox remains the source of truth.
       PERFORM pg_notify('archery_local_sync_outbox', '');
       RETURN NEW;
     END;
     $$`,
    `CREATE TRIGGER sync_local_outbox_notify_trigger
     AFTER INSERT ON sync_local_outbox
     FOR EACH ROW EXECUTE FUNCTION notify_local_sync_outbox()`,
  ],
};

