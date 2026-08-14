import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCoursePayload,
  getDashboardPathForCourseType,
} from "./beginnersCourseTypeSupport.js";

test("taster-session dashboards reuse the beginners dashboard endpoint with a courseType query", () => {
  assert.equal(
    getDashboardPathForCourseType("taster-session"),
    "/api/beginners-courses/dashboard?courseType=taster-session",
  );
});

test("taster-session payloads reuse the beginners course workflow with an explicit courseType", () => {
  assert.deepEqual(
    buildCoursePayload("taster-session", {
      coordinatorName: "Alex Archer",
      beginnerCapacity: 8,
    }),
    {
      coordinatorName: "Alex Archer",
      beginnerCapacity: 8,
      courseType: "taster-session",
    },
  );
});
