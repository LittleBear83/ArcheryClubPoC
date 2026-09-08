const FEED_VERSION = "sync-publication-v2";
const MAX_CURSOR = 9223372036854775807n;

function validCursor(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && BigInt(value).toString() === value && BigInt(value) <= MAX_CURSOR;
}

export function registerPublicationSyncRoutes({ app, authenticateMachineRequest, publicationGateway }) {
  async function publishCommittedChanges(res) {
    // Discover until an empty committed visibility snapshot, including lower
    // source IDs. Bound work under sustained writes; retry continues safely.
    for (let batch = 0; batch < 100; batch += 1) {
      if ((await publicationGateway.publishBatch({ limit: 500 })).length === 0) return true;
    }
    res.status(503).json({ success: false, code: "publication_backlog", message: "Publication is catching up; retry the request." });
    return false;
  }

  app.get("/api/sync/v2/status", authenticateMachineRequest, async (_req, res) => {
    if (!await publishCommittedChanges(res)) return;
    res.json({ success: true, feedVersion: FEED_VERSION, checkpoint: await publicationGateway.getPublicationHead() });
  });

  app.post("/api/sync/v2/pull", authenticateMachineRequest, async (req, res) => {
    const checkpoint = req.body?.checkpoint;
    const limit = req.body?.limit === undefined ? 200 : req.body.limit;
    if (!validCursor(checkpoint)) {
      res.status(400).json({ success: false, code: "invalid_checkpoint", message: "checkpoint must be a canonical nonnegative decimal string within PostgreSQL BIGINT range." });
      return;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      res.status(400).json({ success: false, code: "invalid_limit", message: "limit must be an integer between 1 and 500." });
      return;
    }
    if (!await publishCommittedChanges(res)) return;
    const changes = await publicationGateway.listPublishedChanges({ checkpoint, limit });
    res.json({ success: true, feedVersion: FEED_VERSION, mode: "incremental",
      checkpoint: changes.at(-1)?.publicationCursor ?? checkpoint, changes });
  });
}
