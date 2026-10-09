import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoldenRecordsBowDisciplineImportPlan,
  hashGoldenRecordsBowDisciplinePlan,
  mapGoldenRecordsBowClassToDiscipline,
} from "./goldenRecordsBowDisciplineImport.js";

test("maps the supported Golden Records bow classes to portal disciplines", () => {
  assert.equal(mapGoldenRecordsBowClassToDiscipline(" Recurve "), "Recurve Bow");
  assert.equal(mapGoldenRecordsBowClassToDiscipline("Compound"), "Compound Bow");
  assert.equal(mapGoldenRecordsBowClassToDiscipline("Barebow"), "Bare Bow");
  assert.equal(mapGoldenRecordsBowClassToDiscipline("Longbow"), "Long Bow");
  assert.equal(mapGoldenRecordsBowClassToDiscipline("Other"), "");
});

test("plans an additive import by Golden Records ID and preserves other disciplines", () => {
  const plan = createGoldenRecordsBowDisciplineImportPlan({
    goldenRecordsMembers: [
      { member_id: "gr-1", membership_id: "agb-1", name: "Alex Archer", bow_class: "Compound" },
    ],
    portalMembers: [
      { username: "alex", active_member: 1, gr_id: "gr-1", archery_gb_membership_number: "agb-1", disciplines: ["Field"] },
    ],
  });
  assert.equal(plan.records[0].status, "add");
  assert.equal(plan.records[0].discipline, "Compound Bow");
  assert.deepEqual(plan.records[0].currentDisciplines, ["Field"]);
  assert.equal(plan.records[0].matchSource, "golden-records-id");
});

test("uses an exact membership number when a stored Golden Records ID is stale", () => {
  const plan = createGoldenRecordsBowDisciplineImportPlan({
    goldenRecordsMembers: [
      { member_id: "gr-1", membership_id: "agb-1", name: "Alex Archer", bow_class: "Recurve" },
    ],
    portalMembers: [
      { username: "alex", active_member: 1, gr_id: "old-id", archery_gb_membership_number: "agb-1", disciplines: [] },
    ],
  });
  assert.equal(plan.records[0].status, "add");
  assert.equal(plan.records[0].matchSource, "membership-number");
});

test("skips conflicting, duplicate and unsupported source records", () => {
  const plan = createGoldenRecordsBowDisciplineImportPlan({
    goldenRecordsMembers: [
      { member_id: "gr-1", membership_id: "agb-1", name: "Alex Archer", bow_class: "Recurve" },
      { member_id: "gr-2", membership_id: "agb-2", name: "Blair Archer", bow_class: "Other" },
      { member_id: "gr-3", membership_id: "agb-3", name: "Casey Archer", bow_class: "Barebow" },
      { member_id: "gr-4", membership_id: "agb-3", name: "Casey Duplicate", bow_class: "Longbow" },
    ],
    portalMembers: [
      { username: "alex", active_member: 1, gr_id: "gr-1", archery_gb_membership_number: "agb-2", disciplines: [] },
      { username: "blair", active_member: 1, gr_id: "gr-2", archery_gb_membership_number: "agb-2", disciplines: [] },
      { username: "casey", active_member: 1, gr_id: "", archery_gb_membership_number: "agb-3", disciplines: [] },
    ],
  });
  assert.equal(plan.records.find((row) => row.username === "alex").status, "skip");
  assert.equal(plan.records.find((row) => row.username === "blair").status, "skip");
  assert.equal(plan.records.find((row) => row.username === "casey").status, "skip");
});

test("does not guess matches by name and excludes inactive portal accounts", () => {
  const plan = createGoldenRecordsBowDisciplineImportPlan({
    goldenRecordsMembers: [{ member_id: "gr-1", membership_id: "agb-1", name: "Alex Archer", bow_class: "Recurve" }],
    portalMembers: [
      { username: "alex", active_member: 1, first_name: "Alex", surname: "Archer", disciplines: [] },
      { username: "inactive", active_member: 0, gr_id: "gr-1", disciplines: [] },
    ],
  });
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0].status, "skip");
  assert.match(plan.records[0].reason, /exact Golden Records ID or membership/);
});

test("treats existing target disciplines as unchanged and hashes deterministically", () => {
  const input = {
    goldenRecordsMembers: [{ member_id: "gr-1", membership_id: "agb-1", name: "Alex Archer", bow_class: "Recurve" }],
    portalMembers: [{ username: "alex", active_member: true, gr_id: "gr-1", archery_gb_membership_number: "agb-1", disciplines: ["recurve bow"] }],
  };
  const first = createGoldenRecordsBowDisciplineImportPlan(input);
  const second = createGoldenRecordsBowDisciplineImportPlan(input);
  assert.equal(first.records[0].status, "unchanged");
  assert.equal(first.planHash, second.planHash);
  assert.equal(first.planHash, hashGoldenRecordsBowDisciplinePlan(first.records));
});
