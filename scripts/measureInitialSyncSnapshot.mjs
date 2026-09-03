import process from "node:process";
import pg from "pg";
import { createSyncGateway } from "../server/infrastructure/persistence/syncGateway.js";

const { Pool } = pg;

if (process.env.ARCHERY_SYNC_SNAPSHOT_DIAGNOSTIC !== "1") {
  throw new Error("Set ARCHERY_SYNC_SNAPSHOT_DIAGNOSTIC=1 to run this aggregate-only diagnostic.");
}

if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  throw new Error("DATABASE_URL must be a PostgreSQL connection string.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const startedAt = performance.now();
  const gateway = createSyncGateway({ pool });
  const [counts, snapshot] = await Promise.all([
    pool.query(`SELECT (SELECT COUNT(*) FROM login_events) AS login_event_count, (SELECT COUNT(*) FROM guest_login_events) AS guest_login_event_count`),
    gateway.getAuthSnapshot(),
  ]);
  const serializedSnapshotByteLength = Buffer.byteLength(JSON.stringify(snapshot.snapshot), "utf8");
  console.log(JSON.stringify({
    guestLoginEventCount: Number(counts.rows[0].guest_login_event_count),
    loginEventCount: Number(counts.rows[0].login_event_count),
    serializedInitialSnapshotByteLength: serializedSnapshotByteLength,
    snapshotGenerationElapsedMilliseconds: Math.round(performance.now() - startedAt),
  }));
} finally {
  await pool.end();
}
