const RFID_BRIDGE_BASE_URL = "http://127.0.0.1:8765";
const DEFAULT_STATUS_TIMEOUT_MS = 1500;
const RETRY_DELAY_MS = 5000;

function normaliseBridgeStatus(status = {}) {
  const readers = Array.isArray(status.readers) ? status.readers : [];
  const pcscAvailable = Boolean(status.pcscAvailable);
  const readerCount = Number(status.readerCount ?? readers.length ?? 0);

  return {
    bridgeAvailable: true,
    available: pcscAvailable && readerCount > 0,
    pcscAvailable,
    readerCount,
    readers,
    platform: status.platform ?? "",
    architecture: status.architecture ?? "",
    version: status.version ?? "",
    lastError: status.lastError ?? null,
  };
}

export async function getLocalRfidBridgeStatus({
  timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${RFID_BRIDGE_BASE_URL}/health`, {
      method: "GET",
      cache: "no-store",
      mode: "cors",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RFID bridge returned HTTP ${response.status}.`);
    }

    const status = await response.json();

    return normaliseBridgeStatus(status);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function subscribeToLocalRfidBridgeScans(
  listener,
  { onStatus } = {},
) {
  let closed = false;
  let eventSource = null;
  let retryTimer = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const closeEventSource = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const scheduleRetry = () => {
    if (closed || retryTimer !== null) {
      return;
    }

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void connect();
    }, RETRY_DELAY_MS);
  };

  const reportUnavailable = (error) => {
    onStatus?.({
      bridgeAvailable: false,
      available: false,
      pcscAvailable: false,
      readerCount: 0,
      readers: [],
      lastError:
        error instanceof Error
          ? error.message
          : "Local RFID Reader Bridge is unavailable.",
    });
  };

  const connect = async () => {
    if (closed) {
      return;
    }

    try {
      const status = await getLocalRfidBridgeStatus();

      if (closed) {
        return;
      }

      onStatus?.(status);

      if (!status.available) {
        scheduleRetry();
        return;
      }
    } catch (error) {
      if (!closed) {
        reportUnavailable(error);
        scheduleRetry();
      }
      return;
    }

    eventSource = new EventSource(`${RFID_BRIDGE_BASE_URL}/events`);

    eventSource.addEventListener("status", (event) => {
      try {
        const status = normaliseBridgeStatus(JSON.parse(event.data));
        onStatus?.(status);
      } catch {
        // Ignore malformed bridge status events.
      }
    });

    eventSource.addEventListener("scan", (event) => {
      try {
        const scan = JSON.parse(event.data);
        const rfidTag = String(scan?.uid ?? "").trim().toUpperCase();

        if (!rfidTag) {
          return;
        }

        listener({
          sequence: Number(scan.sequence ?? 0),
          rfidTag,
          scannedAt: scan.scannedAt ?? new Date().toISOString(),
          source: "local-reader-bridge",
          reader: scan.reader ?? null,
          atr: scan.atr ?? null,
          scanType: "rfid",
        });
      } catch {
        // Ignore malformed scan events.
      }
    });

    eventSource.onerror = () => {
      closeEventSource();

      if (!closed) {
        reportUnavailable(
          new Error("Connection to the local RFID Reader Bridge was lost."),
        );
        scheduleRetry();
      }
    };
  };

  void connect();

  return () => {
    closed = true;
    clearRetry();
    closeEventSource();
  };
}
