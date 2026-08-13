import assert from "node:assert/strict";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSqliteReportingStatements } from "./createSqliteReportingStatements.js";

function seedBaseSchema(db) {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      password TEXT NOT NULL,
      rfid_tag TEXT,
      active_member INTEGER NOT NULL,
      junior_member INTEGER NOT NULL,
      membership_fees_due TEXT NOT NULL,
      coaching_volunteer INTEGER NOT NULL,
      membership_status TEXT NOT NULL DEFAULT 'member',
      programme_type TEXT NOT NULL DEFAULT 'none'
    );

    CREATE TABLE user_types (
      user_id INTEGER NOT NULL,
      user_type TEXT NOT NULL
    );

    CREATE TABLE user_disciplines (
      username TEXT NOT NULL,
      discipline TEXT NOT NULL
    );

    CREATE TABLE login_events (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      login_method TEXT NOT NULL,
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL
    );

    CREATE TABLE guest_login_events (
      id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      archery_gb_membership_number TEXT NOT NULL,
      invited_by_username TEXT NOT NULL,
      invited_by_name TEXT NOT NULL,
      logged_in_date TEXT NOT NULL,
      logged_in_time TEXT NOT NULL
    );

    CREATE TABLE beginners_courses (
      id INTEGER PRIMARY KEY,
      course_type TEXT NOT NULL
    );

    CREATE TABLE beginners_course_participants (
      id INTEGER PRIMARY KEY,
      course_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      first_name TEXT NOT NULL,
      surname TEXT NOT NULL,
      created_at_date TEXT NOT NULL,
      created_at_time TEXT NOT NULL,
      origin_course_type TEXT NOT NULL DEFAULT 'beginners',
      converted_to_member INTEGER NOT NULL DEFAULT 0,
      converted_at_date TEXT,
      converted_at_time TEXT,
      user_id INTEGER NOT NULL
    );
  `);
}

function insertMember(db, id, username) {
  db.prepare(
    `INSERT INTO users (
      id, username, first_name, surname, password, rfid_tag,
      active_member, junior_member, membership_fees_due, coaching_volunteer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    username,
    "Member",
    String(id),
    "hashed",
    `RFID-${id}`,
    1,
    0,
    "2026-12-31",
    0,
  );

  db.prepare(`INSERT INTO user_types (user_id, user_type) VALUES (?, ?)`).run(
    id,
    "general",
  );
}

function createInsertLogin(db) {
  return db.prepare(
    `INSERT INTO login_events (
      user_id, username, login_method, logged_in_date, logged_in_time
    ) VALUES (?, ?, ?, ?, ?)`,
  );
}

test("recent range members only include RFID and mobile app check-ins", () => {
  const db = new Database(":memory:");

  try {
    seedBaseSchema(db);
    insertMember(db, 1, "member-one");
    const insertLogin = createInsertLogin(db);

    insertLogin.run(1, "member-one", "password", "2026-07-23", "09:00:00");
    insertLogin.run(1, "member-one", "password-mobile", "2026-07-23", "09:15:00");

    const statements = createSqliteReportingStatements(db);

    assert.deepEqual(statements.findRecentRangeMembers.all("2026-07-23T08:00:00"), []);

    insertLogin.run(1, "member-one", "rfid", "2026-07-23", "09:30:00");

    assert.equal(
      statements.findRecentRangeMembers.all("2026-07-23T08:00:00").length,
      1,
    );

    db.prepare(`DELETE FROM login_events`).run();
    insertLogin.run(1, "member-one", "mobile-app", "2026-07-23", "09:45:00");

    const mobileCheckInRows = statements.findRecentRangeMembers.all(
      "2026-07-23T08:00:00",
    );

    assert.equal(mobileCheckInRows.length, 1);
    assert.equal(mobileCheckInRows[0].username, "member-one");
  } finally {
    db.close();
  }
});

