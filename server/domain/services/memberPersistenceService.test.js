import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMemberPersistenceService,
  getDeactivatedRfidTag,
  normalizeMemberStatusWithFees,
} from "./memberPersistenceService.js";

test("getDeactivatedRfidTag appends the suffix once", () => {
  assert.equal(getDeactivatedRfidTag("ABC123", "-deactivated"), "ABC123-deactivated");
  assert.equal(
    getDeactivatedRfidTag("ABC123-deactivated", "-deactivated"),
    "ABC123-deactivated",
  );
  assert.equal(getDeactivatedRfidTag("", "-deactivated"), null);
});

test("normalizeMemberStatusWithFees deactivates overdue members", () => {
  const normalized = normalizeMemberStatusWithFees(
    {
      active_member: 1,
      membership_fees_due: "2026-04-01",
      rfid_tag: "TAG-1",
      username: "alice",
    },
    {
      deactivatedRfidSuffix: "-deactivated",
      now: new Date("2026-04-28T12:00:00.000Z"),
    },
  );

  assert.equal(normalized.active_member, 0);
  assert.equal(normalized.rfid_tag, "TAG-1-deactivated");
  assert.equal(normalized.requiresMembershipStatusSync, true);
});

test("saveMemberProfile uses normalized member status before persistence", async () => {
  let capturedPayload = null;
  const memberPersistenceService = createMemberPersistenceService({
    buildEditableMemberProfile: () => ({ editable: true }),
    buildMemberUserProfile: () => ({ profile: true }),
    deactivatedRfidSuffix: "-deactivated",
    hashPassword: (password) => `hashed:${password}`,
    memberAuthGateway: {
      async findUserByUsername(username) {
        return {
          id: 7,
          username,
          first_name: "Alice",
          surname: "Example",
          user_type: "general",
          active_member: 0,
          membership_fees_due: "2026-04-01",
          coaching_volunteer: 0,
          rfid_tag: "TAG-1-deactivated",
        };
      },
    },
    memberProfileGateway: {
      async findLoanBowByUsername() {
        return null;
      },
      async roleExists() {
        return true;
      },
      async saveMemberProfile(payload) {
        capturedPayload = payload;
      },
    },
    sanitizeDisciplines: (disciplines) => disciplines,
    sanitizeLoanBow: (loanBow) => loanBow,
  });

  const result = await memberPersistenceService.saveMemberProfile({
    activeMember: true,
    coachingVolunteer: false,
    disciplines: ["Recurve Bow"],
    existingUser: null,
    firstName: "Alice",
    loanBow: null,
    membershipFeesDue: "2026-04-01",
    password: "secret",
    rfidTag: "TAG-1",
    surname: "Example",
    userType: "general",
    username: "alice",
  });

  assert.equal(capturedPayload.userPayload.activeMember, 0);
  assert.equal(capturedPayload.userPayload.rfidTag, "TAG-1-deactivated");
  assert.equal(capturedPayload.userPayload.password, "hashed:secret");
  assert.equal(result.success, true);
});

