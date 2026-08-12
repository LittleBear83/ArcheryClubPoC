import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatMemberDisplayName,
  formatMemberDisplayUsername,
  getMembershipDisplaySuffix,
  normalizeUserProfile,
} from "./userProfile.js";

test("legacy beginner role names show a beginners non-member suffix", () => {
  const profile = {
    first_name: "Bea",
    surname: "Beginner",
    user_type: "beginner",
    username: "bea",
  };

  assert.equal(
    formatMemberDisplayName(profile),
    "Bea Beginner - (Beginners / Non-member)",
  );
  assert.equal(
    formatMemberDisplayUsername(profile),
    "bea - (Beginners / Non-member)",
  );
});

test("explicit non-member status without a programme shows a generic non-member suffix", () => {
  assert.equal(
    getMembershipDisplaySuffix({
      membershipStatus: "non-member",
      programmeType: "none",
    }),
    " - (Non-member)",
  );
});

test("explicit taster-session programme shows a taster non-member suffix", () => {
  const profile = {
    firstName: "Tia",
    surname: "Taster",
    membershipStatus: "non-member",
    programmeType: "taster-session",
  };

  assert.equal(
    formatMemberDisplayName(profile),
    "Tia Taster - (Taster Session / Non-member)",
  );
});

test("normalized user profiles carry the new non-member display wording", () => {
  const normalized = normalizeUserProfile({
    username: "harry",
    firstName: "Harry",
    surname: "Go",
    userType: "have-a-go",
  });

  assert.equal(
    normalized.personal.fullName,
    "Harry Go - (Have a Go / Non-member)",
  );
  assert.equal(normalized.membership.status, "non-member");
  assert.equal(normalized.membership.programmeType, "have-a-go");
});
