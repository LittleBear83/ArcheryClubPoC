import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createBeginnersCourseWriteGateway } from "./beginnersCourseWriteGateway.js";
import { getEquipmentAvailabilityStatus } from "../../domain/services/equipmentAvailability.js";

function fixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE beginners_course_participants (id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL,
      username TEXT NOT NULL, assigned_case_id INTEGER, converted_to_member INTEGER NOT NULL DEFAULT 0,
      assigned_case_by_username TEXT, assigned_case_at_date TEXT, assigned_case_at_time TEXT);
    CREATE TABLE equipment_items (id INTEGER PRIMARY KEY, equipment_type TEXT NOT NULL,
      status TEXT NOT NULL, location_type TEXT NOT NULL, location_case_id INTEGER);
    CREATE TABLE equipment_loans (id INTEGER PRIMARY KEY, equipment_item_id INTEGER NOT NULL,
      loan_context_case_id INTEGER, returned_at_date TEXT);
    INSERT INTO equipment_items VALUES (10, 'case', 'active', 'cupboard', NULL),
      (11, 'case', 'active', 'cupboard', NULL), (12, 'bow', 'active', 'case', 10);
    INSERT INTO beginners_course_participants VALUES
      (1, 5, 'beginner1', 10, 0, 'officer', '2026-01-01', '12:00:00'),
      (2, 5, 'beginner2', 11, 0, 'officer', '2026-01-01', '12:00:00');
  `);
  return { db, gateway: createBeginnersCourseWriteGateway({ db }) };
}

const reservations = [{ participantId: 1, caseId: 10 }, { participantId: 2, caseId: 11 }];

test("release clears only the participant reservation and repeats safely", async () => {
  const { db, gateway } = fixture();
  try {
    assert.equal((await gateway.releaseParticipantCases({ courseId: 5, reservations: reservations.slice(0, 1) })).length, 1);
    assert.deepEqual(db.prepare("SELECT assigned_case_id, assigned_case_by_username FROM beginners_course_participants WHERE id = 1").get(),
      { assigned_case_id: null, assigned_case_by_username: null });
    assert.deepEqual(db.prepare("SELECT status, location_type FROM equipment_items WHERE id = 10").get(),
      { status: "active", location_type: "cupboard" });
    assert.equal(db.prepare("SELECT location_case_id FROM equipment_items WHERE id = 12").get().location_case_id, 10);
    assert.deepEqual(await gateway.releaseParticipantCases({ courseId: 5, reservations: reservations.slice(0, 1) }), []);
  } finally { db.close(); }
});

test("bulk release rolls back when a later reservation conflicts", async () => {
  const { db, gateway } = fixture();
  try {
    db.prepare("INSERT INTO beginners_course_participants (id, course_id, username, assigned_case_id) VALUES (3, 5, 'other', 11)").run();
    await assert.rejects(gateway.releaseParticipantCases({ courseId: 5, reservations }), /unresolved reservation/);
    assert.equal(db.prepare("SELECT assigned_case_id FROM beginners_course_participants WHERE id = 1").get().assigned_case_id, 10);
  } finally { db.close(); }
});

test("active loans and converted participants cannot release cases", async () => {
  const { db, gateway } = fixture();
  try {
    db.prepare("INSERT INTO equipment_loans VALUES (1, 12, 10, NULL)").run();
    await assert.rejects(gateway.releaseParticipantCases({ courseId: 5, reservations: reservations.slice(0, 1) }), /active loan/);
    db.prepare("DELETE FROM equipment_loans").run();
    db.prepare("UPDATE beginners_course_participants SET converted_to_member = 1 WHERE id = 1").run();
    await assert.rejects(gateway.releaseParticipantCases({ courseId: 5, reservations: reservations.slice(0, 1) }), /Converted members/);
    assert.equal(db.prepare("SELECT assigned_case_id FROM beginners_course_participants WHERE id = 1").get().assigned_case_id, 10);
  } finally { db.close(); }
});

test("concurrent repeated releases produce one change", async () => {
  const { db, gateway } = fixture();
  try {
    const results = await Promise.all([gateway, gateway].map((item) => item.releaseParticipantCases({ courseId: 5, reservations: reservations.slice(0, 1) })));
    assert.deepEqual(results.map((result) => result.length).sort(), [0, 1]);
  } finally { db.close(); }
});

test("assignment cannot bypass return confirmation or reserve an occupied case", async () => {
  const { db, gateway } = fixture();
  const assign = (participantId, assignedCaseId) => gateway.updateParticipantCase({
    participantId, assignedCaseId, actorUsername: "officer", assignedAtDate: "2026-10-26", assignedAtTime: "12:00:00",
  });
  try {
    await assert.rejects(assign(1, null), /Release the current case/);
    await assert.rejects(assign(1, 11), /Release the current case/);
    db.prepare("INSERT INTO beginners_course_participants (id, course_id, username) VALUES (3, 5, 'new')").run();
    await assert.rejects(assign(3, 10), /already reserved/);
    db.prepare("INSERT INTO equipment_loans VALUES (1, 12, 10, NULL)").run();
    await assert.rejects(assign(3, 10), /already reserved/);
    assert.equal(db.prepare("SELECT assigned_case_id FROM beginners_course_participants WHERE id = 3").get().assigned_case_id, null);
  } finally { db.close(); }
});

test("availability excludes reservations, loans, and decommissioned stock", () => {
  assert.equal(getEquipmentAvailabilityStatus({ status: "active", locationType: "cupboard" }), "available-at-range");
  assert.equal(getEquipmentAvailabilityStatus({ status: "active", locationType: "case", reservation: { participantId: 1 } }), "reserved-at-range");
  assert.equal(getEquipmentAvailabilityStatus({ status: "active", locationType: "cupboard", hasOpenLoan: true }), "on-loan");
  assert.equal(getEquipmentAvailabilityStatus({ status: "decommissioned", locationType: "cupboard" }), "decommissioned");
});
