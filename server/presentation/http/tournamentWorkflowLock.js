// Serialise reads that may generate draws with all tournament writes.
// PostgreSQL also holds an advisory lock across server instances.
export function createTournamentWorkflowLock(tournamentGateway) {
  let tail = Promise.resolve();
  return async (_req, res, next) => {
    const previous = tail;
    let finish;
    tail = new Promise((resolve) => { finish = resolve; });
    await previous;
    let release;
    try {
      release = await tournamentGateway.acquireWorkflowLock?.();
      if (res.destroyed) {
        await release?.();
        finish();
        return;
      }
      let released = false;
      const complete = async () => {
        if (released) return;
        released = true;
        try { await release?.(); }
        catch (error) { console.error("Failed to release tournament workflow lock", error); }
        finally { finish(); }
      };
      res.once("finish", complete);
      res.once("close", complete);
      next();
    } catch (error) {
      finish();
      next(error);
    }
  };
}
