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
        created_at_time
      FROM announcements
      WHERE id = ?
      LIMIT 1
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
        users.first_name AS created_by_first_name,
        users.surname AS created_by_surname
      FROM announcements
      LEFT JOIN users ON users.username = announcements.created_by_username
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
        announcements.created_at_time
      FROM announcements
      WHERE active_from_date <= ?
        AND active_till_date >= ?
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
