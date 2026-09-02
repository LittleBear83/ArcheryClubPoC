import process from "node:process";
import pg from "pg";
import { serverRuntime } from "../server/config/runtime.js";
import { applyPulledSyncResponse, readSyncStatus, writeSyncAttemptState } from "../server/domain/services/localDatabaseSyncService.js";
import { createSyncGateway } from "../server/infrastructure/persistence/syncGateway.js";

const { Pool } = pg;
const SYNC_CLIENT_VERSION = "sync-v1";
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function createLocalPool() {
  const { localPostgres } = serverRuntime.sync;

  if (localPostgres.url) {
    return new Pool({
      connectionString: localPostgres.url,
    });
  }

  if (!localPostgres.databaseName || !localPostgres.user || !localPostgres.host) {
    throw new Error(
      "SYNC_LOCAL_DATABASE_URL or SYNC_LOCAL_DB_HOST/SYNC_LOCAL_DB_NAME/SYNC_LOCAL_DB_USER are required.",
    );
  }

  return new Pool({
    database: localPostgres.databaseName,
    host: localPostgres.host,
    password: localPostgres.password || undefined,
    port: localPostgres.port,
    user: localPostgres.user,
  });
}

async function requestSyncJson(path, body) {
  const { apiBaseUrl, machineId, machineSecret, requestTimeoutMs } = serverRuntime.sync;

  if (!apiBaseUrl || !machineId || !machineSecret) {
    throw new Error("SYNC_API_BASE_URL, SYNC_MACHINE_ID, and SYNC_MACHINE_SECRET are required.");
  }

  const url = new URL(path, apiBaseUrl);
  let attempt = 0;
  let lastError = null;

  while (attempt < 2) {
    attempt += 1;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, {
        body: JSON.stringify(body ?? {}),
        headers: {
          "content-type": "application/json",
          "x-sync-machine-id": machineId,
          "x-sync-machine-secret": machineSecret,
        },
        method: "POST",
        signal: abortController.signal,
      });
      const payload = await response.json();

      if (!response.ok) {
        const error = new Error(payload?.message ?? `Sync request failed with ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (!TRANSIENT_STATUS_CODES.has(Number(error?.status ?? 0)) || attempt >= 2) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function main() {
  if (!serverRuntime.sync.isLocalPiNode) {
    throw new Error("SYNC_NODE_MODE=local-pi is required to run the local sync client.");
  }

  const isInitialSync = process.argv.includes("--initial");
  const pool = createLocalPool();
  const syncGateway = createSyncGateway({ pool });
  const client = await pool.connect();

  try {
    const acquired = await syncGateway.acquireSyncLock(client);

    if (!acquired) {
      console.log("A sync is already running; exiting without starting a second pass.");
      process.exitCode = 0;
      return;
    }

    await writeSyncAttemptState({
      syncGateway,
      values: {
        lastAttemptedAt: new Date().toISOString(),
        lastError: null,
        syncClientVersion: SYNC_CLIENT_VERSION,
      },
    });

    const status = await readSyncStatus({ syncGateway });
    const pendingEvents = await syncGateway.listPendingOutboxEvents({
      limit: serverRuntime.sync.pushBatchSize,
    });

    if (pendingEvents.length > 0) {
      try {
        const pushResponse = await requestSyncJson("/api/sync/v1/push", {
          events: pendingEvents.map((entry) => ({
            eventId: entry.eventId,
            eventType: entry.eventType,
            payload: entry.payload,
          })),
        });
        await syncGateway.rejectOutboxEvents({
          rejections: pushResponse.rejectedEvents ?? [],
        });
        await syncGateway.acknowledgeOutboxEvents({
          eventIds: pushResponse.acceptedEventIds ?? [],
        });
      } catch (error) {
        await syncGateway.recordOutboxFailure({
          errorMessage: error instanceof Error ? error.message : String(error),
          eventIds: pendingEvents.map((entry) => entry.eventId),
        });
        throw error;
      }
    }

    const pullResponse = await requestSyncJson("/api/sync/v1/pull", {
      checkpoint: isInitialSync ? null : status.currentCheckpoint || null,
      initialSync: isInitialSync || status.currentCheckpoint === 0,
      limit: serverRuntime.sync.pullBatchSize,
    });

    const applyClient = await pool.connect();

    try {
      await applyPulledSyncResponse({
        client: applyClient,
        currentCheckpoint: status.currentCheckpoint,
        deactivatedRfidSuffix: process.env.DEACTIVATED_RFID_SUFFIX ?? "-deactivated",
        pullResponse,
        syncGateway,
      });
    } finally {
      applyClient.release();
    }

    const nextStatus = await readSyncStatus({ syncGateway });
    console.log(
      JSON.stringify(
        {
          checkpoint: nextStatus.currentCheckpoint,
          lastSuccessfulAt: nextStatus.lastSuccessfulAt,
          pendingOutboxCount: nextStatus.pendingOutboxCount,
          success: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await writeSyncAttemptState({
      syncGateway,
      values: {
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    try {
      await syncGateway.releaseSyncLock(client);
    } catch {
      // Ignore unlock failures during shutdown.
    }
    client.release();
    await pool.end();
  }
}

await main();
