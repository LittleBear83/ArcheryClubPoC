import { getGoldenRecordsNightlyDate } from "../../domain/services/goldenRecordsNightlySchedule.js";

const schedulerResourceName = /^projects\/[^/]+\/locations\/[^/]+\/jobs\/([^/]+)$/;

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
    const jobName = req.get("X-CloudScheduler-JobName");
    const scheduleTime = req.get("X-CloudScheduler-ScheduleTime");
    const expectedShortName = expectedJobName?.match(schedulerResourceName)?.[1];
    const matchesShortName = Boolean(expectedShortName && jobName === expectedShortName);
    const reject = (reason, message) => {
      logger.warn?.(JSON.stringify({
        severity: "WARNING",
        event: "golden_records.nightly_sync.rejected",
        reason,
        jobNameHeaderPresent: Boolean(jobName),
        receivedJobNameLength: jobName?.length ?? 0,
        configuredJobNameLength: expectedJobName?.length ?? 0,
        receivedJobNameFullyQualified: schedulerResourceName.test(jobName ?? ""),
        matchesShortJobId: matchesShortName,
        scheduleTimeHeaderPresent: Boolean(scheduleTime),
      }));
      return res.status(403).json({ success: false, message });
    };

    if (!expectedJobName || !expectedShortName || (jobName !== expectedJobName && !matchesShortName)) {
      return reject(!expectedJobName ? "job_name_not_configured" : !expectedShortName ? "job_name_invalid_configuration" : !jobName ? "job_name_missing" : "job_name_mismatch", "Unexpected scheduler job.");
    }

    const scheduledAtMs = Date.parse(scheduleTime ?? "");
    if (!Number.isFinite(scheduledAtMs)) {
      return reject(scheduleTime ? "schedule_time_invalid" : "schedule_time_missing", "Invalid scheduler request time.");
    }
    if (Math.abs(now() - scheduledAtMs) > 4 * 60 * 60 * 1000) {
      return reject("schedule_time_out_of_window", "Stale scheduler request.");
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
