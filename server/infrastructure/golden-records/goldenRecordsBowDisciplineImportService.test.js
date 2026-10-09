import assert from "node:assert/strict";
import test from "node:test";
import { createGoldenRecordsBowDisciplineImportService } from "./goldenRecordsBowDisciplineImportService.js";

const runtime = { databaseEngine: "postgres", appMode: "live", postgres: { databaseName: "club", host: "db" }, goldenRecords: {} };

test("creating the live import service does not require Golden Records credentials until preview", () => {
  assert.doesNotThrow(() => createGoldenRecordsBowDisciplineImportService({ runtime, pool: { query: async () => ({ rows: [] }) } }));
});

test("live bow discipline preview is additive and apply rejects a stale preview", async () => {
  const remote = [{ member_id: "gr-1", membership_id: "agb-1", name: "Amy Bell", bow_class: "Recurve" }];
  const portal = [{ username: "amy", first_name: "Amy", surname: "Bell", gr_id: "gr-1", archery_gb_membership_number: "agb-1", active_member: 1, disciplines: ["Field"] }];
  let connections = 0;
  const service = createGoldenRecordsBowDisciplineImportService({
    runtime,
    pool: { query: async () => ({ rows: portal }), connect: async () => { connections++; throw new Error("Unexpected connection"); } },
    httpClient: { getJson: async () => ({ ok: true, body: remote }) },
  });
  const plan = await service.preview();
  assert.equal(plan.counts.add, 1);
  assert.deepEqual(plan.records[0].currentDisciplines, ["Field"]);
  remote[0] = { ...remote[0], bow_class: "Compound" };
  await assert.rejects(service.apply({ planHash: plan.planHash, actorUsername: "dev" }), /changed since the preview/);
  assert.equal(connections, 0);
});

test("apply writes the reviewed addition and audit event in one transaction", async () => {
  const queries = [];
  const client = {
    query: async (sql, args) => {
      queries.push({ sql, args });
      if (sql.includes("FOR UPDATE")) return { rows: [{ username: "amy", gr_id: "gr-1", archery_gb_membership_number: "agb-1", active_member: 1 }] };
      if (sql.includes("SELECT discipline")) return { rows: [{ discipline: "Field" }] };
      if (sql.includes("INSERT INTO user_disciplines")) return { rowCount: 1 };
      return { rows: [] };
    },
    release: () => { queries.push({ sql: "RELEASE" }); },
  };
  const service = createGoldenRecordsBowDisciplineImportService({
    runtime,
    pool: { query: async () => ({ rows: [{ username: "amy", first_name: "Amy", surname: "Bell", gr_id: "gr-1", archery_gb_membership_number: "agb-1", active_member: 1, disciplines: ["Field"] }] }), connect: async () => client },
    httpClient: { getJson: async () => ({ ok: true, body: [{ member_id: "gr-1", membership_id: "agb-1", name: "Amy Bell", bow_class: "Recurve" }] }) },
  });
  const plan = await service.preview();
  const result = await service.apply({ planHash: plan.planHash, actorUsername: "dev" });
  assert.equal(result.inserted, 1);
  assert.ok(queries.some(({ sql, args }) => sql.includes("INSERT INTO user_disciplines") && args[1] === "Recurve Bow"));
  assert.ok(queries.some(({ sql, args }) => sql.includes("INSERT INTO audit_events") && args[0] === "dev"));
  assert.deepEqual(queries.slice(-2).map(({ sql }) => sql), ["COMMIT", "RELEASE"]);
});
