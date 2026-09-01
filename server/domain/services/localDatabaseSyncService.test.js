import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAuthChanges,
  readSyncStatus,
  writeSyncAttemptState,
} from "./localDatabaseSyncService.js";

function createClientDouble() {
  const queries = [];

  return {
    client: {
      async query(sql, values = []) {
        const normalizedSql = String(sql).trim().replace(/\s+/g, " ");
        queries.push({ sql: normalizedSql, values });

        if (normalizedSql.startsWith("SELECT username, rfid_tag FROM users")) {
          return {
            rowCount: 1,
            rows: [
              {
                rfid_tag: "TAG-1",
                username: "robin",
              },
            ],
          };
        }

        return {
          rowCount: 0,
          rows: [],
        };
      },
    },
    queries,
  };
}

test("applyAuthChanges upserts dependencies before dependent user role rows", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      {
        domain: "user_types",
        operation: "upsert",
        payload: {
          user_type: "admin",
          username: "robin",
        },
        recordKey: "robin",
      },
      {
        domain: "roles",
        operation: "upsert",
        payload: {
          is_system: 1,
          role_key: "admin",
          title: "Admin",
        },
        recordKey: "admin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  const roleQueryIndex = queries.findIndex((entry) =>
    entry.sql.startsWith("INSERT INTO roles"),
  );
  const userTypeQueryIndex = queries.findIndex((entry) =>
    entry.sql.startsWith("INSERT INTO user_types"),
  );

  assert.ok(roleQueryIndex > -1);
  assert.ok(userTypeQueryIndex > -1);
  assert.ok(roleQueryIndex < userTypeQueryIndex);
});

test("applyAuthChanges tombstones deleted cloud users instead of deleting local history", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      {
        domain: "users",
        operation: "delete",
        payload: {
          rfid_tag: "TAG-1",
          username: "robin",
        },
        recordKey: "robin",
      },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  assert.ok(
    queries.some((entry) =>
      entry.sql.startsWith("UPDATE users SET password = NULL"),
    ),
  );
});

test("applyAuthChanges removes every deleted cloud-authoritative relationship", async () => {
  const { client, queries } = createClientDouble();

  await applyAuthChanges({
    changes: [
      { domain: "user_disciplines", operation: "delete", payload: { discipline: "Recurve", username: "robin" }, recordKey: "robin:Recurve" },
      { domain: "user_types", operation: "delete", payload: { username: "robin" }, recordKey: "robin" },
      { domain: "role_permissions", operation: "delete", payload: { permission_key: "manage_users", role_key: "admin" }, recordKey: "admin:manage_users" },
      { domain: "roles", operation: "delete", payload: { role_key: "obsolete" }, recordKey: "obsolete" },
      { domain: "permissions", operation: "delete", payload: { permission_key: "obsolete_permission" }, recordKey: "obsolete_permission" },
    ],
    client,
    deactivatedRfidSuffix: "-deactivated",
  });

  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM user_disciplines WHERE username = $1 AND discipline = $2")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM user_types WHERE username = $1")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM role_permissions WHERE role_key = $1 AND permission_key = $2")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM roles WHERE role_key = $1")));
  assert.ok(queries.some((entry) => entry.sql.includes("DELETE FROM permissions WHERE permission_key = $1")));
});

test("readSyncStatus reports checkpoint, timestamps, and pending outbox count", async () => {
  const status = await readSyncStatus({
    syncGateway: {
      async countPendingOutboxEvents() {
        return 3;
      },
      async readLocalState() {
        return {
          state: {
            currentCheckpoint: 44,
            lastAttemptedAt: "2026-09-01T00:01:00.000Z",
            lastError: "timeout",
            lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
            syncClientVersion: "sync-v1",
            syncServerVersion: "sync-v1",
          },
          updatedAt: "2026-09-01T00:01:00.000Z",
        };
      },
    },
  });

  assert.deepEqual(status, {
    currentCheckpoint: 44,
    lastAttemptedAt: "2026-09-01T00:01:00.000Z",
    lastError: "timeout",
    lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
    pendingOutboxCount: 3,
    syncClientVersion: "sync-v1",
    syncServerVersion: "sync-v1",
  });
});

test("writeSyncAttemptState merges new values into the existing sync state", async () => {
  let writtenState = null;

  await writeSyncAttemptState({
    syncGateway: {
      async readLocalState() {
        return {
          state: {
            currentCheckpoint: 12,
            lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
          },
        };
      },
      async writeLocalState({ state }) {
        writtenState = state;
      },
    },
    values: {
      lastError: "network down",
    },
  });

  assert.deepEqual(writtenState, {
    currentCheckpoint: 12,
    lastError: "network down",
    lastSuccessfulAt: "2026-08-31T00:01:02.000Z",
  });
});
