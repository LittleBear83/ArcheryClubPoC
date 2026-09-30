import { randomUUID } from "node:crypto";

const STATUS_KEY = "member-sync-job";

export function createGoldenRecordsSyncJob({
  goldenRecordsIntegrationGateway,
  goldenRecordsMemberSyncService,
  backgroundExecutionAvailable = true,
  onFinished = () => {},
  logger = console,
}) {
  let running = null;
  let currentStatus = null;

  async function saveStatus(status) {
    currentStatus = status;
    await goldenRecordsIntegrationGateway.upsertStatus(STATUS_KEY, status);
  }

  async function interruptOrphanedStatus() {
    const status = await goldenRecordsIntegrationGateway.findStatus(STATUS_KEY);
    if (status?.state !== "running") return status;
    const release = await goldenRecordsIntegrationGateway.tryAcquireMemberSyncLock();
    if (!release) return status;
    try {
      return await interruptOrphanedStatusWithLock();
    } finally {
      await release();
    }
  }

  async function interruptOrphanedStatusWithLock() {
    // Re-read while holding the lock: another instance may have completed
    // between the initial status read and lock acquisition.
    const status = await goldenRecordsIntegrationGateway.findStatus(STATUS_KEY);
    if (status?.state !== "running") return status;
    const interrupted = {
      ...status,
      state: "interrupted",
      completedAt: new Date().toISOString(),
      failureMessage: "Golden Records sync was interrupted because its server stopped or its execution ended. Start a new sync to retry.",
    };
    await saveStatus(interrupted);
    return interrupted;
  }

  async function getStatus() {
    return running ? currentStatus : await interruptOrphanedStatus();
  }

  async function start({ actorUsername }) {
    if (!backgroundExecutionAvailable) return { started: false, unavailable: true, status: await getStatus() };
    if (running) return { started: false, status: await getStatus() };
    const release = await goldenRecordsIntegrationGateway.tryAcquireMemberSyncLock();
    if (!release) return { started: false, status: await getStatus() };

    const status = {
      id: randomUUID(),
      state: "running",
      startedAt: new Date().toISOString(),
      startedByUsername: actorUsername ?? "scheduler",
      attemptedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      achievementCount: 0,
      errorCount: 0,
    };
    try {
      await interruptOrphanedStatusWithLock();
      await saveStatus(status);
    } catch (error) {
      await release();
      throw error;
    }

    // Own the promise here, beyond the lifetime of the HTTP request and session.
    running = Promise.resolve().then(async () => {
      try {
        const summary = await goldenRecordsMemberSyncService.syncAllMembers({
          updatedByUsername: actorUsername,
          onProgress: async (progress) => {
            try {
              await saveStatus({ ...status, ...progress });
            } catch (error) {
              logger.error?.("Failed to save Golden Records sync progress", error);
            }
          },
        });
        const completed = {
          ...status,
          ...summary,
          state: summary.errorCount > 0 ? "completed-with-errors" : "completed",
          completedAt: new Date().toISOString(),
        };
        await saveStatus(completed);
        try { onFinished(completed); } catch (error) {
          logger.error?.("Failed to publish Golden Records sync completion", error);
        }
      } catch (error) {
        const failed = {
          ...currentStatus,
          state: "failed",
          completedAt: new Date().toISOString(),
          failureMessage: error instanceof Error ? error.message : "Golden Records sync failed.",
        };
        logger.error?.("Golden Records member sync job failed", failed);
        try { await saveStatus(failed); } catch (persistError) {
          logger.error?.("Failed to save Golden Records sync job failure", persistError);
        }
        try { onFinished(failed); } catch (publishError) {
          logger.error?.("Failed to publish Golden Records sync failure", publishError);
        }
      } finally {
        try { await release(); } catch (error) {
          logger.error?.("Failed to release Golden Records sync lock", error);
        } finally { running = null; }
      }
    });
    return { started: true, status };
  }

  return { getStatus, start };
}
