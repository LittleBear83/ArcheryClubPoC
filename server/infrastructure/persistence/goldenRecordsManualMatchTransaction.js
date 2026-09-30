import { createOutdoorTableGateway } from "./outdoorTableGateway.js";

export async function withGoldenRecordsManualMatchTransaction(
  { databaseEngine, db, outdoorTableGateway }, operation,
) {
  if (databaseEngine === "postgres") {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation({
        outdoorGateway: createOutdoorTableGateway({ databaseEngine: "postgres", pool: client }),
        transactionClient: client,
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // The SQLite gateways perform synchronous database operations on this one
  // connection; the remote API fetch finishes before this transaction starts.
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await operation({ outdoorGateway: outdoorTableGateway, transactionClient: null });
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
