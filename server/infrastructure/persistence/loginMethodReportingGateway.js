// Count persisted successful events once. Do not join roles, audits or sync logs:
// those can multiply rows. Stable sync IDs are already unique in login_events.
export function createLoginMethodReportingGateway({ databaseEngine, db, pool }) {
  const sqliteQuery = databaseEngine === "postgres" ? null : db.prepare(`
    SELECT login_method, COUNT(*) AS count FROM login_events
    WHERE (? IS NULL OR logged_in_date >= ?) AND logged_in_date < ?
    GROUP BY login_method
  `);
  return {
    async countByMethod({ startDate, endDateExclusive }) {
      if (databaseEngine === "postgres") {
        return (await pool.query(`
          SELECT login_method, COUNT(*) AS count FROM login_events
          WHERE ($1::text IS NULL OR logged_in_date >= $1) AND logged_in_date < $2
          GROUP BY login_method
        `, [startDate, endDateExclusive])).rows;
      }
      return sqliteQuery.all(startDate, startDate, endDateExclusive);
    },
  };
}
