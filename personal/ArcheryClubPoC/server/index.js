import express from "express";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDirectory = path.join(__dirname, "data");
const databasePath = path.join(dataDirectory, "auth.sqlite");
const distDirectory = path.join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 3001);

mkdirSync(dataDirectory, { recursive: true });

const db = new Database(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    password TEXT,
    rfid_tag TEXT UNIQUE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    login_method TEXT NOT NULL CHECK (login_method IN ('password', 'rfid')),
    logged_in_at TEXT NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_types (
    username TEXT PRIMARY KEY,
    user_type TEXT NOT NULL CHECK (user_type IN ('general', 'admin', 'developer')),
    FOREIGN KEY (username) REFERENCES users(username)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS guest_login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    surname TEXT NOT NULL,
    archery_gb_membership_number TEXT NOT NULL,
    logged_in_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_disciplines (
    username TEXT NOT NULL,
    discipline TEXT NOT NULL CHECK (
      discipline IN (
        'Long Bow',
        'Flat Bow',
        'Bare Bow',
        'Recurve Bow',
        'Compound Bow'
      )
    ),
    PRIMARY KEY (username, discipline),
    FOREIGN KEY (username) REFERENCES users(username)
  )
`);

const seedUsers = [
  {
    username: "Cfleetham",
    firstName: "Craig",
    surname: "Fleetham",
    password: "abc",
    rfidTag: "RFID-CFLEETHAM-001",
    userType: "developer",
    disciplines: ["Recurve Bow"],
  },
  {
    username: "LTaylor",
    firstName: "Les",
    surname: "Taylor",
    password: "123",
    rfidTag: null,
    userType: "admin",
    disciplines: [
      "Long Bow",
      "Flat Bow",
      "Bare Bow",
      "Recurve Bow",
      "Compound Bow",
    ],
  },
];

const upsertUser = db.prepare(`
  INSERT INTO users (username, first_name, surname, password, rfid_tag)
  VALUES (@username, @firstName, @surname, @password, @rfidTag)
  ON CONFLICT(username) DO UPDATE SET
    first_name = excluded.first_name,
    surname = excluded.surname,
    password = excluded.password,
    rfid_tag = excluded.rfid_tag
`);

const upsertUserType = db.prepare(`
  INSERT INTO user_types (username, user_type)
  VALUES (@username, @userType)
  ON CONFLICT(username) DO UPDATE SET
    user_type = excluded.user_type
`);

const deleteUserDisciplines = db.prepare(`
  DELETE FROM user_disciplines
  WHERE username = ?
`);

const insertUserDiscipline = db.prepare(`
  INSERT OR IGNORE INTO user_disciplines (username, discipline)
  VALUES (?, ?)
`);

for (const user of seedUsers) {
  upsertUser.run(user);
  upsertUserType.run(user);
  deleteUserDisciplines.run(user.username);

  for (const discipline of user.disciplines) {
    insertUserDiscipline.run(user.username, discipline);
  }
}

const findUserByCredentials = db.prepare(`
  SELECT users.username, users.first_name, users.surname, user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  WHERE users.username = ? AND users.password = ?
`);

const findUserByRfid = db.prepare(`
  SELECT users.username, users.first_name, users.surname, user_types.user_type
  FROM users
  INNER JOIN user_types ON user_types.username = users.username
  WHERE users.rfid_tag = ?
`);

const insertLoginEvent = db.prepare(`
  INSERT INTO login_events (username, login_method, logged_in_at)
  VALUES (?, ?, ?)
`);

const insertGuestLoginEvent = db.prepare(`
  INSERT INTO guest_login_events (
    first_name,
    surname,
    archery_gb_membership_number,
    logged_in_at
  )
  VALUES (?, ?, ?, ?)
`);

const findRecentRangeMembers = db.prepare(`
  SELECT
    users.username,
    users.first_name,
    users.surname,
    user_types.user_type,
    MAX(login_events.logged_in_at) AS last_logged_in_at
  FROM login_events
  INNER JOIN users ON users.username = login_events.username
  INNER JOIN user_types ON user_types.username = users.username
  WHERE login_events.logged_in_at >= ?
  GROUP BY users.username, users.first_name, users.surname, user_types.user_type
  ORDER BY users.surname ASC, users.first_name ASC
`);

const findDisciplinesByUsername = db.prepare(`
  SELECT discipline
  FROM user_disciplines
  WHERE username = ?
  ORDER BY discipline ASC
`);

const findRecentGuestLogins = db.prepare(`
  SELECT
    first_name,
    surname,
    archery_gb_membership_number,
    MAX(logged_in_at) AS last_logged_in_at
  FROM guest_login_events
  WHERE logged_in_at >= ?
  GROUP BY first_name, surname, archery_gb_membership_number
  ORDER BY surname ASC, first_name ASC
`);

const countMemberLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
`);

const countGuestLoginsInRange = db.prepare(`
  SELECT COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
`);

const memberLoginsByHourInRange = db.prepare(`
  SELECT CAST(strftime('%H', logged_in_at) AS INTEGER) AS hour, COUNT(*) AS count
  FROM login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY hour
`);

const guestLoginsByHourInRange = db.prepare(`
  SELECT CAST(strftime('%H', logged_in_at) AS INTEGER) AS hour, COUNT(*) AS count
  FROM guest_login_events
  WHERE logged_in_at >= ? AND logged_in_at < ?
  GROUP BY hour
`);

const app = express();

app.use(express.json());

function toUtcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function buildUsageTotals(startIso, endIsoExclusive) {
  const members = countMemberLoginsInRange.get(startIso, endIsoExclusive).count;
  const guests = countGuestLoginsInRange.get(startIso, endIsoExclusive).count;

  return {
    members,
    guests,
    total: members + guests,
  };
}

function buildHourlyBreakdown(startIso, endIsoExclusive) {
  const memberRows = memberLoginsByHourInRange.all(startIso, endIsoExclusive);
  const guestRows = guestLoginsByHourInRange.all(startIso, endIsoExclusive);
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    members: 0,
    guests: 0,
    total: 0,
  }));

  for (const row of memberRows) {
    hours[row.hour].members = row.count;
    hours[row.hour].total += row.count;
  }

  for (const row of guestRows) {
    hours[row.hour].guests = row.count;
    hours[row.hour].total += row.count;
  }

  return hours;
}

