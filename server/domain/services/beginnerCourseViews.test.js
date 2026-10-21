import assert from "node:assert/strict";
import test from "node:test";
import { createBeginnerCourseViews } from "./beginnerCourseViews.js";
import { normalizeCourseType } from "./beginnerCourseRules.js";

test("beginner course views keep approved calendar lessons scoped by course type", async () => {
  const courses = [
    { id: 1, course_type: "beginners", approval_status: "approved", beginner_capacity: 4 },
    { id: 2, course_type: "taster-session", approval_status: "approved", beginner_capacity: 3 },
    { id: 3, course_type: "beginners", approval_status: "pending", beginner_capacity: 4 },
  ];
  const lessons = courses.map((course) => ({ id: course.id, course_id: course.id, lesson_date: `2026-11-0${course.id}`, start_time: "10:00", end_time: "11:00", lesson_number: 1 }));
  const gateway = {
    listCourses: async () => courses,
    listLessons: async () => lessons,
    listParticipants: async () => [{ id: 10, course_id: 1 }],
    listParticipantLoginDates: async () => [],
    listLessonCoaches: async () => [],
  };
  const views = createBeginnerCourseViews({
    LEGACY_NON_MEMBER_ROLE_KEYS: new Set(["prospect"]),
    beginnersCourseReadGateway: gateway,
    getUserDisplayName: () => "",
    groupRowsBy: (rows, key, value = (row) => row) => {
      const grouped = new Map();
      for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), value(row)]);
      return grouped;
    },
    manualLessonAttendanceGateway: { listAll: async () => [] },
    normalizeCourseType,
  });
  const beginnerLessons = await views.buildBeginnersCourseCalendarLessons("beginners");
  assert.equal(beginnerLessons.length, 1);
  assert.equal(beginnerLessons[0].id, "beginners-course-1-lesson-1");
  assert.equal(beginnerLessons[0].participantCount, 1);
  assert.equal(beginnerLessons[0].placesRemaining, 3);
  const tasterLessons = await views.buildBeginnersCourseCalendarLessons("taster-session");
  assert.equal(tasterLessons.length, 1);
  assert.equal(tasterLessons[0].title, "Taster session");
});
