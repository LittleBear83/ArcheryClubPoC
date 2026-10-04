const BRIDGE_EVENTS_URL = "http://127.0.0.1:8765/events";
const RETRY_MS = 5000;

export function startRfidBridgeConsumer({ processRfidCheckIn, fetchImpl = fetch, logger = console,
  retryMs = RETRY_MS, url = BRIDGE_EVENTS_URL } = {}) {
  let stopped = false;
  let controller = null;
  let retryTimer = null;

  const connect = async () => {
    controller = new AbortController();
    let connected = false;
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "text/event-stream" }, signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("bridge unavailable");
      connected = true;
      logger.info("Local RFID bridge consumer connected");
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";
      let data = [];

      const dispatch = async () => {
        if (eventType !== "scan") return;
        let scan;
        try {
          scan = JSON.parse(data.join("\n"));
        } catch {
          logger.warn("RFID scan rejected: malformed bridge event");
          return;
        }
        if (!scan || typeof scan.uid !== "string" || !/^[0-9a-f]{4,64}$/i.test(scan.uid)
          || !Number.isSafeInteger(scan.sequence) || scan.sequence < 1
          || typeof scan.reader !== "string" || !scan.reader.trim()
          || typeof scan.scannedAt !== "string") {
          logger.warn("RFID scan rejected: malformed bridge event");
          return;
        }
        try {
          const result = await processRfidCheckIn({
            rfidTag: scan.uid.toUpperCase(),
            scan: { sequence: scan.sequence, scannedAt: scan.scannedAt, reader: scan.reader,
              instanceId: scan.instanceId },
          });
          if (result.status === 200) {
            if (result.created) logger.info(`RFID check-in accepted for ${result.user.username}`);
          } else {
            logger.warn(`RFID scan rejected: ${result.status === 401 ? "unrecognised fob" : result.status === 403 ? "inactive member" : "invalid scan"}`);
          }
        } catch {
          logger.error("RFID scan processing failed");
        }
      };

      for await (const chunk of response.body) {
        if (stopped) break;
        buffer += decoder.decode(chunk, { stream: true });
        if (buffer.length > 65536) throw new Error("oversized bridge event");
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, "");
          buffer = buffer.slice(newline + 1);
          if (!line) {
            await dispatch();
            eventType = "";
            data = [];
          } else if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5).trimStart());
          }
        }
      }
    } catch {
      if (!stopped && !connected) logger.warn("Local RFID bridge consumer disconnected/retrying");
    } finally {
      controller = null;
      if (!stopped) {
        if (connected) logger.info("Local RFID bridge consumer disconnected/retrying");
        retryTimer = setTimeout(() => { retryTimer = null; void connect(); }, retryMs);
      }
    }
  };

  void connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}
