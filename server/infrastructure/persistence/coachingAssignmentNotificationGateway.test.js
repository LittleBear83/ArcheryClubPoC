import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createCoachingAssignmentNotificationGateway } from "./coachingAssignmentNotificationGateway.js";

test("coaching notifications persist for the coordinator until acknowledged", async () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE coaching_assignment_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coordinator_username TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const gateway = createCoachingAssignmentNotificationGateway({ databaseEngine: "sqlite", db });
    const eventId = await gateway.add("Coordinator", { action: "volunteered", lessonId: 12 });
    assert.deepEqual(await gateway.list("coordinator"), [{ action: "volunteered", lessonId: 12, eventId }]);
    assert.deepEqual(await gateway.list("another-member"), []);
    assert.equal(await gateway.remove("another-member", eventId), false);
    assert.equal(await gateway.remove("coordinator", eventId), true);
    assert.deepEqual(await gateway.list("Coordinator"), []);
  } finally {
    db.close();
  }
});
