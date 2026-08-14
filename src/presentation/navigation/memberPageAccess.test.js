import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAccessMemberPage,
  getRestrictedPageMessage,
  isPageRestrictedForProgrammeUsers,
} from "./memberPageAccess.js";

test("programme participants cannot access restricted member pages", () => {
  const profile = {
    membership: {
      role: "beginner",
      status: "non-member",
      programmeType: "beginners",
    },
  };

  assert.equal(isPageRestrictedForProgrammeUsers("event-calendar"), true);
  assert.equal(canAccessMemberPage("event-calendar", profile), false);
  assert.equal(
    getRestrictedPageMessage("event-calendar", profile),
    "This area is not available for programme participants yet.",
  );
});

test("programme participants can still access allowed baseline pages", () => {
  const profile = {
    membership: {
      role: "have-a-go",
      status: "non-member",
      programmeType: "have-a-go",
    },
  };

  assert.equal(canAccessMemberPage("range-rules", profile), true);
  assert.equal(canAccessMemberPage("ask-a-question", profile), true);
  assert.equal(canAccessMemberPage("general-info", profile), true);
});

test("full members keep access to restricted member pages", () => {
  const profile = {
    membership: {
      role: "general",
      status: "member",
      programmeType: "none",
    },
  };

  assert.equal(canAccessMemberPage("records", profile), true);
  assert.equal(getRestrictedPageMessage("records", profile), "");
});

test("guest accounts are not treated as programme participants", () => {
  const profile = {
    membership: {
      role: "guest",
      status: "guest",
      programmeType: "none",
    },
  };

  assert.equal(canAccessMemberPage("lost-and-found", profile), true);
});