test("member range usage collapses repeated on-site logins inside the two-hour window", () => {
  const db = new Database(":memory:");

  try {
    seedBaseSchema(db);
    insertMember(db, 1, "member-one");
    insertMember(db, 2, "member-two");
    const insertLogin = createInsertLogin(db);
    const statements = createSqliteReportingStatements(db);

    insertLogin.run(1, "member-one", "rfid", "2026-07-23", "08:30:00");
    insertLogin.run(1, "member-one", "mobile-app", "2026-07-23", "09:45:00");
    insertLogin.run(1, "member-one", "rfid", "2026-07-23", "11:00:00");
    insertLogin.run(2, "member-two", "rfid", "2026-07-23", "10:15:00");
    insertLogin.run(2, "member-two", "password", "2026-07-23", "10:20:00");

    const startIso = "2026-07-23T09:00:00";
    const endIso = "2026-07-23T12:00:00";

    assert.deepEqual(
      statements.countMemberLoginsInRange.get(endIso, startIso),
      { count: 2 },
    );
    assert.deepEqual(
      statements.countMemberLoginsForUserInRange.get(endIso, "member-one", startIso),
      { count: 1 },
    );
    assert.deepEqual(
      statements.memberLoginsByDateInRange.all(endIso, startIso),
      [{ usageDate: "2026-07-23", count: 2 }],
    );
    assert.deepEqual(
      statements.memberLoginsByHourInRange.all(endIso, startIso),
      [
        { hour: "10", count: 1 },
        { hour: "11", count: 1 },
      ],
    );
  } finally {
    db.close();
  }
});

test("member journey reporting keeps origin and conversion timestamps", () => {
  const db = new Database(":memory:");

  try {
    seedBaseSchema(db);
    insertMember(db, 1, "member-one");
    insertMember(db, 2, "member-two");
    db.prepare(
      `INSERT INTO beginners_courses (id, course_type) VALUES (?, ?)`,
    ).run(10, "beginners");
    db.prepare(
      `INSERT INTO beginners_courses (id, course_type) VALUES (?, ?)`,
    ).run(11, "taster-session");
    db.prepare(
      `INSERT INTO beginners_course_participants (
        id, course_id, username, first_name, surname,
        created_at_date, created_at_time, origin_course_type,
        converted_to_member, converted_at_date, converted_at_time, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      10,
      "member-one",
      "Member",
      "One",
      "2026-08-01",
      "18:00:00",
      "beginners",
      1,
      "2026-08-12",
      "19:00:00",
      1,
    );
    db.prepare(
      `INSERT INTO beginners_course_participants (
        id, course_id, username, first_name, surname,
        created_at_date, created_at_time, origin_course_type,
        converted_to_member, converted_at_date, converted_at_time, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      2,
      10,
      "member-two",
      "Member",
      "Two",
      "2026-08-05",
      "18:30:00",
      "taster-session",
      0,
      null,
      null,
      2,
    );

    const statements = createSqliteReportingStatements(db);
    const rows = statements.listMemberJourneyParticipants.all(
      "2026-08-01",
      "2026-08-31",
    );

    assert.deepEqual(rows, [
      {
        id: 1,
        username: "member-one",
        first_name: "Member",
        surname: "One",
        created_at_date: "2026-08-01",
        created_at_time: "18:00:00",
        origin_course_type: "beginners",
        converted_to_member: 1,
        converted_at_date: "2026-08-12",
        converted_at_time: "19:00:00",
        current_course_type: "beginners",
        membership_status: "member",
        programme_type: "none",
        user_type: "general",
      },
      {
        id: 2,
        username: "member-two",
        first_name: "Member",
        surname: "Two",
        created_at_date: "2026-08-05",
        created_at_time: "18:30:00",
        origin_course_type: "taster-session",
        converted_to_member: 0,
        converted_at_date: null,
        converted_at_time: null,
        current_course_type: "beginners",
        membership_status: "member",
        programme_type: "none",
        user_type: "general",
      },
    ]);
  } finally {
    db.close();
  }
});
