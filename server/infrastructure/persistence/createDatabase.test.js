import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresPool } from "./createDatabase.js";

const connectionModes = {
  "DATABASE_URL": {
    databaseUrl: "postgres://user:password@localhost:5432/archery",
    postgres: {},
  },
  "Cloud SQL socket": {
    databaseUrl: "",
    postgres: {
      databaseName: "archery",
      socketDirectory: "/cloudsql/project:region:instance",
      user: "user",
    },
  },
  "DB_HOST": {
    databaseUrl: "",
    postgres: {
      databaseName: "archery",
      host: "localhost",
      user: "user",
    },
  },
};

for (const [mode, runtime] of Object.entries(connectionModes)) {
  test(`${mode} defaults to a PostgreSQL pool maximum of 5`, async () => {
    const pool = createPostgresPool(runtime);
    try {
      assert.equal(pool.options.max, 5);
    } finally {
      await pool.end();
    }
  });

  test(`${mode} accepts a valid DB_POOL_MAX override`, async () => {
    const pool = createPostgresPool({
      ...runtime,
      postgres: { ...runtime.postgres, poolMax: "7" },
    });
    try {
      assert.equal(pool.options.max, 7);
    } finally {
      await pool.end();
    }
  });

  for (const invalidValue of ["invalid", "0", "-2", "1.5", "9007199254740992"]) {
    test(`${mode} falls back to 5 for invalid DB_POOL_MAX ${invalidValue}`, async () => {
      const pool = createPostgresPool({
        ...runtime,
        postgres: { ...runtime.postgres, poolMax: invalidValue },
      });
      try {
        assert.equal(pool.options.max, 5);
      } finally {
        await pool.end();
      }
    });
  }
}
