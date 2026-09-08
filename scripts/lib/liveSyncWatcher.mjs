import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const sleep = (ms, signal) => delay(ms, undefined, { signal });

// Parse lines incrementally, including CRLF split across chunks. Bound both
// individual lines and complete events; oversized events are discarded.
export function createSseParser(onEvent) {
  let line = "";
  let skipLf = false;
  let event = "";
  let data = [];
  let size = 0;
  let discarded = false;
  function finishLine() {
    if (!line) {
      if (!discarded && data.length) onEvent({ event, data: data.join("\n") });
      event = "";
      data = [];
      size = 0;
      discarded = false;
    } else if (!discarded && !line.startsWith(":")) {
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      if (field === "data") data.push(value);
    }
    line = "";
  }
  return (text) => {
    for (const char of text) {
      if (skipLf && char === "\n") { skipLf = false; continue; }
      skipLf = char === "\r";
      if (char === "\r" || char === "\n") {
        finishLine();
      } else {
        size += 1;
        if (size > 65536) discarded = true;
        // Retain a nonempty line marker when discarding, until its terminator.
        if (line.length < 65536) line += char;
      }
    }
  };
}

export function validateWatcherConfig(sync) {
  if (sync.nodeMode !== "local-pi") {
    throw new Error("SYNC_NODE_MODE=local-pi is required for the sync watcher.");
  }
  if (!sync.apiBaseUrl || !sync.machineId || !sync.machineSecret) {
    throw new Error("SYNC_API_BASE_URL, SYNC_MACHINE_ID, and SYNC_MACHINE_SECRET are required.");
  }
  let base;
  try { base = new URL(sync.apiBaseUrl); } catch {
    throw new Error("SYNC_API_BASE_URL must be a valid HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("SYNC_API_BASE_URL must be HTTP(S) without embedded credentials.");
  }
  return new URL("/api/sync/v1/events", base);
}

export async function runLiveSyncWatcher({
  sync, signal, readCheckpoint, runSync,
  fetchImpl = globalThis.fetch,
  wait = sleep,
  log = () => {},
  idleTimeoutMs = 75000,
}) {
  const url = validateWatcherConfig(sync);
  let highestCheckpoint = 0;
  let requested = false;
  let wake;
  const wakeWorker = () => wake?.();
  signal.addEventListener("abort", wakeWorker);

  async function pause(ms) {
    try { await wait(ms, signal); } catch {
      if (!signal.aborted) throw new Error("Sync watcher retry wait failed.");
    }
  }

  function receive({ event, data }) {
    if (signal.aborted || !["sync.ready", "sync.available"].includes(event)) return;
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    const checkpoint = payload?.checkpoint;
    if (!Number.isSafeInteger(checkpoint) || checkpoint < 0) return;
    highestCheckpoint = Math.max(highestCheckpoint, checkpoint);
    requested = true;
    wakeWorker();
  }

  async function synchronize() {
    let retry = 0;
    while (!signal.aborted) {
      if (!requested) {
        await new Promise((resolve) => { wake = resolve; });
        wake = undefined;
        continue;
      }
      try {
        const before = await readCheckpoint();
        if (signal.aborted) break;
        if (!Number.isSafeInteger(before) || before < 0) throw new Error("Invalid local checkpoint.");
        if (before >= highestCheckpoint) { requested = false; retry = 0; continue; }
        await runSync(signal);
        if (signal.aborted) break;
        const after = await readCheckpoint();
        if (signal.aborted) break;
        if (!Number.isSafeInteger(after) || after < 0) throw new Error("Invalid local checkpoint.");
        if (after >= highestCheckpoint) { requested = false; retry = 0; continue; }
        if (after > before) { retry = 0; continue; }
        // Lock contention or a failed/no-progress pass must not spin children.
        log("Sync has not advanced; retrying with backoff.");
      } catch {
        if (signal.aborted) break;
        // Never echo errors from fetch, PostgreSQL, or the child: they may
        // contain request headers, credentials, or a server response body.
        log("Local sync attempt failed; retrying with backoff.");
      }
      await pause(BACKOFF_MS[Math.min(retry++, BACKOFF_MS.length - 1)]);
    }
  }

  async function listen() {
    let retry = 0;
    while (!signal.aborted) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      let watchdog;
      let reader;
      const touch = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(abort, idleTimeoutMs);
      };
      try {
        touch();
        const response = await fetchImpl(url, {
          method: "GET",
          headers: {
            accept: "text/event-stream",
            "x-sync-machine-id": sync.machineId,
            "x-sync-machine-secret": sync.machineSecret,
          },
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "text/event-stream" || !response.body) {
          throw new Error("Invalid sync stream response.");
        }
        retry = 0;
        log("Sync event stream connected.");
        const decode = new TextDecoder();
        const parse = createSseParser(receive);
        reader = response.body.getReader();
        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          touch();
          parse(decode.decode(value, { stream: true }));
        }
      } catch {
        if (!signal.aborted) log("Sync event stream unavailable; reconnecting with backoff.");
      } finally {
        clearTimeout(watchdog);
        controller.abort();
        signal.removeEventListener("abort", abort);
        try { await reader?.cancel(); } catch { /* The connection may already be gone. */ }
        reader?.releaseLock();
      }
      if (!signal.aborted) await pause(BACKOFF_MS[Math.min(retry++, BACKOFF_MS.length - 1)]);
    }
  }

  try {
    await Promise.all([synchronize(), listen()]);
  } finally {
    signal.removeEventListener("abort", wakeWorker);
  }
}

// Run exactly the existing normal sync command. Credentials remain inherited
// environment values, never command-line arguments. Child output is suppressed
// because that script can print unsanitized upstream errors.
export function runLocalSyncChild(signal, {
  spawnProcess = spawn,
  graceMs = 30000,
  terminateMs = 5000,
} = {}) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let child;
    let graceTimer;
    let killTimer;
    let settled = false;
    const finish = (success) => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      clearTimeout(killTimer);
      signal.removeEventListener("abort", shutdown);
      if (success) resolve();
      else reject(new Error("Local sync process failed."));
    };
    const shutdown = () => {
      if (settled || graceTimer) return;
      graceTimer = setTimeout(() => {
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), terminateMs);
      }, graceMs);
    };
    try {
      child = spawnProcess(process.execPath, [fileURLToPath(new URL("../syncLocalDatabase.mjs", import.meta.url))], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0 || signal.aborted));
    signal.addEventListener("abort", shutdown, { once: true });
    if (signal.aborted) shutdown();
  });
}
