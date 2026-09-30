import assert from "node:assert/strict";
import test from "node:test";
import { registerEquipmentRoutes } from "./registerEquipmentRoutes.js";

const today = () => new Date().toISOString().slice(0, 10);
const offsetDate = (days) => {
  const date = new Date(`${today()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

function harness({ itemType = "riser", contents = [], loans = [], items = [] } = {}) {
  const routes = new Map();
  const created = [];
  const item = { id: 1, equipment_type: itemType, status: "active", item_number: "A1" };
  const gateway = {
    findEquipmentItemById: async (id) => id === 1 ? item : { id, status: "active", equipment_type: "case" },
    findEquipmentItemByIdWithRelations: async () => item,
    findOpenEquipmentLoanByItemId: async () => null,
    listEquipmentItemsByCaseId: async () => contents,
    createEquipmentLoan: async (...args) => created.push(args),
    updateEquipmentItemStorage: async () => {},
    updateEquipmentAssignmentMetadata: async () => {},
    listEquipmentStorageLocations: async () => [],
  };
  registerEquipmentRoutes({
    app: {
      get: (path, fn) => routes.set(`GET ${path}`, fn),
      post: (path, fn) => routes.set(`POST ${path}`, fn),
      delete: (path, fn) => routes.set(`DELETE ${path}`, fn),
      put: (path, fn) => routes.set(`PUT ${path}`, fn),
      patch: (path, fn) => routes.set(`PATCH ${path}`, fn),
    },
    actorHasPermission: () => true,
    buildEquipmentCaseResponse: () => ({}),
    buildEquipmentItemResponse: (row) => ({ id: row.id, label: `Item ${row.id}`, status: "active", type: "riser", typeLabel: "Riser" }),
    buildEquipmentMaps: async () => ({ items, loans, openLoanByItemId: new Map() }),
    DEFAULT_EQUIPMENT_CUPBOARD_LABEL: "Main Cupboard",
    EQUIPMENT_LOCATION_TYPES: { CASE: "case", MEMBER: "member" },
    EQUIPMENT_SIZE_CATEGORIES: [],
    EQUIPMENT_TYPES: { CASE: "case", ARROWS: "arrows" },
    EQUIPMENT_TYPE_LABELS: {},
    EQUIPMENT_TYPE_OPTIONS: [],
    equipmentGateway: gateway,
    getActorUser: () => ({ username: "staff" }),
    getUtcTimestampParts: () => [today(), "12:00:00"],
    memberDirectoryGateway: {
      findUserByUsername: async (name) => ({ username: name }),
      listAllUsers: async () => [],
    },
    PERMISSIONS: {
      ASSIGN_EQUIPMENT: "assign", ADD_DECOMMISSION_EQUIPMENT: "add",
      RETURN_EQUIPMENT: "return", UPDATE_EQUIPMENT_STORAGE: "storage",
      MANAGE_EQUIPMENT_STORAGE_LOCATIONS: "locations",
    },
    sanitizeCupboardLabel: (value) => value,
    sanitizeEquipmentCorrectionPayload: () => ({}),
    sanitizeEquipmentCreatePayload: () => ({}),
    validateCaseAssignment: async () => null,
  });
  async function request(method, path, body = {}) {
    let status = 200;
    let payload;
    const res = { status(code) { status = code; return this; }, json(value) { payload = value; return this; } };
    await routes.get(`${method} ${path}`)({ body }, res);
    return { status, payload };
  }
  return { request, created };
}

test("member assignment requires a valid present or future UTC date", async () => {
  const { request, created } = harness();
  for (const date of [undefined, "", "2026-02-30", "tomorrow", offsetDate(-1)]) {
    const result = await request("POST", "/api/equipment/assignments", {
      itemId: 1, targetType: "member", memberUsername: "borrower", expectedReturnDate: date,
    });
    assert.equal(result.status, 400);
  }
  assert.equal(created.length, 0);
});

test("normal item and case contents retain the same expected return date", async () => {
  const due = offsetDate(21);
  const ordinary = harness();
  assert.equal((await ordinary.request("POST", "/api/equipment/assignments", {
    itemId: 1, targetType: "member", memberUsername: "borrower", expectedReturnDate: due,
  })).status, 200);
  assert.equal(ordinary.created[0][6], due);

  const caseLoan = harness({ itemType: "case", contents: [{ id: 2 }, { id: 3 }] });
  assert.equal((await caseLoan.request("POST", "/api/equipment/assignments", {
    itemId: 1, targetType: "member", memberUsername: "borrower", expectedReturnDate: due,
  })).status, 200);
  assert.deepEqual(caseLoan.created.map((args) => [args[0], args[6]]), [[1, due], [2, due], [3, due]]);
});

test("assignment into a case does not require an expected return date", async () => {
  const { request, created } = harness();
  assert.equal((await request("POST", "/api/equipment/assignments", {
    itemId: 1, targetType: "case", caseId: 2,
  })).status, 200);
  assert.equal(created.length, 0);
});

test("dashboard excludes returned loans and separates overdue from the next 14 days", async () => {
  const loan = (id, days, returned = false) => ({
    id, equipment_item_id: id, member_username: "borrower",
    expected_return_date: offsetDate(days), returned_at_date: returned ? today() : null,
  });
  const { request } = harness({
    items: [1, 2, 3, 4, 5, 6].map((id) => ({ id, equipment_type: "riser" })),
    loans: [loan(1, -1), loan(2, 0), loan(3, 14), loan(4, 15), loan(5, -2, true), loan(6, 7, true)],
  });
  const { payload } = await request("GET", "/api/equipment/dashboard");
  assert.equal(payload.analytics.summary.overdueLoansCount, 1);
  assert.equal(payload.analytics.summary.dueWithin14DaysCount, 2);
  assert.deepEqual(payload.analytics.overdueLoans.map((row) => row.id), [1]);
  assert.deepEqual(payload.analytics.dueWithin14DaysLoans.map((row) => row.id), [2, 3]);
});
