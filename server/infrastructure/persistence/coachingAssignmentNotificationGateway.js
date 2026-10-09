export function createCoachingAssignmentNotificationGateway({ databaseEngine, db, pool }) {
  if (databaseEngine === "postgres") {
    return {
      async add(coordinatorUsername, payload) {
        const result = await pool.query(
          `INSERT INTO coaching_assignment_notifications (coordinator_username, payload_json)
           VALUES ($1, $2) RETURNING id`,
          [coordinatorUsername, JSON.stringify(payload)],
        );
        return String(result.rows[0].id);
      },
      async list(coordinatorUsername) {
        const result = await pool.query(
          `SELECT id, payload_json FROM coaching_assignment_notifications
           WHERE lower(coordinator_username) = lower($1) ORDER BY id ASC LIMIT 50`,
          [coordinatorUsername],
        );
        return result.rows.map((row) => ({ ...JSON.parse(row.payload_json), eventId: String(row.id) }));
      },
      async remove(coordinatorUsername, id) {
        const result = await pool.query(
          `DELETE FROM coaching_assignment_notifications WHERE id = $1 AND lower(coordinator_username) = lower($2)`,
          [id, coordinatorUsername],
        );
        return result.rowCount > 0;
      },
    };
  }

  const add = db.prepare(`INSERT INTO coaching_assignment_notifications (coordinator_username, payload_json) VALUES (?, ?)`);
  const list = db.prepare(`SELECT id, payload_json FROM coaching_assignment_notifications WHERE lower(coordinator_username) = lower(?) ORDER BY id ASC LIMIT 50`);
  const remove = db.prepare(`DELETE FROM coaching_assignment_notifications WHERE id = ? AND lower(coordinator_username) = lower(?)`);
  return {
    async add(coordinatorUsername, payload) { return String(add.run(coordinatorUsername, JSON.stringify(payload)).lastInsertRowid); },
    async list(coordinatorUsername) { return list.all(coordinatorUsername).map((row) => ({ ...JSON.parse(row.payload_json), eventId: String(row.id) })); },
    async remove(coordinatorUsername, id) { return remove.run(id, coordinatorUsername).changes > 0; },
  };
}