function buildUsageWindow(label, startDate, endDateExclusive) {
  return {
    label,
    startDate: toUtcDateString(startDate),
    endDate: toUtcDateString(addUtcDays(endDateExclusive, -1)),
    ...buildUsageTotals(startDate.toISOString(), endDateExclusive.toISOString()),
    hourly: buildHourlyBreakdown(
      startDate.toISOString(),
      endDateExclusive.toISOString(),
    ),
  };
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({
      success: false,
      message: "Username and password are required.",
    });
    return;
  }

  const user = findUserByCredentials.get(username, password);

  if (!user) {
    res.status(401).json({
      success: false,
      message: "Incorrect username or password.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "password", new Date().toISOString());

  res.json({
    success: true,
    user: {
      username: user.username,
      firstName: user.first_name,
      surname: user.surname,
      userType: user.user_type,
    },
  });
});

app.post("/api/auth/rfid", (req, res) => {
  const { rfidTag } = req.body ?? {};

  if (!rfidTag) {
    res.status(400).json({
      success: false,
      message: "RFID tag is required.",
    });
    return;
  }

  const user = findUserByRfid.get(rfidTag);

  if (!user) {
    res.status(401).json({
      success: false,
      message: "RFID tag not recognised.",
    });
    return;
  }

  insertLoginEvent.run(user.username, "rfid", new Date().toISOString());

  res.json({
    success: true,
    user: {
      username: user.username,
      firstName: user.first_name,
      surname: user.surname,
      userType: user.user_type,
    },
  });
});

app.post("/api/auth/guest-login", (req, res) => {
  const { firstName, surname, archeryGbMembershipNumber } = req.body ?? {};
  const trimmedMembershipNumber = archeryGbMembershipNumber?.trim() ?? "";
  const membershipDigits = trimmedMembershipNumber.replace(/\D/g, "");

  if (!firstName || !surname || !archeryGbMembershipNumber) {
    res.status(400).json({
      success: false,
      message: "First name, surname, and Archery GB membership number are required.",
    });
    return;
  }

  if (membershipDigits.length < 7) {
    res.status(400).json({
      success: false,
      message: "Archery GB membership number must contain at least 7 digits.",
    });
    return;
  }

  insertGuestLoginEvent.run(
    firstName.trim(),
    surname.trim(),
    trimmedMembershipNumber,
    new Date().toISOString(),
  );

  res.json({
    success: true,
    user: {
      username: null,
      firstName: firstName.trim(),
      surname: surname.trim(),
      userType: "guest",
      archeryGbMembershipNumber: trimmedMembershipNumber,
    },
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    databasePath,
  });
});

app.get("/api/range-members", (_req, res) => {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const members = findRecentRangeMembers.all(cutoff).map((member) => ({
    username: member.username,
    firstName: member.first_name,
    surname: member.surname,
    userType: member.user_type,
    disciplines: findDisciplinesByUsername
      .all(member.username)
      .map((discipline) => discipline.discipline),
    lastLoggedInAt: member.last_logged_in_at,
  }));
  const guests = findRecentGuestLogins.all(cutoff).map((guest) => ({
    username: null,
    firstName: guest.first_name,
    surname: guest.surname,
    userType: "guest",
    disciplines: [],
    archeryGbMembershipNumber: guest.archery_gb_membership_number,
    lastLoggedInAt: guest.last_logged_in_at,
  }));
  const distinctEntries = new Map();

  for (const entry of [...members, ...guests]) {
    const key =
      entry.username ??
      `guest:${entry.archeryGbMembershipNumber ?? `${entry.firstName}-${entry.surname}`}`;
    const existingEntry = distinctEntries.get(key);

    if (
      !existingEntry ||
      new Date(entry.lastLoggedInAt).getTime() >
        new Date(existingEntry.lastLoggedInAt).getTime()
    ) {
      distinctEntries.set(key, entry);
    }
  }

  res.json({
    success: true,
    members: [...distinctEntries.values()].sort((a, b) => {
      return `${a.surname} ${a.firstName}`.localeCompare(
        `${b.surname} ${b.firstName}`,
      );
    }),
  });
});

app.get("/api/range-usage-dashboard", (req, res) => {
  const now = new Date();
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const todayUtc = startOfUtcDay(now);
  const dayOfWeek = todayUtc.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentWeekStart = addUtcDays(todayUtc, mondayOffset);
  const nextWeekStart = addUtcDays(currentWeekStart, 7);

  const requestedStart = req.query.start;
  const requestedEnd = req.query.end;
  const filteredStart = requestedStart
    ? new Date(`${requestedStart}T00:00:00.000Z`)
    : currentMonthStart;
  const filteredEndDay = requestedEnd
    ? new Date(`${requestedEnd}T00:00:00.000Z`)
    : todayUtc;

  if (
    Number.isNaN(filteredStart.getTime()) ||
    Number.isNaN(filteredEndDay.getTime())
  ) {
    res.status(400).json({
      success: false,
      message: "Invalid start or end date.",
    });
    return;
  }

  if (filteredStart.getTime() > filteredEndDay.getTime()) {
    res.status(400).json({
      success: false,
      message: "Start date cannot be after end date.",
    });
    return;
  }

  const filteredEndExclusive = addUtcDays(filteredEndDay, 1);

  const currentMonth = buildUsageWindow(
    `${toUtcDateString(currentMonthStart)} to ${toUtcDateString(
      addUtcDays(nextMonthStart, -1),
    )}`,
    currentMonthStart,
    nextMonthStart,
  );
  const currentWeek = buildUsageWindow(
    `${toUtcDateString(currentWeekStart)} to ${toUtcDateString(
      addUtcDays(nextWeekStart, -1),
    )}`,
    currentWeekStart,
    nextWeekStart,
  );
  const filteredRange = buildUsageWindow(
    `${toUtcDateString(filteredStart)} to ${toUtcDateString(filteredEndDay)}`,
    filteredStart,
    filteredEndExclusive,
  );

  res.json({
    success: true,
    currentMonth,
    currentWeek,
    filteredRange,
  });
});

if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distDirectory, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`App and auth server listening on http://localhost:${PORT}`);
  console.log(`SQLite database: ${databasePath}`);
  if (existsSync(distDirectory)) {
    console.log(`Serving frontend from: ${distDirectory}`);
  }
});
