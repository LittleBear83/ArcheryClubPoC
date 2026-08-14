import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeMembershipClassification,
  normalizeMembershipClassification,
} from "./memberClassification.ts";

test("programme types force non-member status", () => {
  assert.deepEqual(
    normalizeMembershipClassification({
      membershipStatus: "member",
      programmeType: "have-a-go",
    }),
    {
      membershipStatus: "non-member",
      programmeType: "have-a-go",
    },
  );
});

test("switching to guest clears programme type", () => {
  assert.deepEqual(
    normalizeMembershipClassification(
      {
        membershipStatus: "guest",
        programmeType: "beginners",
      },
      "membershipStatus",
    ),
    {
      membershipStatus: "guest",
      programmeType: "none",
    },
  );
});

test("selecting a programme converts guest users to non-members", () => {
  assert.deepEqual(
    normalizeMembershipClassification(
      {
        membershipStatus: "guest",
        programmeType: "taster-session",
      },
      "programmeType",
    ),
    {
      membershipStatus: "non-member",
      programmeType: "taster-session",
    },
  );
});

test("membership description explains guest accounts", () => {
  assert.equal(
    describeMembershipClassification({
      membershipStatus: "guest",
      programmeType: "none",
    }),
    "Guest accounts are separate from programme participants and should not carry a programme type.",
  );
});

test("steady-state guest accounts clear unsupported programme types", () => {
  assert.deepEqual(
    normalizeMembershipClassification({
      membershipStatus: "guest",
      programmeType: "taster-session",
    }),
    {
      membershipStatus: "guest",
      programmeType: "none",
    },
  );
});
