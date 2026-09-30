import assert from "node:assert/strict";
import test from "node:test";
import { loanAssignedCaseForBeginnerConversion, validateAssignedCaseForBeginnerConversion } from "./beginnerConversionCaseLoan.js";
import { runBeginnerConversion } from "./runBeginnerConversion.js";

function createHarness({ assignedCase = true, invalidCase = false, openLoan = false, failLoanWrite = false } = {}) {
  const state = { role: "beginner", converted: 0, convertedAtDate: null, convertedAtTime: null,
    convertedByUsername: null, loans: [], storage: "cupboard" };
  const gateway = {
    findEquipmentItemById: async () => invalidCase ? null : {
      id: 24, equipment_type: "case", status: "active", location_type: "cupboard",
    },
    findOpenEquipmentLoanByItemId: async (id) => openLoan && id === 24
      ? { id: 10 } : state.loans.find((loan) => loan[0] === id) ?? null,
    listEquipmentItemsByCaseId: async () => [{ id: 25 }],
    createEquipmentLoan: async (...args) => {
      if (failLoanWrite && args[0] === 25) throw new Error("loan write failed");
      state.loans.push(args);
    },
    updateEquipmentItemStorage: async () => { state.storage = "member"; },
    updateEquipmentAssignmentMetadata: async () => {},
  };
  const caseArgs = { caseId: 24, equipmentGateway: gateway, caseEquipmentType: "case",
    memberLocationType: "member", memberUsername: "legacy", actorUsername: "coach",
    convertedAtDate: "2026-09-30", convertedAtTime: "12:34:56", expectedReturnDate: "2026-10-30" };
  const run = () => runBeginnerConversion({
    inTransaction: async (operation) => {
      const before = structuredClone(state);
      try { return await operation(null); } catch (error) {
        Object.assign(state, before);
        throw error;
      }
    },
    prepareCase: assignedCase ? () => validateAssignedCaseForBeginnerConversion(caseArgs) : null,
    saveMembership: async () => { state.role = "member"; return { success: true }; },
    loanCase: (preparedCase) => loanAssignedCaseForBeginnerConversion({ ...caseArgs, preparedCase }),
    markParticipant: async () => {
      state.converted = 1;
      state.convertedAtDate = "2026-09-30";
      state.convertedAtTime = "12:34:56";
      state.convertedByUsername = "coach";
    },
  });
  return { state, run };
}

test("invalid assigned case does not convert a legacy user or participant", async () => {
  const { state, run } = createHarness({ invalidCase: true });
  await assert.rejects(run, /assigned case could not be found/);
  assert.equal(state.role, "beginner");
  assert.equal(state.converted, 0);
  assert.equal(state.loans.length, 0);
});

test("duplicate open case loan blocks membership conversion", async () => {
  const { state, run } = createHarness({ openLoan: true });
  await assert.rejects(run, /already on loan/);
  assert.equal(state.role, "beginner");
  assert.equal(state.converted, 0);
  assert.equal(state.loans.length, 0);
});

test("loan write failure rolls back membership, participant, and case loan", async () => {
  const { state, run } = createHarness({ failLoanWrite: true });
  await assert.rejects(run, /loan write failed/);
  assert.equal(state.role, "beginner");
  assert.equal(state.converted, 0);
  assert.equal(state.loans.length, 0);
  assert.equal(state.storage, "cupboard");
});

test("assigned-case success converts membership and participant and loans case and contents", async () => {
  const { state, run } = createHarness();
  await run();
  assert.equal(state.role, "member");
  assert.deepEqual([state.converted, state.convertedAtDate, state.convertedAtTime, state.convertedByUsername],
    [1, "2026-09-30", "12:34:56", "coach"]);
  assert.deepEqual(state.loans.map((loan) => [loan[0], loan[6]]),
    [[24, "2026-10-30"], [25, "2026-10-30"]]);
  assert.equal(state.storage, "member");
  await assert.rejects(run, /already on loan/);
  assert.equal(state.loans.length, 2);
});

test("conversion without an assigned case still converts membership and participant", async () => {
  const { state, run } = createHarness({ assignedCase: false });
  await run();
  assert.equal(state.role, "member");
  assert.equal(state.converted, 1);
  assert.equal(state.loans.length, 0);
});
