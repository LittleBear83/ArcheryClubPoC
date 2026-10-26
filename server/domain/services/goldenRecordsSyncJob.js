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

  async function queueManual({ actorUsername, enqueue }) {
    const release = await goldenRecordsIntegrationGateway.tryAcquireMemberSyncLock();
    if (!release) return { queued: false, status: await getStatus() };
    try {
      const previous = await goldenRecordsIntegrationGateway.findStatus(STATUS_KEY);
      if (previous?.state === "running" || (previous?.state === "queued" && Date.now() - Date.parse(previous.queuedAt) < 2 * 60 * 60 * 1000)) {
        return { queued: false, status: previous };
      }
      const status = {
        id: randomUUID(), state: "queued", queuedAt: new Date().toISOString(),
        startedByUsername: actorUsername, attemptedCount: 0, matchedCount: 0,
        unmatchedCount: 0, achievementCount: 0, errorCount: 0,
        lastSuccessfulAt: previous?.lastSuccessfulAt ?? (previous?.state === "completed" ? previous.completedAt : null),
      };
      await saveStatus(status);
      try {
        await enqueue({ id: status.id, actorUsername });
      } catch (error) {
        await saveStatus({ ...status, state: "failed", completedAt: new Date().toISOString(), failureMessage: "Could not queue Golden Records sync." });
        throw error;
      }
      return { queued: true, status };
    } finally {
      await release();
    }
  }

  async function start({ actorUsername, scheduledDate = null, jobId = null, waitForCompletion = false }) {
    if (!waitForCompletion && !backgroundExecutionAvailable) return { started: false, unavailable: true, status: await getStatus() };
    if (running) return { started: false, status: await getStatus() };
    const release = await goldenRecordsIntegrationGateway.tryAcquireMemberSyncLock();
    if (!release) return { started: false, status: await getStatus() };

    const scheduleStatusKey = scheduledDate ? `member-sync-nightly-${scheduledDate}` : null;
    const manualStatusKey = jobId ? `member-sync-manual-${jobId}` : null;

    const status = {
      id: jobId ?? randomUUID(),
      state: "running",
      startedAt: new Date().toISOString(),
      startedByUsername: actorUsername ?? "scheduler",
      ...(scheduledDate ? { scheduledDate } : {}),
      attemptedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      achievementCount: 0,
      errorCount: 0,
    };
    try {
      if (scheduleStatusKey) {
        const previousRun = await goldenRecordsIntegrationGateway.findStatus(scheduleStatusKey);
        if (previousRun?.state === "completed") {
          await release();
          return { started: false, alreadyCompleted: true, status: previousRun };
        }
      }
      if (manualStatusKey) {
        const previousRun = await goldenRecordsIntegrationGateway.findStatus(manualStatusKey);
        if (previousRun?.state === "completed") {
          await release();
          return { started: false, alreadyCompleted: true, status: previousRun };
        }
      }
      const latest = await goldenRecordsIntegrationGateway.findStatus(STATUS_KEY);
      if (jobId && (latest?.id !== jobId || !["queued", "failed", "completed-with-errors", "interrupted"].includes(latest.state))) {
        await release();
        return { started: false, stale: true, status: latest };
      }
      if (!jobId && latest?.state === "queued" && Date.now() - Date.parse(latest.queuedAt) < 2 * 60 * 60 * 1000) {
        await release();
        return { started: false, status: latest };
      }
      status.lastSuccessfulAt = latest?.lastSuccessfulAt ?? (latest?.state === "completed" ? latest.completedAt : null);
      await interruptOrphanedStatusWithLock();
      await saveStatus(status);
    } catch (error) {
      await release();
      throw error;
    }

    logger.info?.("Golden Records member sync job started", { id: status.id, scheduledDate, startedByUsername: status.startedByUsername });
    running = Promise.resolve().then(async () => {
      try {
        const summary = await goldenRecordsMemberSyncService.syncAllMembers({
          updatedByUsername: actorUsername,
          maxDurationMs: waitForCompletion ? 26 * 60 * 1000 : undefined,
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
          durationMs: Date.now() - Date.parse(status.startedAt),
        };
        if (completed.state === "completed") completed.lastSuccessfulAt = completed.completedAt;
        await saveStatus(completed);
        if (scheduleStatusKey) await goldenRecordsIntegrationGateway.upsertStatus(scheduleStatusKey, completed);
        if (manualStatusKey) await goldenRecordsIntegrationGateway.upsertStatus(manualStatusKey, completed);
        logger.info?.("Golden Records member sync job finished", completed);
        try { onFinished(completed); } catch (error) {
          logger.error?.("Failed to publish Golden Records sync completion", error);
        }
        return completed;
      } catch (error) {
        const failed = {
          ...currentStatus,
          state: "failed",
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - Date.parse(status.startedAt),
          failureMessage: error instanceof Error ? error.message : "Golden Records sync failed.",
        };
        logger.error?.("Golden Records member sync job failed", failed);
        try { await saveStatus(failed); } catch (persistError) {
          logger.error?.("Failed to save Golden Records sync job failure", persistError);
        }
        if (scheduleStatusKey) {
          try { await goldenRecordsIntegrationGateway.upsertStatus(scheduleStatusKey, failed); }
          catch (persistError) { logger.error?.("Failed to save Golden Records nightly sync failure", persistError); }
        }
        if (manualStatusKey) {
          try { await goldenRecordsIntegrationGateway.upsertStatus(manualStatusKey, failed); }
          catch (persistError) { logger.error?.("Failed to save Golden Records manual sync failure", persistError); }
        }
        try { onFinished(failed); } catch (publishError) {
          logger.error?.("Failed to publish Golden Records sync failure", publishError);
        }
        return failed;
      } finally {
        try { await release(); } catch (error) {
          logger.error?.("Failed to release Golden Records sync lock", error);
        } finally { running = null; }
      }
    });
    return { started: true, status, completion: running };
  }

  return { getStatus, queueManual, start };
}
