import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getMembershipStatus,
  getProgrammeType,
  isBeginnersProgrammeUser,
  isGuestUser,
  isHaveAGoProgrammeUser,
  isNonMemberUser,
  isProgrammeUser,
  isTasterProgrammeUser,
} from "./membershipClassification.js";

test("legacy beginner roles infer non-member beginners classification", () => {
  const profile = { user_type: "beginner" };

  assert.equal(getMembershipStatus(profile), "non-member");
  assert.equal(getProgrammeType(profile), "beginners");
  assert.equal(isNonMemberUser(profile), true);
  assert.equal(isProgrammeUser(profile), true);
  assert.equal(isBeginnersProgrammeUser(profile), true);
});

test("legacy have-a-go roles infer non-member have-a-go classification", () => {
  const profile = { userType: "have-a-go" };

  assert.equal(getMembershipStatus(profile), "non-member");
  assert.equal(getProgrammeType(profile), "have-a-go");
  assert.equal(isHaveAGoProgrammeUser(profile), true);
});

test("guest accounts stay separate from programme participants", () => {
  const profile = { membershipStatus: "guest", programmeType: "none" };

  assert.equal(isGuestUser(profile), true);
  assert.equal(isProgrammeUser(profile), false);
});

test("taster participants are recognized from explicit programme type", () => {
  const profile = {
    membership: {
      role: "general",
      status: "non-member",
      programmeType: "taster-session",
    },
  };

  assert.equal(isNonMemberUser(profile), true);
  assert.equal(isProgrammeUser(profile), true);
  assert.equal(isTasterProgrammeUser(profile), true);
});
