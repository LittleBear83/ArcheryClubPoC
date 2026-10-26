import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { serverRuntime } from "../server/config/runtime.js";

if (serverRuntime.isLive || serverRuntime.databaseEngine !== "sqlite") {
  throw new Error("Range visit sample data requires a non-live SQLite runtime.");
}
if (!existsSync(serverRuntime.databasePath)) {
  throw new Error("Start the development server once to create the local database before seeding.");
}

const db = new Database(serverRuntime.databasePath);
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const date = (offset) => {
  const value = new Date(today);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const yearStart = `${today.getUTCFullYear()}-01-01`;
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  .toISOString().slice(0, 10);
const backupPath = `${serverRuntime.databasePath}.before-range-visit-seed-${now.toISOString().replace(/[:.]/g, "-")}.sqlite`;

try {
  db.pragma("foreign_keys = ON");
  await db.backup(backupPath);

  const memberInsert = db.prepare(`
    INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const memberExists = db.prepare(`
    SELECT 1 FROM login_events
    WHERE username = ? AND login_method = ? AND logged_in_date = ? AND logged_in_time = ?
  `);
  const guestInsert = db.prepare(`
    INSERT INTO guest_login_events (
      first_name, surname, archery_gb_membership_number, invited_by_username,
      invited_by_name, payment_method, logged_in_date, logged_in_time, invited_by_user_id
    ) VALUES ('Sample', 'Range Visitor', 'DEV-RANGE-VISIT', 'RWilliams',
      'Riri Williams', 'cash', ?, ?, ?)
  `);
  const guestExists = db.prepare(`
    SELECT 1 FROM guest_login_events
    WHERE first_name = 'Sample' AND surname = 'Range Visitor'
      AND archery_gb_membership_number = 'DEV-RANGE-VISIT'
      AND logged_in_date = ? AND logged_in_time = ?
  `);
  const userId = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE");
  const members = [
    ["LTaylor", "rfid", date(-2), "08:00:00"],
    ["LTaylor", "rfid", date(-2), "08:45:00"], // Same visit: within two hours.
    ["RWilliams", "mobile-app", monthStart, "09:30:00"],
    ["TBarnes", "rfid", date(-18), "10:15:00"],
    ["RWilliams", "rfid", date(-29), "10:50:00"],
    ["LTaylor", "mobile-app", date(-45), "11:20:00"],
    ["RWilliams", "rfid", date(-80), "12:10:00"],
    ["TBarnes", "mobile-app", yearStart, "13:05:00"],
  ];
  const guests = [
    [date(-2), "08:10:00"],
    [monthStart, "09:40:00"],
    [date(-18), "10:25:00"],
    [date(-29), "10:55:00"],
    [date(-45), "11:30:00"],
    [date(-80), "12:20:00"],
    [yearStart, "13:15:00"],
  ];

  const added = db.transaction(() => {
    const inviter = userId.get("RWilliams")?.id;
    if (!inviter) throw new Error("Missing baseline user RWilliams. Start the server before seeding.");
    let memberEvents = 0;
    let guestEvents = 0;
    for (const [username, method, visitDate, time] of members) {
      const member = userId.get(username)?.id;
      if (!member) throw new Error(`Missing baseline user ${username}. Start the server before seeding.`);
      if (memberExists.get(username, method, visitDate, time)) continue;
      memberInsert.run(username, method, visitDate, time, member);
      memberEvents += 1;
    }
    for (const [visitDate, time] of guests) {
      if (guestExists.get(visitDate, time)) continue;
      guestInsert.run(visitDate, time, inviter);
      guestEvents += 1;
    }
    return { memberEvents, guestEvents };
  })();

  console.log(`Range visit sample data ready: ${serverRuntime.databasePath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Added: ${JSON.stringify(added)}`);
} finally {
  db.close();
}
