import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSafeIntegrationEnvironment,
  assertSafeTemporaryDatabaseName,
} from "./phase2a1PostgresIntegrationGuards.js";

const validEnvironment = {
  ARCHERY_POSTGRES_INTEGRATION_TESTS: "1",
  NODE_ENV: "test",
  PGDATABASE: "postgres",
  PGHOST: "127.0.0.1",
};

test("Phase 2A1 PostgreSQL safety guard rejects unsafe integration environments", () => {
  const cases = [
    ["NODE_ENV is not test", { ...validEnvironment, NODE_ENV: "production" }],
    ["integration flag is missing", { ...validEnvironment, ARCHERY_POSTGRES_INTEGRATION_TESTS: undefined }],
    ["integration flag is not 1", { ...validEnvironment, ARCHERY_POSTGRES_INTEGRATION_TESTS: "true" }],
    ["Unix socket host", { ...validEnvironment, PGHOST: "/var/run/postgresql" }],
    ["Cloud SQL-like host", { ...validEnvironment, PGHOST: "archeryportal.cloudsql.example" }],
    ["production database", { ...validEnvironment, PGDATABASE: "archeryportal" }],
    ["unapproved maintenance database", { ...validEnvironment, PGDATABASE: "template1" }],
  ];

  for (const [name, environment] of cases) {
    assert.throws(() => assertSafeIntegrationEnvironment(environment), undefined, name);
  }
});

test("Phase 2A1 PostgreSQL safety guard accepts only the expected CI environment", () => {
  assert.doesNotThrow(() => assertSafeIntegrationEnvironment(validEnvironment));
});

test("Phase 2A1 PostgreSQL create and drop target guard rejects unsafe names", () => {
  for (const databaseName of ["archeryportal", "postgres", "archery_phase2a_test_x", "", null]) {
    assert.throws(() => assertSafeTemporaryDatabaseName(databaseName));
  }
});

test("Phase 2A1 PostgreSQL create and drop target guard accepts generated test names", () => {
  assert.doesNotThrow(() => assertSafeTemporaryDatabaseName("archery_phase2a1_test_cloud_0123abcd"));
});
