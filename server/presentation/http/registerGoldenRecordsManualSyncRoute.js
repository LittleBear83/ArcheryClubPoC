export function registerGoldenRecordsManualSyncRoute({ app, enabled, expectedQueueName, goldenRecordsSyncJob, logger = console }) {
  app.post("/api/internal/golden-records/manual-sync", async (req, res) => {
    if (!enabled) return res.status(404).json({ success: false });
    if (!expectedQueueName || req.get("X-CloudTasks-QueueName") !== expectedQueueName.split("/").at(-1)) {
      return res.status(403).json({ success: false, message: "Unexpected task queue." });
    }
    const { id, actorUsername } = req.body ?? {};
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "") ||
        !actorUsername || req.get("X-CloudTasks-TaskName") !== `gr-${id}`) {
      return res.status(400).json({ success: false, message: "Invalid manual sync task." });
    }
    try {
      const result = await goldenRecordsSyncJob.start({ actorUsername, jobId: id, waitForCompletion: true });
      if (result.alreadyCompleted || result.stale) return res.json({ success: true, skipped: true, job: result.status });
      if (!result.started) return res.status(503).json({ success: false, message: "A Golden Records sync is already running." });
      const job = await result.completion;
      return res.status(job.state === "completed" ? 200 : 500).json({ success: job.state === "completed", job });
    } catch (error) {
      logger.error?.("Golden Records manual sync task failed", error);
      return res.status(500).json({ success: false, message: "Golden Records manual sync task failed." });
    }
  });
}
