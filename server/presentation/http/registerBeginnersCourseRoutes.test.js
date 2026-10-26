import assert from "node:assert/strict";
import test from "node:test";
import { registerBeginnersCourseRoutes } from "./registerBeginnersCourseRoutes.js";
import { registerBeginnersCourseParticipantRoutes } from "./registerBeginnersCourseParticipantRoutes.js";

function routeApp() {
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "put", "delete"].map((method) => [method, (path, handler) => {
    routes.set(`${method.toUpperCase()} ${path}`, handler);
  }]));
  return { app, routes };
}

function response() {
  return {
    statusCode: 200,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("extracted course routes retain dashboard permission and calendar response", async () => {
  const { app, routes } = routeApp();
  registerBeginnersCourseRoutes({
    app,
    getActorUser: () => null,
    normalizeCourseType: () => "beginners",
    getCourseTypePermissions: () => ({ manage: "manage", approve: "approve" }),
    buildBeginnersCourseCalendarLessons: async () => [{ id: "lesson-1" }],
  });
  assert.ok(routes.has("POST /api/beginners-courses/:id/reschedule"));
  assert.ok(routes.has("DELETE /api/beginners-courses/:id"));
  const denied = response();
  await routes.get("GET /api/beginners-courses/dashboard")({ query: {} }, denied);
  assert.equal(denied.statusCode, 403);
  assert.deepEqual(denied.body, { success: false, message: "You do not have permission to view beginners courses." });
  const calendar = response();
  await routes.get("GET /api/beginners-courses/calendar")({ query: {} }, calendar);
  assert.deepEqual(calendar.body, { success: true, lessons: [{ id: "lesson-1" }] });
});

test("extracted participant routes keep course lookup, capacity validation and response", async () => {
  const { app, routes } = routeApp();
  registerBeginnersCourseParticipantRoutes({
    app,
    getActorUser: () => ({ username: "officer" }),
    beginnersCourseReadGateway: {
      findCourseById: async (id) => id === "1" ? { id: 1, course_type: "beginners", approval_status: "approved", beginner_capacity: 1 } : null,
      listParticipantsByCourseId: async () => [{ id: 2 }],
    },
    normalizeCourseType: () => "beginners",
    getCourseTypePermissions: () => ({ manage: "manage" }),
    actorHasPermission: () => true,
  });
  assert.ok(routes.has("POST /api/beginners-course-participants/:id/convert"));
  assert.ok(routes.has("GET /api/my-beginner-dashboard"));
  const missing = response();
  await routes.get("POST /api/beginners-courses/:id/beginners")({ params: { id: "missing" } }, missing);
  assert.equal(missing.statusCode, 404);
  const full = response();
  await routes.get("POST /api/beginners-courses/:id/beginners")({ params: { id: "1" } }, full);
  assert.equal(full.statusCode, 400);
  assert.equal(full.body.message, "This beginners course is already full.");
});

test("release routes require permission and physical return, and bulk waits for course completion", async () => {
  const { app, routes } = routeApp();
  let completed = false;
  let allowed = false;
  let canReturn = false;
  let released = 0;
  let audited = 0;
  const auditRecords = [];
  const releaseRequests = [];
  let equipmentBroadcasts = 0;
  registerBeginnersCourseParticipantRoutes({
    app,
    getActorUser: () => ({ username: "officer" }),
    actorHasPermission: (_actor, permission) => allowed && (permission !== "return" || canReturn),
    getCourseTypePermissions: () => ({ manage: "manage" }),
    normalizeCourseType: () => "beginners",
    PERMISSIONS: { ASSIGN_EQUIPMENT: "assign", RETURN_EQUIPMENT: "return" },
    beginnersCourseReadGateway: {
      findParticipantById: async () => ({ id: 1, course_id: 5 }),
      findCourseById: async () => ({ id: 5, course_type: "beginners", approval_status: "approved", is_cancelled: 0 }),
    },
    hasBeginnersCourseCompleted: async () => completed,
    beginnersCourseWriteGateway: {
      releaseParticipantCases: async (options) => {
        released++;
        releaseRequests.push(options);
        return options.reservations.map((row) => ({ ...row, username: "beginner", courseId: 5,
          returnedLoans: options.returnActiveLoans ? [{ loanId: 7, itemId: 12, itemNumber: "RISER-12", memberUsername: "borrower" }] : [] }));
      },
    },
    findBeginnersParticipantAuditSnapshot: async () => ({ id: 1 }),
    buildBeginnersParticipantAuditLabel: () => "Beginner",
    auditChangeLogger: { recordEntityChange: async (record) => { audited++; auditRecords.push(record); } },
    getUtcTimestampParts: () => ["2026-10-26", "12:00:00"],
    broadcastBeginnersUpdated: () => {},
    broadcastEquipmentUpdated: () => { equipmentBroadcasts++; },
    buildBeginnersCourseDashboard: async () => [{ id: 5 }],
  });
  const individual = routes.get("POST /api/beginners-course-participants/:id/release-equipment");
  const bulk = routes.get("POST /api/beginners-courses/:id/release-equipment");
  const request = (body) => ({ params: { id: "1" }, body });
  const denied = response();
  await individual(request({ confirmed: true, caseId: 10 }), denied);
  assert.equal(denied.statusCode, 403);
  allowed = true;
  const unconfirmed = response();
  await individual(request({ caseId: 10 }), unconfirmed);
  assert.equal(unconfirmed.statusCode, 400);
  const noReturnPermission = response();
  await individual(request({ confirmed: true, caseId: 10, returnActiveLoans: true, loansConfirmed: true }), noReturnPermission);
  assert.equal(noReturnPermission.statusCode, 403);
  canReturn = true;
  const noLoanConfirmation = response();
  await individual(request({ confirmed: true, caseId: 10, returnActiveLoans: true }), noLoanConfirmation);
  assert.equal(noLoanConfirmation.statusCode, 400);
  for (const returnedOn of ["2026-02-30", "2099-01-01"]) {
    const invalidDate = response();
    await individual(request({ confirmed: true, caseId: 10, returnedOn }), invalidDate);
    assert.equal(invalidDate.statusCode, 400);
  }
  assert.equal(released, 0);
  const active = response();
  await bulk({ params: { id: "5" }, body: { confirmed: true, reservations: [{ participantId: 1, caseId: 10 }] } }, active);
  assert.equal(active.statusCode, 409);
  completed = true;
  const done = response();
  await individual(request({ confirmed: true, caseId: 10 }), done);
  assert.equal(done.body.releasedCount, 1);
  assert.equal(released, 1);
  assert.equal(audited, 1);
  assert.equal(equipmentBroadcasts, 1);
  const bulkDone = response();
  await bulk({ params: { id: "5" }, body: { confirmed: true, returnedOn: "2026-09-14", reservations: [{ participantId: 1, caseId: 10 }] } }, bulkDone);
  assert.equal(bulkDone.body.releasedCount, 1);
  assert.equal(auditRecords[1].after.equipmentReturnedOn, "2026-09-14");
  assert.match(auditRecords[1].entityLabel, /returned 2026-09-14/);
  const override = response();
  await individual(request({ confirmed: true, caseId: 10, returnedOn: "2026-10-20", returnActiveLoans: true, loansConfirmed: true }), override);
  assert.equal(override.body.releasedCount, 1);
  assert.equal(override.body.returnedLoanCount, 1);
  assert.equal(releaseRequests.at(-1).returnActiveLoans, true);
  assert.equal(releaseRequests.at(-1).returnedOn, "2026-10-20");
  assert.equal(auditRecords.at(-1).entityType, "equipment_item");
  assert.equal(auditRecords.at(-1).after.returnedOn, "2026-10-20");
});
