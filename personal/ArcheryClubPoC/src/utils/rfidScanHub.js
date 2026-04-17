import { getLatestRfidScan } from "../api/authApi";

const RFID_POLL_INTERVAL_MS = 1500;

const subscribers = new Set();
let intervalId = null;
let isPolling = false;
let lastSequence = 0;
let hasVisibilityListener = false;

async function pollLatestScan() {
  if (
    isPolling ||
    subscribers.size === 0 ||
    (typeof document !== "undefined" && document.hidden)
  ) {
    return;
  }

  isPolling = true;

  try {
    const result = await getLatestRfidScan();

    if (!result.scan?.rfidTag) {
      return;
    }

    if (result.scan.sequence <= lastSequence) {
      return;
    }

    lastSequence = result.scan.sequence;

    for (const subscriber of subscribers) {
      subscriber(result.scan);
    }
  } catch {
    return;
  } finally {
    isPolling = false;
  }
}

function handleVisibilityChange() {
  if (!document.hidden) {
    pollLatestScan();
  }
}

function startPolling() {
  if (intervalId || subscribers.size === 0) {
    return;
  }

  intervalId = window.setInterval(pollLatestScan, RFID_POLL_INTERVAL_MS);

  if (!hasVisibilityListener) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    hasVisibilityListener = true;
  }

  pollLatestScan();
}

function stopPolling() {
  if (subscribers.size > 0) {
    return;
  }

  if (intervalId) {
    window.clearInterval(intervalId);
    intervalId = null;
  }

  if (hasVisibilityListener) {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    hasVisibilityListener = false;
  }
}

export function subscribeToRfidScans(listener) {
  subscribers.add(listener);
  startPolling();

  return () => {
    subscribers.delete(listener);
    stopPolling();
  };
}
