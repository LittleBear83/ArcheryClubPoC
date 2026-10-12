import { getGoldenRecordsNightlyDate } from "../../domain/services/goldenRecordsNightlySchedule.js";

export function registerGoldenRecordsNightlySyncRoute({
  app,
  enabled,
  expectedJobName,
  goldenRecordsSyncJob,
  logger = console,
  now = () => Date.now(),
}) {
  app.post("/api/internal/golden-records/nightly-sync", async (req, res) => {
    // This route must be enabled only on a private Cloud Run service. IAM verifies
    // the OIDC token before the request reaches this application.
    if (!enabled) return res.status(404).json({ success: false });
    if (!expectedJobName || req.get("X-CloudScheduler-JobName") !== expectedJobName) {
      return res.status(403).json({ success: false, message: "Unexpected scheduler job." });
    }

    const scheduleTime = req.get("X-CloudScheduler-ScheduleTime");
    const scheduledAtMs = Date.parse(scheduleTime ?? "");
    if (!Number.isFinite(scheduledAtMs) || Math.abs(now() - scheduledAtMs) > 4 * 60 * 60 * 1000) {
      return res.status(403).json({ success: false, message: "Stale scheduler request." });
    }
    const scheduledDate = getGoldenRecordsNightlyDate(scheduleTime);
    if (!scheduledDate) {
      return res.status(200).json({ success: true, skipped: true, message: "Outside the London nightly sync window." });
    }

    try {
      const result = await goldenRecordsSyncJob.start({
        actorUsername: "scheduler",
        scheduledDate,
        waitForCompletion: true,
      });
      if (result.alreadyCompleted) {
        return res.json({ success: true, skipped: true, job: result.status });
      }
      if (!result.started) {
        return res.status(503).json({ success: false, message: "A Golden Records sync is already running.", job: result.status });
      }

      const job = await result.completion;
      const success = job.state === "completed";
      return res.status(success ? 200 : 500).json({ success, job });
    } catch (error) {
      logger.error?.("Golden Records nightly sync request failed", error);
      return res.status(500).json({ success: false, message: "Golden Records nightly sync failed to start." });
    }
  });
}
