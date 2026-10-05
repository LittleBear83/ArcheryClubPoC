import assert from "node:assert/strict";
import { test } from "node:test";
import { createAuditLogGateway } from "./auditLogGateway.js";

test("human audit report excludes historical sync checkpoint requests", async () => {
  let sql;
  const gateway = createAuditLogGateway({
    databaseEngine: "postgres",
    pool: { async query(statement) { sql = statement; return { rows: [] }; } },
  });
  await gateway.listAuditEvents();
  assert.match(sql, /target NOT LIKE '\/api\/sync\/%'/);
});
