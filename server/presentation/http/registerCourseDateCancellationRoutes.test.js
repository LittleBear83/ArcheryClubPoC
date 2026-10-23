import assert from "node:assert/strict";
import test from "node:test";
import { registerCourseDateCancellationRoutes } from "./registerCourseDateCancellationRoutes.js";

function setup({ isLocalPiNode = false } = {}) {
  let handler;
  let actor = { username: "member" };
  const course = { id: 4, course_type: "beginners", coordinator_username: "coordinator", is_cancelled: 0 };
  const lessons = [
    { id: 11, is_cancelled: 0 },
    { id: 12, is_cancelled: 1 },
  ];
  const effects = [];
  let writeError = null;
  registerCourseDateCancellationRoutes({
    app: { post(path, route) {
      assert.equal(path, "/api/beginners-courses/:id/cancel-dates");
      handler = route;
    } },
    isLocalPiNode,
    getActorUser: () => actor,
    actorHasPermission: (user, permission) => user?.permissions?.includes(permission) ?? false,
    getCourseTypePermissions: () => ({ approve: "approve_courses", manage: "manage_courses" }),
    beginnersCourseReadGateway: {
      findCourseById: async () => course,
      listLessonsByCourseId: async () => lessons,
    },
    beginnersCourseWriteGateway: {
      cancelLessonDates: async (value) => {
        effects.push(["write", value]);
        if (writeError) throw writeError;
      },
    },
    auditChangeLogger: { recordEntityChange: async (value) => { effects.push(["audit", value]); } },
    getUtcTimestampParts: () => ["2026-10-21", "12:00:00"],
    broadcastBeginnersUpdated: (...args) => effects.push(["beginners", ...args]),
    broadcastCalendarUpdated: (...args) => effects.push(["calendar", ...args]),
  });
  async function invoke(body = { lessonIds: [11] }) {
    let statusCode = 200;
    let payload;
    await handler({ actor, body, params: { id: "4" } }, {
      status(code) { statusCode = code; return this; },
      json(value) { payload = value; return this; },
    });
    return { statusCode, payload };
  }
  return {
    course,
    effects,
    invoke,
    setActor(value) { actor = value; },
    setWriteError(value) { writeError = value; },
  };
}

test("course date cancellation requires cloud authority, authentication and course permission", async () => {
  const local = setup({ isLocalPiNode: true });
  assert.equal((await local.invoke()).statusCode, 503);
  assert.deepEqual(local.effects, []);

  const state = setup();
  state.setActor(null);
  assert.equal((await state.invoke()).statusCode, 401);
  state.setActor({ username: "member" });
  assert.equal((await state.invoke()).statusCode, 403);
  assert.deepEqual(state.effects, []);
});

test("course date cancellation rejects mismatched, repeated and inactive lesson dates before writing", async () => {
  const state = setup();
  state.setActor({ username: "admin", permissions: ["manage_courses"] });
  for (const body of [
    { courseType: "taster-session", lessonIds: [11] },
    { lessonIds: [11, 11] },
    { lessonIds: [12] },
    { lessonIds: [99] },
  ]) {
    const result = await state.invoke(body);
    assert.equal(result.statusCode, body.courseType ? 404 : 400);
  }
  assert.deepEqual(state.effects, []);
});

test("coordinator cancellation writes before audit and broadcasts; failed writes have no side effects", async () => {
  const state = setup();
  state.setActor({ username: "COORDINATOR" });
  state.setWriteError(new Error("conflict"));
  assert.equal((await state.invoke()).statusCode, 409);
  assert.deepEqual(state.effects.map(([name]) => name), ["write"]);

  state.effects.length = 0;
  state.setWriteError(null);
  assert.deepEqual((await state.invoke()).payload, { success: true });
  assert.deepEqual(state.effects.map(([name]) => name), ["write", "audit", "beginners", "calendar"]);
  assert.deepEqual(state.effects[0][1], { courseId: 4, lessonIds: [11] });
  assert.equal(state.effects[1][1].actorUsername, "COORDINATOR");
});
