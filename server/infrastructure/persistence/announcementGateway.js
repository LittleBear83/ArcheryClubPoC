function normalizeAnnouncementRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    id: Number(row.id ?? 0),
    escalate_severity: Number(row.escalate_severity ?? 0),
  };
}

function normalizeSeenMemberRow(row) {
  if (!row) {
    return null;
  }

  return {
    announcement_id: Number(row.announcement_id ?? 0),
    username: row.username ?? "",
    seen_at_date: row.seen_at_date ?? "",
    seen_at_time: row.seen_at_time ?? "",
    first_name: row.first_name ?? "",
    surname: row.surname ?? "",
  };
}

function createSqliteAnnouncementGateway(statements) {
  return {
    async createAnnouncement(payload) {
      const result = statements.createAnnouncement.run(
        payload.activeFromDate,
        payload.activeTillDate,
        payload.severity,
        payload.message,
        payload.escalateSeverity ? 1 : 0,
        payload.createdByUsername,
        payload.createdAtDate,
        payload.createdAtTime,
      );

      return normalizeAnnouncementRow(
        statements.findAnnouncementById.get(result.lastInsertRowid),
      );
    },
    async listActiveAnnouncements(today) {
      return statements.listActiveAnnouncements
        .all(today, today)
        .map(normalizeAnnouncementRow);
    },
    async listAnnouncements() {
      return statements.listAnnouncements.all().map(normalizeAnnouncementRow);
    },
    async listSeenMembersByAnnouncementId(announcementId) {
      return statements.listSeenMembersByAnnouncementId
        .all(announcementId)
        .map(normalizeSeenMemberRow);
    },
    async countSeenMembersByAnnouncementId(announcementId) {
      const row = statements.countSeenMembersByAnnouncementId.get(announcementId);
      return Number(row?.seen_count ?? 0);
    },
    async markActiveAnnouncementsSeenByUsername({
      activeAnnouncements,
      seenAtDate,
      seenAtTime,
      username,
    }) {
      for (const announcement of activeAnnouncements) {
        statements.markAnnouncementSeen.run(
          announcement.id,
          username,
          seenAtDate,
          seenAtTime,
        );
      }
    },
    async findAnnouncementById(announcementId) {
      return normalizeAnnouncementRow(
        statements.findAnnouncementById.get(announcementId),
      );
    },
    async updateAnnouncement(announcementId, payload) {
      statements.updateAnnouncementById.run(
        payload.activeFromDate,
        payload.activeTillDate,
        payload.severity,
        payload.message,
        payload.escalateSeverity ? 1 : 0,
        announcementId,
      );

      return normalizeAnnouncementRow(
        statements.findAnnouncementById.get(announcementId),
      );
    },
  };
}

function createPostgresAnnouncementGateway({ pool }) {
  return {
    async createAnnouncement(payload) {
      const result = await pool.query(
        `
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING
            id,
            active_from_date,
            active_till_date,
            severity,
            message,
            escalate_severity,
            created_by_username,
            created_at_date,
            created_at_time
        `,
        [
          payload.activeFromDate,
          payload.activeTillDate,
          payload.severity,
          payload.message,
          payload.escalateSeverity ? 1 : 0,
          payload.createdByUsername,
          payload.createdAtDate,
          payload.createdAtTime,
        ],
      );

      return normalizeAnnouncementRow(result.rows[0] ?? null);
    },
    async listActiveAnnouncements(today) {
      const result = await pool.query(
        `
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
          WHERE active_from_date <= $1
            AND active_till_date >= $1
          ORDER BY active_from_date DESC, created_at_time DESC, id DESC
        `,
        [today],
      );

      return result.rows.map(normalizeAnnouncementRow);
    },
    async listAnnouncements() {
      const result = await pool.query(
        `
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
        `,
      );

      return result.rows.map(normalizeAnnouncementRow);
    },
    async listSeenMembersByAnnouncementId(announcementId) {
      const result = await pool.query(
        `
          SELECT
            announcement_seen_members.announcement_id,
            announcement_seen_members.username,
            announcement_seen_members.seen_at_date,
            announcement_seen_members.seen_at_time,
            users.first_name,
            users.surname
          FROM announcement_seen_members
          LEFT JOIN users ON users.username = announcement_seen_members.username
          WHERE announcement_seen_members.announcement_id = $1
          ORDER BY announcement_seen_members.seen_at_date DESC, announcement_seen_members.seen_at_time DESC, announcement_seen_members.username ASC
        `,
        [announcementId],
      );

      return result.rows.map(normalizeSeenMemberRow);
    },
    async countSeenMembersByAnnouncementId(announcementId) {
      const result = await pool.query(
        `
          SELECT COUNT(*) AS seen_count
          FROM announcement_seen_members
          WHERE announcement_id = $1
        `,
        [announcementId],
      );

      return Number(result.rows[0]?.seen_count ?? 0);
    },
    async markActiveAnnouncementsSeenByUsername({
      activeAnnouncements,
      seenAtDate,
      seenAtTime,
      username,
    }) {
      for (const announcement of activeAnnouncements) {
        await pool.query(
          `
            INSERT INTO announcement_seen_members (
              announcement_id,
              username,
              seen_at_date,
              seen_at_time
            )
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (announcement_id, username) DO NOTHING
          `,
          [announcement.id, username, seenAtDate, seenAtTime],
        );
      }
    },
    async findAnnouncementById(announcementId) {
      const result = await pool.query(
        `
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
          WHERE id = $1
          LIMIT 1
        `,
        [announcementId],
      );

      return normalizeAnnouncementRow(result.rows[0] ?? null);
    },
    async updateAnnouncement(announcementId, payload) {
      const result = await pool.query(
        `
          UPDATE announcements
          SET
            active_from_date = $1,
            active_till_date = $2,
            severity = $3,
            message = $4,
            escalate_severity = $5
          WHERE id = $6
          RETURNING
            id,
            active_from_date,
            active_till_date,
            severity,
            message,
            escalate_severity,
            created_by_username,
            created_at_date,
            created_at_time
        `,
        [
          payload.activeFromDate,
          payload.activeTillDate,
          payload.severity,
          payload.message,
          payload.escalateSeverity ? 1 : 0,
          announcementId,
        ],
      );

      return normalizeAnnouncementRow(result.rows[0] ?? null);
    },
  };
}

export function createAnnouncementGateway(options) {
  if (options.databaseEngine === "postgres") {
    return createPostgresAnnouncementGateway(options);
  }

  return createSqliteAnnouncementGateway(options);
}
