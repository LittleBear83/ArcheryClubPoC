export const LOCAL_REBASELINE_MAINTENANCE_LOCK_ID = 81420730;

export async function acquireLocalRebaselineMaintenanceGate(
  client,
  lockId = LOCAL_REBASELINE_MAINTENANCE_LOCK_ID,
) {
  await client.query("SELECT pg_advisory_lock($1)", [lockId]);
}

export async function releaseLocalRebaselineMaintenanceGate(
  client,
  lockId = LOCAL_REBASELINE_MAINTENANCE_LOCK_ID,
) {
  await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
}

export function createLocalMutationMaintenanceGate({
  isLocalPiNode,
  pool,
  lockId = LOCAL_REBASELINE_MAINTENANCE_LOCK_ID,
}) {
  return async (req, res, next) => {
    if (
      !isLocalPiNode
      || !req.path.startsWith("/api/")
      || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ) {
      next();
      return;
    }

    let client;
    try {
      client = await pool.connect();
      const result = await client.query(
        "SELECT pg_try_advisory_lock_shared($1) AS acquired",
        [lockId],
      );
      if (!result.rows[0]?.acquired) {
        client.release();
        res.status(503).json({
          code: "local_rebaseline_in_progress",
          message: "This Pi is applying a Cloud rebaseline. Please retry shortly.",
          success: false,
        });
        return;
      }
    } catch (error) {
      // The session may have acquired the advisory lock before reporting the
      // query failure, so never return this connection to the pool for reuse.
      client?.release(error);
      next(error);
      return;
    }

    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      let releaseError;
      try {
        await client.query("SELECT pg_advisory_unlock_shared($1)", [lockId]);
      } catch (error) {
        releaseError = error;
      } finally {
        // Destroy a connection whose session lock could not be explicitly
        // released; PostgreSQL releases advisory locks when the session ends.
        client.release(releaseError);
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}
