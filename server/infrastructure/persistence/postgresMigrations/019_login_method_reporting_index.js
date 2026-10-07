export const migration = {
  version: "019_login_method_reporting_index",
  statements: [
    `CREATE INDEX IF NOT EXISTS login_events_reporting_date_method_idx
     ON login_events (logged_in_date, login_method)`,
  ],
};
