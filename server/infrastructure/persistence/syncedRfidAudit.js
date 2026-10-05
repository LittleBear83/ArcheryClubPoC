// Used by both the additive history backfill and transactional Cloud push.
// Read persisted event fields: receipt/retry payloads cannot rewrite audit time.
export const syncedRfidAuditSql = `
  INSERT INTO audit_events (
    actor_username, action, target, status_code, metadata_json,
    created_at_date, created_at_time, actor_user_id, sync_event_id
  )
  SELECT login.username, 'RFID Sign-in', '/api/auth/rfid', 200,
    jsonb_build_object(
      'auditKind', 'entity_change', 'action', 'created',
      'entityType', 'member_activity', 'entityId', login.sync_event_id,
      'entityLabel', COALESCE(NULLIF(TRIM(CONCAT(member.first_name, ' ', member.surname)), ''), login.username),
      'changes', jsonb_build_array(
        jsonb_build_object('path', 'activityType', 'after', 'login'),
        jsonb_build_object('path', 'method', 'after', 'rfid'),
        jsonb_build_object('path', 'username', 'after', login.username),
        jsonb_build_object('path', 'sourceMachineId', 'after', login.sync_source_machine_id),
        jsonb_build_object('path', 'syncEventId', 'after', login.sync_event_id),
        jsonb_build_object('path', 'result', 'after', 'success')
      )
    )::text,
    login.logged_in_date, login.logged_in_time, login.user_id, login.sync_event_id
  FROM login_events login
  LEFT JOIN users member ON member.id = login.user_id
  WHERE login.login_method = 'rfid'
    AND login.sync_source_machine_id IS NOT NULL
    AND login.sync_event_id IS NOT NULL
    -- The Pi already records successful RFID activity in its auth route.
    -- Keep those rows intact; do not create a second audit event for them.
    AND NOT EXISTS (
      SELECT 1 FROM audit_events existing
      WHERE existing.sync_event_id IS NULL
        AND existing.action = 'MEMBER_ACTIVITY_CREATED'
        AND existing.target IN ('/api/auth/rfid', '/api/auth/rfid/check-in')
        AND existing.status_code = 200
        AND existing.actor_username = login.username
        AND existing.created_at_date = login.logged_in_date
        AND existing.created_at_time = login.logged_in_time
    )
`;

export async function recordSyncedRfidAudit(client, eventId) {
  await client.query(`${syncedRfidAuditSql}
    AND login.sync_event_id = $1
    ON CONFLICT (sync_event_id) DO NOTHING`, [eventId]);
}
