import Database from "better-sqlite3";
import { existsSync } from "node:fs";

import { serverRuntime } from "../server/config/runtime.js";

if (serverRuntime.isLive || serverRuntime.databaseEngine !== "sqlite") {
  throw new Error("Local development seeding requires a non-live SQLite runtime.");
}
if (!existsSync(serverRuntime.databasePath)) {
  throw new Error("Start the development server once to create the local database before seeding.");
}

const db = new Database(serverRuntime.databasePath);
const now = new Date();
const date = (offset) => {
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const stampDate = date(0);
const stampTime = now.toISOString().slice(11);
const seedDate = "2026-01-02";
const actor = "Cfleetham";
const counts = {};
const backupPath = `${serverRuntime.databasePath}.before-dev-seed-${now.toISOString().replace(/[:.]/g, "-")}.sqlite`;

function userId(username) {
  const user = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!user) throw new Error(`Missing baseline user ${username}. Start the server before seeding.`);
  return user.id;
}

function insertOnce(table, where, values, insertSql, params) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(...values);
  if (row) return row.id ?? row.template_key ?? null;
  const result = db.prepare(insertSql).run(...params);
  counts[table] = (counts[table] ?? 0) + 1;
  return Number(result.lastInsertRowid);
}

function ensureGuest(username, firstName, surname) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return existing.id;
  const result = db.prepare(`
    INSERT INTO users (username, first_name, surname, active_member, membership_status, programme_type)
    VALUES (?, ?, ?, 0, 'non-member', 'beginners')
  `).run(username, firstName, surname);
  db.prepare("INSERT INTO user_types (username, user_type, user_id) VALUES (?, 'non-member', ?)")
    .run(username, result.lastInsertRowid);
  counts.users = (counts.users ?? 0) + 1;
  return Number(result.lastInsertRowid);
}

