import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canViewCommitteeApprovalsCard,
  hasCommitteeApprovalAccess,
  isCommitteeApprovalRoleAssignee,
} from "./committeeApprovalsCardUtils.ts";

test("developer can always view the committee approvals card", () => {
  assert.equal(
    canViewCommitteeApprovalsCard({
      actorUsername: "",
      committeeRoles: [],
      userRole: "developer",
    }),
    true,
  );
});

test("assigned chairman can view the committee approvals card", () => {
  assert.equal(
    canViewCommitteeApprovalsCard({
      actorUsername: "chair.person",
      committeeRoles: [
        {
          roleKey: "chairman",
          assignedMember: {
            username: "chair.person",
          },
        },
      ],
      userRole: "general",
    }),
    true,
  );
});

test("unassigned members cannot view the committee approvals card", () => {
  assert.equal(
    canViewCommitteeApprovalsCard({
      actorUsername: "someone.else",
      committeeRoles: [
        {
          roleKey: "secretary",
          assignedMember: {
            username: "club.secretary",
          },
        },
      ],
      userRole: "general",
    }),
    false,
  );
});

test("committee approval role detection ignores non-approval committee roles", () => {
  assert.equal(
    isCommitteeApprovalRoleAssignee("member.one", [
      {
        roleKey: "treasurer",
        assignedMember: {
          username: "member.one",
        },
      },
    ]),
    false,
  );
});

test("approval access is only true when at least one approval permission is present", () => {
  assert.equal(
    hasCommitteeApprovalAccess({
      canManageBeginnersCourses: false,
      canManageHaveAGoSessions: false,
      canApproveBeginnersCourses: false,
      canApproveCoaching: false,
      canApproveEvents: false,
      canApproveHaveAGoSessions: false,
    }),
    false,
  );

  assert.equal(
    hasCommitteeApprovalAccess({
      canManageBeginnersCourses: false,
      canManageHaveAGoSessions: false,
      canApproveBeginnersCourses: false,
      canApproveCoaching: false,
      canApproveEvents: true,
      canApproveHaveAGoSessions: false,
    }),
    true,
  );
});

test("course management access is enough to load committee course counts", () => {
  assert.equal(
    hasCommitteeApprovalAccess({
      canManageBeginnersCourses: true,
      canManageHaveAGoSessions: false,
      canApproveBeginnersCourses: false,
      canApproveCoaching: false,
      canApproveEvents: false,
      canApproveHaveAGoSessions: false,
    }),
    true,
  );
});
