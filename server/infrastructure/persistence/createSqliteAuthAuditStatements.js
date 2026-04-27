export function createSqliteAuthAuditStatements(db) {
  const insertLoginEvent = db.prepare(`
    INSERT INTO login_events (
      username,
      login_method,
      logged_in_date,
      logged_in_time
    )
    VALUES (?, ?, ?, ?)
  `);

  const insertGuestLoginEvent = db.prepare(`
    INSERT INTO guest_login_events (
      first_name,
      surname,
      archery_gb_membership_number,
      invited_by_username,
      invited_by_name,
      logged_in_date,
      logged_in_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAuditEvent = db.prepare(`
    INSERT INTO audit_events (
      actor_username,
      action,
      target,
      status_code,
      ip_address,
      user_agent,
      metadata_json,
      created_at_date,
      created_at_time
    )
    VALUES (
      @actorUsername,
      @action,
      @target,
      @statusCode,
      @ipAddress,
      @userAgent,
      @metadataJson,
      @createdAtDate,
      @createdAtTime
    )
  `);

  return {
    insertAuditEvent,
    insertGuestLoginEvent,
    insertLoginEvent,
  };
}
