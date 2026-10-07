// Count persisted successful events once. Do not join roles, audits or sync logs:
// those can multiply rows. Stable sync IDs are already unique in login_events.
export function createLoginMethodReportingGateway({ databaseEngine, db, pool }) {
  const sqliteRangeQuery = databaseEngine === "postgres" ? null : db.prepare(`
    SELECT login_method, COUNT(*) AS count FROM login_events
    WHERE logged_in_date >= ? AND logged_in_date < ?
    GROUP BY login_method
  `);
  const sqliteAllTimeQuery = databaseEngine === "postgres" ? null : db.prepare(`
    SELECT login_method, COUNT(*) AS count FROM login_events
    WHERE logged_in_date < ?
    GROUP BY login_method
  `);
  return {
    async countByMethod({ startDate, endDateExclusive }) {
      if (databaseEngine === "postgres") {
        const sql = startDate === null
          ? `SELECT login_method, COUNT(*) AS count FROM login_events
             WHERE logged_in_date < $1 GROUP BY login_method`
          : `SELECT login_method, COUNT(*) AS count FROM login_events
             WHERE logged_in_date >= $1 AND logged_in_date < $2 GROUP BY login_method`;
        return (await pool.query(sql, startDate === null
          ? [endDateExclusive] : [startDate, endDateExclusive])).rows;
      }
      return startDate === null
        ? sqliteAllTimeQuery.all(endDateExclusive)
        : sqliteRangeQuery.all(startDate, endDateExclusive);
    },
  };
}
