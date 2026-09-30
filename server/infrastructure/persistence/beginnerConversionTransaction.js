export async function withBeginnerConversionTransaction({ databaseEngine, db }, operation) {
  if (databaseEngine === "postgres") {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // The SQLite gateways use this same synchronous connection for every write.
  // The conversion path performs no external I/O while the transaction is open.
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await operation(null);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
