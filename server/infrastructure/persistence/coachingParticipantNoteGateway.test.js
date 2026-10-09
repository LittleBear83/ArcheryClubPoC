import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createCoachingParticipantNoteGateway } from "./coachingParticipantNoteGateway.js";

test("coaching notes are newest first, warn in their final 30 days, and are physically removed after 12 months", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE coaching_participant_notes (
      id INTEGER PRIMARY KEY, course_id INTEGER, participant_id INTEGER, author_username TEXT,
      author_initials TEXT, attendee_initials TEXT, note_text TEXT, created_at TEXT, expires_at TEXT
    )`);
    const gateway = createCoachingParticipantNoteGateway({ databaseEngine: "sqlite", db });
    const first = await gateway.add({ courseId: 1, participantId: 2, authorUsername: "coach", authorInitials: "CO", attendeeInitials: "AB", text: "First" }, new Date("2025-10-09T10:00:00Z"));
    const second = await gateway.add({ courseId: 1, participantId: 2, authorUsername: "coach", authorInitials: "CO", attendeeInitials: "AB", text: "Second" }, new Date("2025-11-09T10:00:00Z"));
    assert.equal(first.expiresAt, "2026-10-09T10:00:00.000Z");
    assert.deepEqual((await gateway.listForParticipant(2, new Date("2026-09-15T10:00:00Z"))).map((note) => note.text), ["Second", "First"]);
    assert.equal((await gateway.listCountsForCourse(1, new Date("2026-09-15T10:00:00Z"))).get(2), 2);
    assert.equal((await gateway.listForAuthor("COACH", new Date("2026-09-15T10:00:00Z")))[1].dueForDeletion, true);
    assert.equal(second.dueForDeletion, false);
    await gateway.purgeExpired(new Date("2026-10-09T10:00:00Z"));
    assert.equal(db.prepare("SELECT count(*) AS count FROM coaching_participant_notes").get().count, 1);
    assert.equal((await gateway.listCountsForCourse(1, new Date("2026-10-09T10:00:00Z"))).get(2), 1);
    assert.equal((await gateway.listForAuthor("coach", new Date("2026-10-09T10:00:00Z")))[0].text, "Second");
  } finally {
    db.close();
  }
});
