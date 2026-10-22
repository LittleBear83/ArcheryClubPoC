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
