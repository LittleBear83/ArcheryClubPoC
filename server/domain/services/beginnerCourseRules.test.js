import assert from "node:assert/strict";
import test from "node:test";
import {
  getCourseParticipantMembershipStatus,
  getCourseParticipantProgrammeType,
  getCourseParticipantUserType,
  normalizeCourseType,
} from "./beginnerCourseRules.js";

test("course participant identity rules preserve each programme and legacy fallback", () => {
  for (const type of ["beginners", "have-a-go", "taster-session"]) {
    assert.equal(normalizeCourseType(type), type);
    assert.equal(getCourseParticipantProgrammeType(type), type);
    assert.equal(getCourseParticipantUserType(type), "prospect");
  }
  assert.equal(normalizeCourseType("unknown"), "beginners");
  assert.equal(getCourseParticipantProgrammeType("unknown"), "beginners");
  assert.equal(getCourseParticipantMembershipStatus(), "non-member");
});