function ensureCourse(marker, type, firstDay, lessonCount, capacity = 8) {
  const existing = db.prepare(`
    SELECT id FROM beginners_courses WHERE created_at_date = ? AND created_at_time = ?
  `).get(seedDate, marker);
  if (existing) return existing.id;
  const result = db.prepare(`
    INSERT INTO beginners_courses (
      course_type, coordinator_username, submitted_by_username, first_lesson_date,
      start_time, end_time, lesson_count, beginner_capacity, approval_status,
      approved_by_username, approved_at_date, approved_at_time,
      created_at_date, created_at_time, coordinator_user_id, submitted_by_user_id, approved_by_user_id
    ) VALUES (?, 'CLikley', ?, ?, '18:00', '20:00', ?, ?, 'approved',
      ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(type, actor, date(firstDay), lessonCount, capacity, actor, stampDate, stampTime,
    seedDate, marker, userId("CLikley"), userId(actor), userId(actor));
  const courseId = Number(result.lastInsertRowid);
  const lesson = db.prepare(`
    INSERT INTO beginners_course_lessons (course_id, lesson_number, lesson_date, start_time, end_time)
    VALUES (?, ?, ?, '18:00', '20:00')
  `);
  for (let i = 0; i < lessonCount; i += 1) lesson.run(courseId, i + 1, date(firstDay + i * 7));
  counts.beginners_courses = (counts.beginners_courses ?? 0) + 1;
  return courseId;
}

function ensureParticipant(courseId, username, firstName, surname, originCourseId = null) {
  ensureGuest(username, firstName, surname);
  insertOnce("beginners_course_participants", "username = ?", [username], `
    INSERT INTO beginners_course_participants (
      course_id, username, first_name, surname, beginner_size_category,
      initial_email_sent, course_fee_paid, origin_course_type, origin_course_id,
      created_by_username, created_at_date, created_at_time, user_id, created_by_user_id
    ) VALUES (?, ?, ?, ?, 'senior', 1, 1, ?, ?, ?, ?, ?, ?, ?)
  `, [courseId, username, firstName, surname, originCourseId ? "taster-session" : "beginners",
    originCourseId, actor, stampDate, stampTime, userId(username), userId(actor)]);
}

try {
  db.pragma("foreign_keys = ON");
  await db.backup(backupPath);
  db.transaction(() => {
    userId(actor);
    userId("CLikley");

    insertOnce("announcements", "message = ?", ["[Dev sample] Autumn range sessions are open for booking."], `
      INSERT INTO announcements (active_from_date, active_till_date, severity, message,
        created_by_username, created_at_date, created_at_time)
      VALUES (?, ?, 'information', ?, ?, ?, ?)
    `, [date(-2), date(30), "[Dev sample] Autumn range sessions are open for booking.", actor, stampDate, stampTime]);

    const eventId = insertOnce("club_events", "title = ?", ["[Dev sample] Club practice evening"], `
      INSERT INTO club_events (event_date, start_time, end_time, title, details, type, venue,
        submitted_by_username, approval_status, approved_by_username, approved_at_date,
        approved_at_time, created_at_date, created_at_time, submitted_by_user_id, approved_by_user_id)
      VALUES (?, '18:00', '20:00', ?, 'Open shooting and equipment checks.', 'social', 'indoor',
        ?, 'approved', ?, ?, ?, ?, ?, ?, ?)
    `, [date(10), "[Dev sample] Club practice evening", actor, actor, stampDate,
      stampTime, stampDate, stampTime, userId(actor), userId(actor)]);
    for (const username of ["LTaylor", "RWilliams"]) {
      insertOnce("event_bookings", "club_event_id = ? AND member_username = ?", [eventId, username], `
        INSERT INTO event_bookings (club_event_id, member_username, booked_at_date, booked_at_time, member_user_id)
        VALUES (?, ?, ?, ?, ?)
      `, [eventId, username, stampDate, stampTime, userId(username)]);
    }

    const coachingId = insertOnce("coaching_sessions", "topic = ?", ["[Dev sample] Grouping and release"], `
      INSERT INTO coaching_sessions (coach_username, session_date, start_time, end_time,
        available_slots, topic, summary, venue, approval_status, approved_by_username,
        approved_at_date, approved_at_time, created_at_date, created_at_time,
        coach_user_id, approved_by_user_id)
      VALUES ('CLikley', ?, '19:00', '20:00', 6, ?, 'A practical session for newer archers.',
        'indoor', 'approved', ?, ?, ?, ?, ?, ?, ?)
    `, [date(12), "[Dev sample] Grouping and release", actor, stampDate, stampTime,
      stampDate, stampTime, userId("CLikley"), userId(actor)]);
    insertOnce("coaching_session_bookings", "coaching_session_id = ? AND member_username = ?",
      [coachingId, "RWilliams"], `
        INSERT INTO coaching_session_bookings (coaching_session_id, member_username,
          booked_at_date, booked_at_time, member_user_id) VALUES (?, ?, ?, ?, ?)
      `, [coachingId, "RWilliams", stampDate, stampTime, userId("RWilliams")]);

    const completed = ensureCourse("06:01:00", "beginners", -42, 4);
    const future = ensureCourse("06:02:00", "beginners", 14, 4);
    const taster = ensureCourse("06:03:00", "taster-session", -7, 1);
    ensureCourse("06:04:00", "taster-session", 7, 1);
    ensureCourse("06:05:00", "have-a-go", 9, 1);
    ensureParticipant(completed, "dev_beginner_ella", "Ella", "Reed");
    ensureParticipant(future, "dev_beginner_max", "Max", "Shaw");
    ensureParticipant(taster, "dev_taster_amy", "Amy", "Bell");
    ensureParticipant(future, "dev_taster_ben", "Ben", "Wells", taster);
    for (const [username, day] of [["dev_beginner_ella", -42], ["dev_beginner_ella", -35],
      ["dev_taster_amy", -7], ["dev_taster_ben", -7]]) {
      insertOnce("login_events", "username = ? AND logged_in_date = ? AND logged_in_time = '18:15:42'",
        [username, date(day)], `
          INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id)
          VALUES (?, 'mobile-app', ?, '18:15:42', ?)
        `, [username, date(day), userId(username)]);
    }

    const template = db.prepare("SELECT * FROM tournament_templates ORDER BY template_key LIMIT 1").get();
    if (template) {
      const tournamentId = insertOnce("tournaments", "name = ?", ["[Dev sample] Autumn target challenge"], `
        INSERT INTO tournaments (name, tournament_type, template_key, template_definition_json,
          registration_start_date, registration_end_date, score_submission_start_date,
          score_submission_end_date, created_by, created_at_date, created_at_time, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ["[Dev sample] Autumn target challenge", template.tournament_type, template.template_key,
        null, date(-1), date(7), date(8),
        date(21), actor, stampDate, stampTime, userId(actor)]);
      for (const username of ["LTaylor", "RWilliams", "TBarnes", "NOdinson"]) {
        insertOnce("tournament_registrations", "tournament_id = ? AND member_username = ?",
          [tournamentId, username], `
            INSERT INTO tournament_registrations (tournament_id, member_username,
              registered_at_date, registered_at_time, member_user_id) VALUES (?, ?, ?, ?, ?)
          `, [tournamentId, username, stampDate, stampTime, userId(username)]);
      }
    }

    insertOnce("suggestions", "suggestion_title = ?", ["[Dev sample] Add a spare bow rack"], `
      INSERT INTO suggestions (submitted_by_username, submitted_by_name, suggestion_title,
        improvement_text, suggestion_details, created_at_date, created_at_time)
      VALUES (?, 'Riri Williams', ?, 'A spare rack would help on busy practice nights.',
        'The current rack fills up before coaching starts.', ?, ?)
    `, ["RWilliams", "[Dev sample] Add a spare bow rack", stampDate, stampTime]);
    insertOnce("member_questions", "question_title = ?", ["[Dev sample] When is the next practice?"], `
      INSERT INTO member_questions (submitted_by_username, question_title, question_body,
        created_at_date, created_at_time) VALUES (?, ?, 'Can I bring a guest next week?', ?, ?)
    `, ["RWilliams", "[Dev sample] When is the next practice?", stampDate, stampTime]);
    insertOnce("equipment_items", "equipment_type = 'riser' AND item_number = ?", ["DEV-RISER-01"], `
      INSERT INTO equipment_items (equipment_type, item_number, size_category, location_label,
        added_by_username, added_at_date, added_at_time, added_by_user_id)
      VALUES ('riser', ?, 'standard', 'Main cupboard', ?, ?, ?, ?)
    `, ["DEV-RISER-01", actor, stampDate, stampTime, userId(actor)]);
    insertOnce("lost_arrows", "arrow_identifier = ?", ["DEV-ARROW-01"], `
      INSERT INTO lost_arrows (archer_username, date_lost, arrow_material, arrow_colour,
        arrow_identifier, fletching_colour_1, fletching_colour_2, nock_colour,
        target_distance, lane_number, other_details, created_at_date, created_at_time)
      VALUES (?, ?, 'carbon', 'black', ?, 'blue', 'blue', 'white', '30 m', 3,
        'Development sample near the target line.', ?, ?)
    `, ["RWilliams", date(-1), "DEV-ARROW-01", stampDate, stampTime]);
    insertOnce("guest_login_events", "first_name = ? AND surname = ? AND logged_in_time = '18:20:42'",
      ["Dev", "Guest"], `
        INSERT INTO guest_login_events (first_name, surname, archery_gb_membership_number,
          invited_by_username, invited_by_name, payment_method, logged_in_date,
          logged_in_time, invited_by_user_id)
        VALUES ('Dev', 'Guest', 'DEV-0001', ?, 'Riri Williams', 'cash', ?, '18:20:42', ?)
      `, ["RWilliams", date(-2), userId("RWilliams")]);

    for (const [username, offset] of [["LTaylor", -2], ["LTaylor", -1], ["RWilliams", -3],
      ["TBarnes", -1], ["CLikley", -5]]) {
      insertOnce("login_events", "username = ? AND logged_in_date = ? AND logged_in_time = '18:15:42'",
        [username, date(offset)], `
          INSERT INTO login_events (username, login_method, logged_in_date, logged_in_time, user_id)
          VALUES (?, 'mobile-app', ?, '18:15:42', ?)
        `, [username, date(offset), userId(username)]);
    }
  })();
  console.log(`Local development data ready: ${serverRuntime.databasePath}`);
  console.log(`Backup: ${backupPath}`);
  console.log(`Added: ${JSON.stringify(counts)}`);
} finally {
  db.close();
}
