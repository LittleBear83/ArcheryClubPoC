export function createSqliteAnnouncementStatements(db) {
  return {
    createAnnouncement: db.prepare(`
      INSERT INTO announcements (
        active_from_date,
        active_till_date,
        severity,
        message,
        escalate_severity,
        created_by_username,
        created_at_date,
        created_at_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    findAnnouncementById: db.prepare(`
      SELECT
        id,
        active_from_date,
        active_till_date,
        severity,
        message,
        escalate_severity,
        created_by_username,
        created_at_date,
        created_at_time,
        amended_by_username,
        amended_at_date,
        amended_at_time,
        deleted_by_username,
        deleted_at_date,
        deleted_at_time,
        is_deleted
      FROM announcements
      WHERE id = ?
      LIMIT 1
    `),
    updateAnnouncementById: db.prepare(`
      UPDATE announcements
      SET
        active_from_date = ?,
        active_till_date = ?,
        severity = ?,
        message = ?,
        escalate_severity = ?,
        amended_by_username = ?,
        amended_at_date = ?,
        amended_at_time = ?,
        deleted_by_username = NULL,
        deleted_at_date = NULL,
        deleted_at_time = NULL,
        is_deleted = 0
      WHERE id = ?
    `),
    softDeleteAnnouncementById: db.prepare(`
      UPDATE announcements
      SET
        deleted_by_username = ?,
        deleted_at_date = ?,
        deleted_at_time = ?,
        is_deleted = 1
      WHERE id = ?
    `),
    listAnnouncements: db.prepare(`
      SELECT
        announcements.id,
        announcements.active_from_date,
        announcements.active_till_date,
        announcements.severity,
        announcements.message,
        announcements.escalate_severity,
        announcements.created_by_username,
        announcements.created_at_date,
        announcements.created_at_time,
        announcements.amended_by_username,
        announcements.amended_at_date,
        announcements.amended_at_time,
        announcements.deleted_by_username,
        announcements.deleted_at_date,
        announcements.deleted_at_time,
        announcements.is_deleted,
        created_by_user.first_name AS created_by_first_name,
        created_by_user.surname AS created_by_surname,
        amended_by_user.first_name AS amended_by_first_name,
        amended_by_user.surname AS amended_by_surname,
        deleted_by_user.first_name AS deleted_by_first_name,
        deleted_by_user.surname AS deleted_by_surname
      FROM announcements
      LEFT JOIN users AS created_by_user ON created_by_user.username = announcements.created_by_username
      LEFT JOIN users AS amended_by_user ON amended_by_user.username = announcements.amended_by_username
      LEFT JOIN users AS deleted_by_user ON deleted_by_user.username = announcements.deleted_by_username
      ORDER BY announcements.active_from_date DESC, announcements.created_at_time DESC, announcements.id DESC
    `),
    listActiveAnnouncements: db.prepare(`
      SELECT
        announcements.id,
        announcements.active_from_date,
        announcements.active_till_date,
        announcements.severity,
        announcements.message,
        announcements.escalate_severity,
        announcements.created_by_username,
        announcements.created_at_date,
        announcements.created_at_time,
        announcements.amended_by_username,
        announcements.amended_at_date,
        announcements.amended_at_time,
        announcements.deleted_by_username,
        announcements.deleted_at_date,
        announcements.deleted_at_time,
        announcements.is_deleted
      FROM announcements
      WHERE active_from_date <= ?
        AND active_till_date >= ?
        AND is_deleted = 0
      ORDER BY active_from_date DESC, created_at_time DESC, id DESC
    `),
    listSeenMembersByAnnouncementId: db.prepare(`
      SELECT
        announcement_seen_members.announcement_id,
        announcement_seen_members.username,
        announcement_seen_members.seen_at_date,
        announcement_seen_members.seen_at_time,
        users.first_name,
        users.surname
      FROM announcement_seen_members
      LEFT JOIN users ON users.username = announcement_seen_members.username
      WHERE announcement_seen_members.announcement_id = ?
      ORDER BY announcement_seen_members.seen_at_date DESC, announcement_seen_members.seen_at_time DESC, announcement_seen_members.username ASC
    `),
    countSeenMembersByAnnouncementId: db.prepare(`
      SELECT COUNT(*) AS seen_count
      FROM announcement_seen_members
      WHERE announcement_id = ?
    `),
    markAnnouncementSeen: db.prepare(`
      INSERT OR IGNORE INTO announcement_seen_members (
        announcement_id,
        username,
        seen_at_date,
        seen_at_time
      )
      VALUES (?, ?, ?, ?)
    `),
  };
}
