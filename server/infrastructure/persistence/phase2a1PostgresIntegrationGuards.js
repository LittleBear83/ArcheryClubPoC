const TEST_DATABASE_PREFIX = "archery_phase2a1_test_";
const TEST_MAINTENANCE_DATABASE = "postgres";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertSafeIntegrationEnvironment(environment) {
  for (const name of ["NODE_ENV", "ARCHERY_POSTGRES_INTEGRATION_TESTS", "PGHOST", "PGDATABASE"]) {
    if (!environment[name]) {
      throw new Error(`${name} must be set for PostgreSQL integration tests`);
    }
  }

  if (environment.NODE_ENV !== "test") {
    throw new Error("NODE_ENV must be test for PostgreSQL integration tests");
  }
  if (environment.ARCHERY_POSTGRES_INTEGRATION_TESTS !== "1") {
    throw new Error("ARCHERY_POSTGRES_INTEGRATION_TESTS must be 1");
  }
  if (!loopbackHosts.has(environment.PGHOST)) {
    throw new Error("only a loopback PostgreSQL host is permitted");
  }
  if (environment.PGDATABASE !== TEST_MAINTENANCE_DATABASE) {
    throw new Error(`the maintenance database must be ${TEST_MAINTENANCE_DATABASE}`);
  }
}

export function assertSafeTemporaryDatabaseName(databaseName) {
  if (typeof databaseName !== "string" || !databaseName.startsWith(TEST_DATABASE_PREFIX)) {
    throw new Error(`temporary PostgreSQL database names must begin with ${TEST_DATABASE_PREFIX}`);
  }
}

export { TEST_DATABASE_PREFIX };
