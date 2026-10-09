import assert from "node:assert/strict";
import test from "node:test";
import { registerCoachingHubRoutes } from "./registerCoachingHubRoutes.js";

function dateOffset(days) {
  const date = new Date(Date.now() + days * 86400000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setup(overrides = {}) {
  const actor = { id: 7, username: "coach", coaching_volunteer: 1 };
  const lesson = { id: 12, course_id: 4, lesson_number: 2, lesson_date: dateOffset(1), start_time: "23:59:00", end_time: "23:59:59", is_cancelled: 0 };
  const course = { id: 4, course_type: "beginners", coordinator_username: "coordinator", approval_status: "approved", is_cancelled: 0, beginner_capacity: 8 };
  const coachRows = [];
  const notifications = [];
  const calls = new Map();
  const effects = { add: 0, remove: 0, audit: [], beginners: [], calendar: [] };
  const routes = {
    get: (path, handler) => calls.set(`GET ${path}`, handler),
    post: (path, handler) => calls.set(`POST ${path}`, handler),
    delete: (path, handler) => calls.set(`DELETE ${path}`, handler),
    put: (path, handler) => calls.set(`PUT ${path}`, handler),
  };
  const dependencies = {
    app: routes,
    getActorUser: (req) => req.actor ?? actor,
    isCoachEligible: (user) => Boolean(user?.coaching_volunteer),
    beginnersCourseReadGateway: {
      findLessonById: async () => lesson,
      findCourseById: async () => course,
      listLessonCoachesByLessonId: async () => coachRows,
      listCoachLessonsByUserId: async () => [],
      listParticipantsByCourseId: async () => [],
      listParticipantAttendanceByDate: async () => [],
    },
    beginnersCourseWriteGateway: {
      addLessonCoachSelf: async () => { effects.add++; coachRows.push({ coach_username: actor.username, first_name: "Coach", surname: "One" }); return true; },
      removeLessonCoachSelf: async () => { effects.remove++; return true; },
      setLessonRequiredCoachCount: async () => true,
    },
    manualLessonAttendanceGateway: {
      listAll: async () => [],
      set: async () => {},
      remove: async () => {},
    },
    coachingAssignmentNotificationGateway: {
      add: async (username, payload) => { notifications.push({ username, payload }); return String(notifications.length); },
      list: async (username) => notifications.filter((entry) => entry.username === username).map((entry, index) => ({ ...entry.payload, eventId: String(index + 1) })),
      remove: async (username, id) => {
        const index = notifications.findIndex((entry, index) => entry.username === username && String(index + 1) === String(id));
        if (index < 0) return false;
        notifications.splice(index, 1);
        return true;
      },
    },
    coachingParticipantNoteGateway: {
      add: async () => { throw new Error("Unexpected note write"); },
      listForParticipant: async () => [],
      listForAuthor: async () => [],
      listCountsForCourse: async () => new Map(),
    },
    buildBeginnersCourseCalendarLessons: async () => [],
    getUtcTimestampParts: () => [new Date().toISOString().slice(0, 10), new Date().toISOString().slice(11, 19)],
    normalizeCourseType: (value) => value,
    resolveCanonicalUsername: async (value) => value,
    findBeginnersLessonAuditSnapshot: async () => ({ id: lesson.id, lessonNumber: lesson.lesson_number, date: lesson.lesson_date, coaches: coachRows.map((row) => ({ username: row.coach_username })) }),
    auditChangeLogger: { recordEntityChange: async (entry) => { effects.audit.push(entry); } },
    broadcastBeginnersUpdated: (...args) => effects.beginners.push(args),
    broadcastCalendarUpdated: (...args) => effects.calendar.push(args),
    ...overrides,
  };
  registerCoachingHubRoutes(dependencies);
  return { calls, effects, actor, lesson, course, coachRows, notifications, dependencies };
}

test("participant notes require an assigned beginners coach and enforce the 500-character limit", async () => {
  const state = setup();
  const participant = { id: 23, first_name: "Amy", surname: "Bell" };
  state.dependencies.beginnersCourseReadGateway.listParticipantsByCourseId = async () => [participant];
  const writes = [];
  state.dependencies.coachingParticipantNoteGateway.add = async (entry) => { writes.push(entry); return { id: 1, ...entry }; };
  const key = "POST /api/my-coaching-lessons/:id/participants/:participantId/notes";
  const request = { params: { id: "12", participantId: "23" }, body: { text: "Good progress" } };
  assert.equal((await invoke(state, key, request)).statusCode, 403);
  state.dependencies.beginnersCourseReadGateway.listCoachLessonsByUserId = async () => [{ id: 12, course_id: 4 }];
  assert.equal((await invoke(state, key, { ...request, body: { text: "x".repeat(501) } })).statusCode, 400);
  assert.equal((await invoke(state, key, { ...request, params: { id: "12", participantId: "99" } })).statusCode, 404);
  const saved = await invoke(state, key, request);
  assert.equal(saved.statusCode, 201);
  assert.equal(writes[0].text, "Good progress");
  assert.equal(writes[0].attendeeInitials, "AB");
  assert.equal(writes.length, 1);
  state.course.course_type = "taster-session";
  assert.equal((await invoke(state, key, request)).statusCode, 404);
});

test("coaches can read participant notes and their own note summary", async () => {
  const state = setup();
  state.dependencies.beginnersCourseReadGateway.listParticipantsByCourseId = async () => [{ id: 23, first_name: "Amy", surname: "Bell" }];
  state.dependencies.beginnersCourseReadGateway.listCoachLessonsByUserId = async () => [{ id: 12, course_id: 4 }];
  state.dependencies.coachingParticipantNoteGateway.listForParticipant = async () => [{ id: 1, text: "Practice stance" }];
  state.dependencies.coachingParticipantNoteGateway.listForAuthor = async (username) => [{ id: 1, authorUsername: username }];
  const participant = await invoke(state, "GET /api/my-coaching-lessons/:id/participants/:participantId/notes", { params: { id: "12", participantId: "23" } });
  assert.equal(participant.body.notes[0].text, "Practice stance");
  const mine = await invoke(state, "GET /api/my-coaching-notes");
  assert.equal(mine.body.notes[0].authorUsername, "coach");
});

async function invoke(setupResult, key, overrides = {}) {
  const req = { params: { id: String(setupResult.lesson.id) }, body: {}, ...overrides };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await setupResult.calls.get(key)(req, res);
  return res;
}

test("volunteer route authenticates, checks coaching permission and records a successful self-assignment", async () => {
  const state = setup();
  const unauthorized = await invoke(state, "POST /api/beginners-course-lessons/:id/volunteer", { actor: { id: 9, username: "member", coaching_volunteer: 0 } });
  assert.equal(unauthorized.statusCode, 403);
  assert.equal(state.effects.add, 0);

  const result = await invoke(state, "POST /api/beginners-course-lessons/:id/volunteer");
  assert.equal(result.statusCode, 200);
  assert.equal(state.effects.add, 1);
  assert.equal(state.coachRows[0].coach_username, "coach");
  assert.equal(state.effects.audit[0].action, "coach_volunteered");
  assert.equal(state.effects.beginners.length, 1);
  assert.equal(state.effects.calendar.length, 1);
});

test("manual attendance requires the coordinator or assigned coach and an enrolled participant", async () => {
  const state = setup();
  state.lesson.lesson_date = dateOffset(-1);
  const writes = [];
  state.dependencies.beginnersCourseReadGateway.listParticipantsByCourseId = async () => [
    { id: 23, username: "beginner", first_name: "A", surname: "Beginner" },
  ];
  state.dependencies.manualLessonAttendanceGateway.set = async (entry) => writes.push(entry);
  const key = "POST /api/beginners-course-lessons/:id/attendance/:participantId";
  const outsider = await invoke(state, key, { params: { id: "12", participantId: "23" } });
  assert.equal(outsider.statusCode, 403);
  state.coachRows.push({ coach_username: "coach" });
  const wrongParticipant = await invoke(state, key, { params: { id: "12", participantId: "99" } });
  assert.equal(wrongParticipant.statusCode, 404);
  const recorded = await invoke(state, key, { params: { id: "12", participantId: "23" } });
  assert.equal(recorded.statusCode, 200);
  const coordinator = await invoke(state, key, { actor: { id: 8, username: "coordinator" }, params: { id: "12", participantId: "23" } });
  assert.equal(coordinator.statusCode, 200);
  assert.deepEqual(writes.map((entry) => [entry.lessonId, entry.participantId, entry.actorUsername]), [[12, 23, "coach"], [12, 23, "coordinator"]]);
});

test("manual attendance can be recorded for any lesson date but cannot duplicate a sign-in", async () => {
  const state = setup();
  state.coachRows.push({ coach_username: "coach" });
  state.dependencies.beginnersCourseReadGateway.listParticipantsByCourseId = async () => [
    { id: 23, username: "beginner", first_name: "A", surname: "Beginner" },
  ];
  const writes = [];
  state.dependencies.manualLessonAttendanceGateway.set = async (entry) => writes.push(entry);
  const key = "POST /api/beginners-course-lessons/:id/attendance/:participantId";
  const params = { id: "12", participantId: "23" };
  assert.equal((await invoke(state, key, { params })).statusCode, 200);
  assert.equal(writes.length, 1);

  state.dependencies.beginnersCourseReadGateway.listParticipantAttendanceByDate = async () => [{ username: "BEGINNER" }];
  const signedIn = await invoke(state, key, { params });
  assert.equal(signedIn.statusCode, 409);
  assert.equal(writes.length, 1);
});

test("a coach assigned to another lesson in the course can record attendance for this date", async () => {
  const state = setup();
  state.dependencies.beginnersCourseReadGateway.listCoachLessonsByUserId = async () => [{ id: 13, course_id: state.course.id }];
  state.dependencies.beginnersCourseReadGateway.listParticipantsByCourseId = async () => [
    { id: 23, username: "beginner", first_name: "A", surname: "Beginner" },
  ];
  const response = await invoke(state, "POST /api/beginners-course-lessons/:id/attendance/:participantId", {
    params: { id: "12", participantId: "23" },
  });
  assert.equal(response.statusCode, 200);

  state.dependencies.beginnersCourseReadGateway.listCoachLessonsByUserId = async () => [{ id: 14, course_id: 99 }];
  const unrelated = await invoke(state, "POST /api/beginners-course-lessons/:id/attendance/:participantId", {
    params: { id: "12", participantId: "23" },
  });
  assert.equal(unrelated.statusCode, 403);
});

test("volunteering rejects duplicate, cancelled, past and already covered lessons", async () => {
  const key = "POST /api/beginners-course-lessons/:id/volunteer";
  const duplicate = setup();
  duplicate.coachRows.push({ coach_username: "coach" });
  assert.equal((await invoke(duplicate, key)).statusCode, 409);
  assert.equal(duplicate.effects.add, 0);

  const covered = setup();
  covered.coachRows.push({ coach_username: "other" });
  assert.equal((await invoke(covered, key)).statusCode, 409);

  const cancelled = setup();
  cancelled.lesson.is_cancelled = 1;
  assert.equal((await invoke(cancelled, key)).statusCode, 409);

  const past = setup();
  past.lesson.lesson_date = dateOffset(-1);
  assert.equal((await invoke(past, key)).statusCode, 409);
});

test("reporting unavailability notifies the coordinator and keeps the coach assigned", async () => {
  const key = "POST /api/beginners-course-lessons/:id/unavailability";
  const deliveries = [];
  const state = setup({ broadcastToUsers: (...args) => deliveries.push(args) });
  state.coachRows.push({ coach_username: "coach" });
  const result = await invoke(state, key, { body: { reason: "Schedule conflict" } });
  assert.equal(result.statusCode, 200);
  assert.match(result.body.message, /remain assigned/i);
  assert.equal(state.effects.remove, 0);
  assert.equal(state.coachRows.length, 1);
  assert.equal(state.effects.audit[0].action, "coach_unavailability_reported");
  assert.equal(state.effects.audit[0].after.reason, "Schedule conflict");
  assert.equal(state.effects.beginners.length, 0);
  assert.equal(state.effects.calendar.length, 0);
  assert.equal(state.notifications[0].username, "coordinator");
  assert.equal(state.notifications[0].payload.action, "cannot_attend");
  assert.equal(state.notifications[0].payload.assignedCoachCount, 1);
  assert.equal(state.notifications[0].payload.reason, "Schedule conflict");
  assert.deepEqual(deliveries[0][0], ["coordinator"]);
  assert.equal(deliveries[0][1], "coaching.assignment.changed");
  const coordinatorInbox = await invoke(state, "GET /api/my-coaching-assignment-notifications", {
    actor: { username: "coordinator" },
  });
  assert.equal(coordinatorInbox.body.notifications[0].action, "cannot_attend");
  const repeated = await invoke(state, key, { body: { reason: "Schedule conflict" } });
  assert.equal(repeated.statusCode, 200);
  assert.equal(state.notifications.length, 1);
  assert.equal(deliveries.length, 1);

  const past = setup();
  past.coachRows.push({ coach_username: "coach" });
  past.lesson.lesson_date = dateOffset(-1);
  assert.equal((await invoke(past, key)).statusCode, 409);
  assert.equal(past.effects.remove, 0);

  const other = setup();
  other.coachRows.push({ coach_username: "another" });
  assert.equal((await invoke(other, key)).statusCode, 404);
  assert.equal(other.effects.remove, 0);

  const noCoordinator = setup();
  noCoordinator.coachRows.push({ coach_username: "coach" });
  noCoordinator.course.coordinator_username = "";
  assert.equal((await invoke(noCoordinator, key)).statusCode, 409);
  assert.equal(noCoordinator.notifications.length, 0);
});

test("opportunities exclude the actor's assignments and return additional-coverage sessions", async () => {
  const available = { lessonId: 21, courseId: 5, courseType: "taster-session", date: dateOffset(2), startTime: "23:59:00", endTime: "23:59:59", lessonNumber: 1, coordinatorName: "Coordinator", participantCount: 2, participantCapacity: 8, coachNames: [], isCancelled: false };
  const assigned = { ...available, lessonId: 22 };
  const state = setup({
    buildBeginnersCourseCalendarLessons: async () => [available, assigned],
    beginnersCourseReadGateway: {
      ...setup().dependencies.beginnersCourseReadGateway,
      listCoachLessonsByUserId: async () => [{ id: 22 }],
    },
  });
  const result = await invoke(state, "GET /api/my-coaching-opportunities", { params: {} });
  assert.deepEqual(result.body.lessons.map((item) => item.lessonId), [21]);
  assert.equal(result.body.lessons[0].requiredCoachCount, 5);
  assert.equal(result.body.lessons[0].coachShortfall, 5);
});

test("coordinator requirement updates validate and audit persisted coach target", async () => {
  const state = setup({
    actorHasPermission: () => true,
    getCourseTypePermissions: () => ({ manage: "manage_beginners_courses" }),
  });
  state.dependencies.beginnersCourseWriteGateway.setLessonRequiredCoachCount = async ({ requiredCoachCount }) => {
    state.lesson.required_coach_count = requiredCoachCount;
    return true;
  };
  const invalid = await invoke(state, "PUT /api/beginners-course-lessons/:id/required-coaches", { body: { requiredCoachCount: 1.5 } });
  assert.equal(invalid.statusCode, 400);
  const result = await invoke(state, "PUT /api/beginners-course-lessons/:id/required-coaches", { body: { requiredCoachCount: 3 } });
  assert.equal(result.body.requiredCoachCount, 3);
  assert.equal(state.effects.audit[0].action, "required_coach_count_changed");
});

test("assignment event targets only the course coordinator and includes current coverage", async () => {
  const deliveries = [];
  const state = setup({ broadcastToUsers: (...args) => deliveries.push(args) });
  state.dependencies.beginnersCourseWriteGateway.addLessonCoachSelf = async () => true;
  state.actor.first_name = "Coach";
  state.actor.surname = "One";
  await invoke(state, "POST /api/beginners-course-lessons/:id/volunteer");
  assert.equal(deliveries.length, 1);
  assert.deepEqual(deliveries[0][0], ["coordinator"]);
  assert.equal(deliveries[0][1], "coaching.assignment.changed");
  assert.equal(deliveries[0][2].assignedCoachCount, 1);
  assert.equal(deliveries[0][2].coachShortfall, 0);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].username, "coordinator");
  const pending = await invoke(state, "GET /api/my-coaching-assignment-notifications", { actor: { username: "coordinator" } });
  assert.equal(pending.body.notifications[0].action, "volunteered");
  assert.equal((await invoke(state, "GET /api/my-coaching-assignment-notifications", { actor: { username: "other" } })).body.notifications.length, 0);
  assert.equal((await invoke(state, "DELETE /api/my-coaching-assignment-notifications/:id", { actor: { username: "other" }, params: { id: "1" } })).statusCode, 404);
  assert.equal((await invoke(state, "DELETE /api/my-coaching-assignment-notifications/:id", { actor: { username: "coordinator" }, params: { id: "1" } })).statusCode, 200);

  deliveries.length = 0;
  state.coachRows.length = 0;
  state.course.coordinator_username = "coach";
  await invoke(state, "POST /api/beginners-course-lessons/:id/volunteer");
  assert.equal(deliveries.length, 0);
});

test("session detail is restricted to assigned coaches and includes participant details", async () => {
  const state = setup({
    beginnersCourseReadGateway: {
      ...setup().dependencies.beginnersCourseReadGateway,
      listCoachLessonsByUserId: async () => [{ id: 12, coordinator_first_name: "Coord", coordinator_surname: "One" }],
      listParticipantsByCourseId: async () => [{ username: "robin", first_name: "Robin", surname: "Hood", beginner_size_category: "junior", handedness: "left", eye_dominance: "right", draw_length: "24 in", no_show_recorded: 0 }],
      listParticipantAttendanceByDate: async () => [{ username: "robin" }],
    },
  });
  const result = await invoke(state, "GET /api/my-coaching-lessons/:id/details");
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.lesson.participants[0].firstName, "Robin");
  assert.equal(result.body.lesson.participants[0].attendanceRecorded, true);
  assert.equal(result.body.lesson.coordinatorName, "Coord One");

  state.dependencies.beginnersCourseReadGateway.listCoachLessonsByUserId = async () => [];
  assert.equal((await invoke(state, "GET /api/my-coaching-lessons/:id/details")).statusCode, 403);
});
