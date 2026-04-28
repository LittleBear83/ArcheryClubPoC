import assert from "node:assert/strict";
import { test } from "node:test";
import { runPostgresMigrations } from "./runPostgresMigrations.js";

function createPoolDouble({ schemaApplied = true } = {}) {
  const queries = [];
  const client = {
    async query(sql, values) {
      const normalizedSql = String(sql).trim().replace(/\s+/g, " ");
      queries.push({ sql: normalizedSql, values: values ?? [] });

      if (normalizedSql.includes("FROM schema_migrations")) {
        return {
          rowCount: schemaApplied ? 1 : 0,
          rows: [],
        };
      }

      return {
        rowCount: 0,
        rows: [],
      };
    },
    release() {},
  };

  return {
    pool: {
      async connect() {
        return client;
      },
    },
    queries,
  };
}

test("runPostgresMigrations installs user reference sync triggers and backfills", async () => {
  const { pool, queries } = createPoolDouble();

  await runPostgresMigrations({
    committeeRoleSeed: [],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [],
    pool,
    seedUsers: [],
    systemRoleDefinitions: [],
  });

  assert.equal(queries[0].sql, "BEGIN");
  assert.ok(
    queries.some((entry) =>
      entry.sql.includes("CREATE OR REPLACE FUNCTION sync_login_events_user_refs()"),
    ),
  );
  assert.ok(
    queries.some((entry) =>
      entry.sql.includes("CREATE TRIGGER equipment_items_user_refs_trigger"),
    ),
  );
  assert.ok(
    queries.some((entry) => entry.sql.startsWith("UPDATE beginners_courses SET")),
  );
  assert.equal(queries.at(-1)?.sql, "COMMIT");
});

test("runPostgresMigrations still seeds initial schema when missing", async () => {
  const { pool, queries } = createPoolDouble({ schemaApplied: false });

  await runPostgresMigrations({
    committeeRoleSeed: [
      {
        displayOrder: 1,
        personalBlurb: "",
        photoDataUrl: null,
        responsibilities: "Coordinate",
        roleKey: "chair",
        summary: "Club chair",
        title: "Chair",
      },
    ],
    defaultEquipmentCupboardLabel: "Main Cupboard",
    permissionDefinitions: [
      {
        description: "Manage things",
        key: "manage_things",
        label: "Manage things",
      },
    ],
    pool,
    seedUsers: [
      {
        activeMember: true,
        coachingVolunteer: false,
        disciplines: ["Recurve Bow"],
        firstName: "Alice",
        membershipFeesDue: "2026-12-31",
        password: "hashed",
        rfidTag: "TAG-1",
        surname: "Example",
        userType: "admin",
        username: "alice",
      },
    ],
    systemRoleDefinitions: [
      {
        permissions: ["manage_things"],
        roleKey: "admin",
        title: "Admin",
      },
    ],
  });

  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO permissions")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO roles")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO committee_roles")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO users")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO user_types")),
  );
  assert.ok(
    queries.some((entry) => entry.sql.includes("INSERT INTO user_disciplines")),
  );
  assert.ok(
    queries.some(
      (entry) =>
        entry.sql.includes("INSERT INTO schema_migrations (version)") &&
        entry.values[0] === "001_initial_schema",
    ),
  );
});
