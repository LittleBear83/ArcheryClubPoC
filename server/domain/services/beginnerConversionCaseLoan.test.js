import assert from "node:assert/strict";
import test from "node:test";
import { loanAssignedCaseForBeginnerConversion } from "./beginnerConversionCaseLoan.js";

test("case conversion loans the case and contents with one expected return date", async () => {
  const loans = [];
  const storage = [];
  const caseItem = { id: 24, equipment_type: "case", status: "active", location_type: "cupboard" };
  const equipmentGateway = {
    findEquipmentItemById: async () => caseItem,
    findOpenEquipmentLoanByItemId: async (id) => loans.find((loan) => loan[0] === id) ?? null,
    listEquipmentItemsByCaseId: async () => [{ id: 25 }, { id: 26 }],
    createEquipmentLoan: async (...args) => { loans.push(args); },
    updateEquipmentItemStorage: async (payload) => { storage.push(payload); },
    updateEquipmentAssignmentMetadata: async () => {},
  };
  const args = {
    caseId: 24, equipmentGateway, caseEquipmentType: "case", memberLocationType: "member",
    memberUsername: "jkettley", actorUsername: "coordinator", convertedAtDate: "2026-09-30",
    convertedAtTime: "10:00:00", expectedReturnDate: "2026-10-30",
  };

  await loanAssignedCaseForBeginnerConversion(args);
  assert.deepEqual(loans.map((loan) => [loan[0], loan[5], loan[6]]), [
    [24, null, "2026-10-30"],
    [25, 24, "2026-10-30"],
    [26, 24, "2026-10-30"],
  ]);
  assert.equal(storage[0].locationType, "member");
  assert.equal(storage[0].locationMemberUsername, "jkettley");

  await assert.rejects(() => loanAssignedCaseForBeginnerConversion(args), /already on loan/);
  assert.equal(loans.length, 3);
});

test("an open contained-item loan blocks case conversion before any new loan", async () => {
  let writes = 0;
  const equipmentGateway = {
    findEquipmentItemById: async () => ({ id: 24, equipment_type: "case", status: "active", location_type: "cupboard" }),
    findOpenEquipmentLoanByItemId: async (id) => id === 25 ? { id: 9 } : null,
    listEquipmentItemsByCaseId: async () => [{ id: 25 }],
    createEquipmentLoan: async () => { writes += 1; },
  };
  await assert.rejects(
    () => loanAssignedCaseForBeginnerConversion({
      caseId: 24, equipmentGateway, caseEquipmentType: "case", memberLocationType: "member",
      memberUsername: "jkettley", actorUsername: "coordinator", convertedAtDate: "2026-09-30",
      convertedAtTime: "10:00:00", expectedReturnDate: "2026-10-30",
    }),
    /contains equipment that is already on loan/,
  );
  assert.equal(writes, 0);
});
