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
          affiliate_member: 0,
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
    affiliateMember: true,
    coachingVolunteer: false,
    disciplines: ["Recurve Bow"],
    existingUser: null,
    firstName: "Alice",
    loanBow: null,
    membershipStatus: "member",
    membershipFeesDue: "2026-04-01",
    password: "secret",
    programmeType: "none",
    rfidTag: "TAG-1",
    surname: "Example",
    userType: "general",
    username: "alice",
  });

  assert.equal(capturedPayload.userPayload.activeMember, 0);
  assert.equal(capturedPayload.userPayload.affiliateMember, 1);
  assert.equal(capturedPayload.userPayload.rfidTag, "TAG-1-deactivated");
  assert.equal(capturedPayload.userPayload.password, "hashed:secret");
  assert.equal(capturedPayload.userPayload.membershipStatus, "member");
  assert.equal(capturedPayload.userPayload.programmeType, "none");
  assert.equal(result.success, true);
});

test("saveMemberProfile keeps legacy role keys while inferring new classification fields", async () => {
  let capturedPayload = null;
  const memberPersistenceService = createMemberPersistenceService({
    buildEditableMemberProfile: () => ({ editable: true }),
    buildMemberUserProfile: () => ({ profile: true }),
    deactivatedRfidSuffix: "-deactivated",
    hashPassword: (password) => `hashed:${password}`,
    memberAuthGateway: {
      async findUserByUsername(username) {
        return {
          id: 8,
          username,
          first_name: "Bea",
          surname: "Beginner",
          user_type: "beginner",
          active_member: 0,
          affiliate_member: 0,
          membership_fees_due: null,
          coaching_volunteer: 0,
          membership_status: "non-member",
          programme_type: "beginners",
          rfid_tag: null,
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
    activeMember: false,
    affiliateMember: false,
    coachingVolunteer: false,
    disciplines: [],
    existingUser: null,
    firstName: "Bea",
    loanBow: null,
    membershipStatus: "",
    membershipFeesDue: "",
    password: "secret",
    programmeType: "",
    rfidTag: "",
    surname: "Beginner",
    userType: "beginner",
    username: "bea",
  });

  assert.equal(capturedPayload.userType, "beginner");
  assert.equal(capturedPayload.userPayload.membershipStatus, "non-member");
  assert.equal(capturedPayload.userPayload.programmeType, "beginners");
  assert.equal(result.success, true);
});

test("saveMemberProfile clears unsupported programme types from guest accounts", async () => {
  let capturedPayload = null;
  const memberPersistenceService = createMemberPersistenceService({
    buildEditableMemberProfile: () => ({ editable: true }),
    buildMemberUserProfile: () => ({ profile: true }),
    deactivatedRfidSuffix: "-deactivated",
    hashPassword: (password) => `hashed:${password}`,
    memberAuthGateway: {
      async findUserByUsername(username) {
        return {
          id: 9,
          username,
          first_name: "Gia",
          surname: "Guest",
          user_type: "general",
          active_member: 0,
          affiliate_member: 0,
          membership_fees_due: null,
          coaching_volunteer: 0,
          membership_status: "guest",
          programme_type: "none",
          rfid_tag: null,
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
    activeMember: false,
    affiliateMember: false,
    coachingVolunteer: false,
    disciplines: [],
    existingUser: null,
    firstName: "Gia",
    loanBow: null,
    membershipStatus: "guest",
    membershipFeesDue: "",
    password: "secret",
    programmeType: "taster-session",
    rfidTag: "",
    surname: "Guest",
    userType: "general",
    username: "gia",
  });

  assert.equal(capturedPayload.userPayload.membershipStatus, "guest");
  assert.equal(capturedPayload.userPayload.programmeType, "none");
  assert.equal(result.success, true);
});

function rfidPersistenceHarness() {
  const saved = [];
  const service = createMemberPersistenceService({
    buildEditableMemberProfile: () => ({}), buildMemberUserProfile: () => ({}),
    deactivatedRfidSuffix: '-deactivated', hashPassword: (value) => value,
    memberAuthGateway: { findUserByUsername: async () => ({ username: 'Canonical' }) },
    memberProfileGateway: { roleExists: async () => true, findLoanBowByUsername: async () => null,
      saveMemberProfile: async (payload) => saved.push(payload) },
    sanitizeDisciplines: () => [], sanitizeLoanBow: () => ({}),
  });
  const input = { username: 'canonical', firstName: 'Member', surname: 'Example',
    userType: 'member', existingUser: { username: 'Canonical', password: 'hash', rfid_tag: 'OLD' },
    syncContext: { nodeMode: 'local-pi', canManageMembers: true, actorUsername: 'Admin' },
    rfidTag: ' NEW ' };
  return { service, saved, input };
}

for (const [name, rfidTag, context, existing, expected] of [
  ['unchanged', ' old ', 'local-pi', true, undefined],
  ['changed Pi', ' NEW ', 'local-pi', true, 'NEW'],
  ['clear', ' ', 'local-pi', true, null],
  ['cloud', 'NEW', 'cloud-server', true, 'NEW'],
  ['new Pi member', 'NEW', 'local-pi', false, undefined],
]) {
  test(`RFID persistence ${name} supplies only eligible sync context`, async () => {
    const { service, saved, input } = rfidPersistenceHarness();
    input.rfidTag = rfidTag;
    input.syncContext.nodeMode = context;
    if (!existing) { input.existingUser = null; input.password = 'new-password'; }
    assert.equal((await service.saveMemberProfile(input)).success, true);
    if (!existing) assert.equal(saved[0].rfidSync, undefined);
    else {
      if (expected !== undefined) assert.equal(saved[0].userPayload.rfidTag, expected);
      assert.deepEqual(saved[0].rfidSync, { sourceNodeMode: context, updatedByUsername: 'Admin', requestedRfidTag: rfidTag.trim() || null });
    }
  });
}

test('self edit cannot alter RFID or enqueue and pending failure returns 409', async () => {
  const { service, saved, input } = rfidPersistenceHarness();
  input.syncContext.canManageMembers = false;
  assert.equal((await service.saveMemberProfile(input)).success, true);
  assert.equal(saved[0].userPayload.rfidTag, 'OLD');
  assert.equal(saved[0].rfidSync, undefined);
  const pending = rfidPersistenceHarness();
  // Exercise the service error mapping with a transaction failure adapter.
  pending.saved.push = () => { const error = new Error('pending'); error.code = 'rfid_update_pending'; throw error; };
  const result = await pending.service.saveMemberProfile(pending.input);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'rfid_update_pending');
});
