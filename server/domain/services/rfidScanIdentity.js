import { createHash } from "node:crypto";

// A bridge instance ID survives across Pi and cloud requests for the same
// scan. Older bridges fall back to the configured machine ID and timestamp.
export function getRfidScanEventId({ machineId, rfidTag, scan }) {
  const identityScope = typeof scan?.instanceId === "string" && scan.instanceId.trim()
    ? `bridge:${scan.instanceId.trim()}` : machineId ? `machine:${machineId}` : null;
  if (!identityScope || !scan || !Number.isSafeInteger(scan.sequence) || scan.sequence < 1
    || typeof scan.scannedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(scan.scannedAt)
    || typeof scan.reader !== "string" || !scan.reader.trim()) return null;

  const hash = createHash("sha256").update(JSON.stringify([
    "local-rfid-bridge-v1", identityScope, scan.sequence, scan.scannedAt,
    scan.reader.trim(), String(rfidTag).trim().toUpperCase(),
  ])).digest("hex");
  // A deterministic UUID fits the existing unique sync_event_id column.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
